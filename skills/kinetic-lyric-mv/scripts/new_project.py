"""Scaffold a super-motion-graphics project.

  python new_project.py <dir> [--title "My video"] [--audio track.mp3 [--stems] [--bpm N]] [--bpm 120 --duration 20] [--no-install]
                        [--lyrics song.lrc|lines.tsv]            (timed lines -> per-character lyrics.json, no whisper)
                        [--words lines.txt [--lang zh]]          (plain lyrics aligned with faster-whisper)

kinetic-lyric-mv: Windows-safe (no symlinks, no shell scripts; bun/uv are run through the shell on Windows).
Downloads honour HTTPS_PROXY (set it to your local proxy, e.g. http://127.0.0.1:7890, if GitHub/PyPI/npm are slow).

Creates:
  <dir>/app/        the engine (three.js + Vite + bun), starter scenes, timeline, offline renderer
  <dir>/analysis/   music / voice analysis (uv)
  <dir>/docs/       TREATMENT.md (from the template, fill it in first) and ENGINE.md (the scene API)
  <dir>/out/        renders (stills, sheets, videos)
Then runs `bun install` and writes app/public/data/audio.json: analysed from --audio (uv + librosa),
or a silent constant-tempo grid from --bpm/--duration.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL / "template"


def run(cmd, cwd):
    print("$", " ".join(map(str, cmd)))
    subprocess.run([str(c) for c in cmd], cwd=cwd, check=True, shell=(sys.platform == "win32" and cmd[0] in ("bun", "uv")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--title", default="super motion graphics")
    ap.add_argument("--audio")
    ap.add_argument("--stems", action="store_true")
    ap.add_argument("--bpm", type=float, default=None, help="silent: grid tempo (default 120); with --audio: force the analysed tempo")
    ap.add_argument("--duration", type=float, default=12)
    ap.add_argument("--no-install", action="store_true")
    ap.add_argument("--lyrics", help="timed lyrics (.lrc or start<TAB>end<TAB>text .tsv) -> app/public/data/lyrics.json")
    ap.add_argument("--words", help="plain lyrics text (one line per line) to align with faster-whisper (needs --audio)")
    ap.add_argument("--lang", help="language for --words (zh, en, ...)")
    a = ap.parse_args()

    dst = Path(a.dir).resolve()
    if (dst / "app").exists():
        sys.exit(f"{dst / 'app'} already exists: pick an empty folder")
    dst.mkdir(parents=True, exist_ok=True)
    ignore = shutil.ignore_patterns("node_modules", ".venv", "__pycache__", "qa.png")
    shutil.copytree(TEMPLATE / "app", dst / "app", ignore=ignore)
    shutil.copytree(TEMPLATE / "analysis", dst / "analysis", ignore=ignore)
    (dst / "docs").mkdir(exist_ok=True)
    shutil.copyfile(SKILL / "reference/TREATMENT-TEMPLATE.md", dst / "docs/TREATMENT.md")
    shutil.copyfile(SKILL / "reference/ENGINE.md", dst / "docs/ENGINE.md")
    (dst / "out").mkdir(exist_ok=True)
    shutil.copyfile(SKILL / "LICENSE", dst / "LICENSE.engine")
    (dst / ".gitignore").write_text("node_modules/\n.vite/\nout/\nanalysis/.venv/\nanalysis/__pycache__/\nanalysis/qa.png\n")
    html = dst / "app/index.html"
    html.write_text(html.read_text(encoding="utf8").replace("<title>super motion graphics</title>", f"<title>{a.title}</title>"), encoding="utf8")

    if not a.no_install:
        run(["bun", "install"], dst / "app")
    if a.audio:
        track = Path(a.audio).resolve()
        run(["uv", "run", "--project", ".", *(["--extra", "stems"] if a.stems else []), "python", "analyze_music.py", track, *(["--stems"] if a.stems else []), *(["--bpm", a.bpm] if a.bpm else [])], dst / "analysis")
    else:
        run([sys.executable, "beatgrid.py", "--bpm", a.bpm or 120, "--duration", a.duration], dst / "analysis")
    if a.lyrics:
        run([sys.executable, "lyrics_tool.py", Path(a.lyrics).resolve()], dst / "analysis")
    elif a.words and a.audio:
        run(["uv", "run", "--project", ".", "--extra", "words", "--with", "zhconv", "python", "words.py", Path(a.audio).resolve(), "--text", Path(a.words).resolve(), *(["--lang", a.lang] if a.lang else [])], dst / "analysis")
    app = dst / "app"
    print(f"\nready: {dst}\n  preview:  cd \"{app}\" && bun x vite     (http://localhost:5173)\n"
          f"  gpu:      cd \"{app}\" && node scripts/render.ts gpu      (must name your GPU, not SwiftShader)\n"
          f"  stills:   cd \"{app}\" && node scripts/render.ts stills --t 1,4,8 --out ../out/stills\n"
          f"  video:    cd \"{app}\" && node scripts/render.ts video --out ../out/video.mp4            (default --profile low: 720p30)\n"
          f"  final:    cd \"{app}\" && node scripts/render.ts video --profile mid --out ../out/final.mp4  (1080p30; --profile high = upstream 1080p60)")


if __name__ == "__main__":
    main()
