"""Silent project -> app/public/data/audio.json: a constant-tempo beat grid, no soundtrack.

Scenes still get f.beat / f.bar / beatPhase and the timeline can cut on beats; audio envelopes and
hits are zero. Add a track later with analyze_music.py (it overwrites this file).

  python beatgrid.py --bpm 120 --duration 20 [--beats-per-bar 4] [--offset 0]
"""
import argparse
import json
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bpm", type=float, default=120)
    ap.add_argument("--duration", type=float, default=20)
    ap.add_argument("--beats-per-bar", type=int, default=4)
    ap.add_argument("--offset", type=float, default=0, help="time of the first beat (s)")
    ap.add_argument("--out", default=str(APP / "public/data/audio.json"))
    a = ap.parse_args()
    period = 60 / a.bpm
    beats, t = [], a.offset
    while t < a.duration - 1e-6:
        beats.append(round(t, 4))
        t += period
    downbeats = beats[:: a.beats_per_bar]
    data = {
        "file": None,
        "duration": a.duration,
        "bpm": a.bpm,
        "fps": 100,
        "beats": beats,
        "downbeats": downbeats,
        "sections": [{"name": "main", "start": 0, "end": a.duration}],
        "features": {},
        "onsets": {},
    }
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data), encoding="utf-8")
    print(f"wrote {out}: {len(beats)} beats at {a.bpm} BPM over {a.duration}s (silent)")


if __name__ == "__main__":
    main()
