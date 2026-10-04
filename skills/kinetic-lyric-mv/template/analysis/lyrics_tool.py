"""Timed lines -> app/public/data/lyrics.json without speech recognition (kinetic-lyric-mv addition).

Use it when you already have line timings (an LRC from a lyrics site / music app, or a hand-made TSV), when whisper
cannot hear the vocal, or to fake timings for a draft. Each line's time is spread over its words; every CJK character
is its own word (Latin words stay whole), weighted so a Latin word counts like ~2 characters.

  python lyrics_tool.py song.lrc                 # [mm:ss.xx]line ... (an empty timestamped line ends the previous one)
  python lyrics_tool.py lines.tsv                # start<TAB>end<TAB>text   (seconds or mm:ss.xx)
  python lyrics_tool.py song.lrc --shift -0.12 --fill 0.85 [--out ../app/public/data/lyrics.json]

--fill: fraction of each line's slot that is sung (the rest is the held last syllable / breath), default 0.85.
Only the standard library is needed (runs with plain `python`, no uv).
"""
import argparse
import json
import re
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
CJK = r"\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff"
TOKEN = re.compile(rf"[{CJK}]|[^\s{CJK}\u3000-\u303f\uff00-\uffef]+")


def clock(s):
    p = s.strip().replace(",", ".").split(":")
    v = 0.0
    for x in p:
        v = v * 60 + float(x)
    return v


def read(path):
    text = Path(path).read_text(encoding="utf-8-sig")
    rows = []
    if re.search(r"^\s*\[\d+:\d+", text, re.M):
        for raw in text.splitlines():
            tags = re.findall(r"\[(\d+:\d+(?:[.:]\d+)?)\]", raw)
            body = re.sub(r"\[[^\]]*\]", "", raw).strip()
            for tg in tags:
                mm, rest = tg.split(":", 1)
                rows.append([int(mm) * 60 + float(rest.replace(":", ".")), None, body])
        rows.sort(key=lambda r: r[0])
        out = []
        for r in rows:
            if not r[2]:
                if out and out[-1][1] is None:
                    out[-1][1] = r[0]
                continue
            out.append(r)
        rows = out
    else:
        for raw in text.splitlines():
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            c = raw.split("\t")
            if len(c) >= 3:
                rows.append([clock(c[0]), clock(c[1]), "\t".join(c[2:]).strip()])
            elif len(c) == 2:
                rows.append([clock(c[0]), None, c[1].strip()])
    for i, r in enumerate(rows):  # untimed ends: up to the next line (minus a breath), at most 6 s
        if r[1] is None:
            nxt = rows[i + 1][0] if i + 1 < len(rows) else r[0] + 4
            r[1] = min(nxt - 0.05, r[0] + 6)
    return rows


def build(rows, shift=0.0, fill=0.85):
    lines = []
    for a, b, text in rows:
        a, b = a + shift, b + shift
        toks = TOKEN.findall(text)
        if not toks:
            continue
        wt = [1.0 if re.match(rf"[{CJK}]", t) else max(1.0, min(3.0, len(t) / 2.5)) for t in toks]
        sung = (b - a) * fill
        tot, acc, words = sum(wt), 0.0, []
        for t, w in zip(toks, wt):
            s = a + sung * acc / tot
            acc += w
            e = a + sung * acc / tot
            words.append({"w": t, "start": round(s, 3), "end": round(e, 3), "conf": 1.0})
        words[-1]["end"] = round(b, 3)  # the last word holds to the end of the slot
        lines.append({"text": text, "start": round(a, 3), "end": round(b, 3), "words": words})
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lyrics", help=".lrc or .tsv")
    ap.add_argument("--shift", type=float, default=0.0, help="seconds added to every time (+ = later)")
    ap.add_argument("--fill", type=float, default=0.85)
    ap.add_argument("--out", default=str(APP / "public/data/lyrics.json"))
    a = ap.parse_args()
    lines = build(read(a.lyrics), a.shift, a.fill)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps({"lines": lines}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {a.out}: {len(lines)} lines, {sum(len(l['words']) for l in lines)} words")


if __name__ == "__main__":
    main()
