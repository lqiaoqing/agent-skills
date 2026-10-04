"""Voice / vocals -> app/public/data/lyrics.json (word-level timings) for word-synced type.

Transcribes with faster-whisper (word timestamps). With --text (the known script or lyrics, one line per
line), the known words are aligned to the recognised ones and take their timings, so the display text is
exactly yours; unmatched words are interpolated between their matched neighbours.

  uv run --extra words python words.py path/to/voice_or_song.mp3 [--text lines.txt] [--model small] [--lang zh]

Chinese lyrics: every CJK character becomes its own word (timed by splitting whisper's chunks evenly and aligning to
your text character by character), so scenes can animate per character. Models download from Hugging Face on first
use; in mainland China set HF_ENDPOINT=https://hf-mirror.com (or HTTPS_PROXY) first.

Manual / synthetic timings without whisper: lyrics_tool.py (same folder) builds lyrics.json from an LRC file or from
"start<TAB>end<TAB>text" lines, spreading each line's time over its characters.

For sung vocals under a full mix, recognition is much better on an isolated vocal stem (Demucs: see
analyze_music.py --stems). The reference project used CTC forced alignment cross-checked with Whisper
(examples/pdoom/analysis/align.py); this is the lighter, portable version.
"""
import argparse
import difflib
import json
import re
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
# kinetic-lyric-mv: Chinese / Japanese / Korean support. CJK characters are separate "words" (one timing each, so the
# type can slam character by character); Latin runs stay whole words. norm() keeps CJK letters.
CJK = re.compile(r"[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]")
TOKEN = re.compile(r"[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]|[^\s\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\u3000-\u303f\uff00-\uffef]+")
norm = lambda w: re.sub(r"[^\w']", "", w.lower().replace("’", "'"))
try:  # traditional -> simplified when matching (display text is untouched); optional: uv run --with zhconv
    from zhconv import convert as _zh
    simp = lambda w: _zh(w, "zh-cn")
except ImportError:
    simp = lambda w: w


def tokens(line):
    """Display tokens of a known lyric line: each CJK char, each Latin word (punctuation glued to its word)."""
    return TOKEN.findall(line)


def split_cjk(words):
    """Whisper returns Chinese as multi-character chunks: split them into characters, sharing the chunk's time evenly."""
    out = []
    for w in words:
        toks = tokens(w["w"])
        if len(toks) <= 1 or not CJK.search(w["w"]):
            if toks: out.append({**w, "w": toks[0] if len(toks) == 1 else w["w"]})
            continue
        d = (w["end"] - w["start"]) / len(toks)
        for k, tk in enumerate(toks):
            out.append({**w, "w": tk, "start": round(w["start"] + k * d, 3), "end": round(w["start"] + (k + 1) * d, 3)})
    return out


def transcribe(path, model, lang=None):
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device="auto", compute_type="auto")
    segs, _ = m.transcribe(str(path), word_timestamps=True, vad_filter=True, language=lang)
    segs = list(segs)
    words = [{"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "conf": round(w.probability, 3)} for s in segs for w in (s.words or [])]
    words = split_cjk(words)
    lines = [[w for w in words if s.start - 1e-3 <= w["start"] < s.end + 1e-3] for s in segs]
    return words, [l for l in lines if l]


def align(known_lines, rec):
    kw = [(li, w) for li, line in enumerate(known_lines) for w in tokens(line)]
    sm = difflib.SequenceMatcher(a=[norm(simp(w)) for _, w in kw], b=[norm(simp(r["w"])) for r in rec], autojunk=False)
    timing = [None] * len(kw)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            r = rec[blk.b + k]
            timing[blk.a + k] = (r["start"], r["end"], r.get("conf", 1.0))
    # interpolate the gaps between matched neighbours
    for i, t in enumerate(timing):
        if t is None:
            j0 = next((j for j in range(i - 1, -1, -1) if timing[j]), None)
            j1 = next((j for j in range(i + 1, len(timing)) if timing[j]), None)
            a = timing[j0][1] if j0 is not None else (timing[j1][0] if j1 is not None else 0.0)
            b = timing[j1][0] if j1 is not None else a + 0.4
            span = (j1 if j1 is not None else i + 1) - (j0 if j0 is not None else i - 1) - 1
            pos = i - (j0 if j0 is not None else i - 1) - 1
            s = a + (b - a) * pos / max(1, span)
            timing[i] = (round(s, 3), round(s + max(0.12, (b - a) / max(1, span)), 3), 0.0)
    lines = []
    for li, text in enumerate(known_lines):
        ws = [{"w": w, "start": timing[i][0], "end": timing[i][1], "conf": timing[i][2]} for i, (l, w) in enumerate(kw) if l == li]
        if ws:
            lines.append({"text": text, "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws})
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--text", help="known lines (one per line) to align instead of the raw transcript")
    ap.add_argument("--model", default="small")
    ap.add_argument("--lang", default=None, help="language code (zh, en, ...); detected when omitted")
    a = ap.parse_args()
    words, seglines = transcribe(Path(a.audio), a.model, a.lang)
    if a.text:
        known = [l.strip() for l in Path(a.text).read_text(encoding="utf8").splitlines() if l.strip()]
        lines = align(known, words)
    else:
        join = lambda ws: "".join((("" if (i == 0 or CJK.match(w["w"]) and CJK.match(ws[i - 1]["w"])) else " ") + w["w"]) for i, w in enumerate(ws))
        lines = [{"text": join(l), "start": l[0]["start"], "end": l[-1]["end"], "words": l} for l in seglines]
    out = APP / "public/data/lyrics.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"lines": lines}, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out}: {len(lines)} lines, {sum(len(l['words']) for l in lines)} words")


if __name__ == "__main__":
    main()
