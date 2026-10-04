"""Any soundtrack -> app/public/data/audio.json (the engine's AudioJSON), and a copy of the track in
app/public/audio/.

  * constant-tempo beat grid (tempo from librosa, phase fitted by least squares over the tracked beats,
    extended over the whole track), downbeats (the bar phase whose beats carry the most low-end attack),
  * sections: agglomerative segmentation of beat-synced chroma+MFCC, snapped to downbeats,
  * 100 fps envelopes normalised 0..1: rms, low (<150 Hz), mid (150 Hz-2 kHz), high (>4 kHz), and
    drums / bass / vocal / other. With --stems (Demucs) these come from real stems; without, drums =
    percussive part (HPSS), other = harmonic part, bass = low band, vocal = harmonic mid band (approximate).
  * onsets [[t, strength], ...]: kick (low band), snare (mid percussive), hat (high band), vocal.

A generalisation of the reference project's analysis (examples/pdoom/analysis/analyze.py), which was
hand-tuned to one song (bar-numbered section map, stem timing offsets). Check the result: the QA sheet
(--plot) and the preview's beat counter against the music; if bar 1 lands on the wrong beat
(common with a kick on every beat) rerun with --downbeat-offset N. Hand-edit `sections` names if you like.

  uv run python analyze_music.py path/to/track.mp3 [--stems] [--sections N] [--plot]
"""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import librosa
from scipy.signal import butter, sosfiltfilt, find_peaks

HERE = Path(__file__).resolve().parent
APP = HERE.parent / "app"
SR = 44100
FPS = 100
HOP = SR // FPS


def band(y, lo=None, hi=None):
    if lo and hi:
        sos = butter(4, [lo, hi], btype="band", fs=SR, output="sos")
    elif hi:
        sos = butter(4, hi, btype="low", fs=SR, output="sos")
    else:
        sos = butter(4, lo, btype="high", fs=SR, output="sos")
    return sosfiltfilt(sos, y)


def env(y, n):
    """Frame RMS at FPS, normalised to 0..1 by the 99th percentile."""
    r = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP, center=True)[0][:n]
    r = np.pad(r, (0, max(0, n - len(r))))
    p = np.percentile(r, 99) or 1.0
    return np.clip(r / p, 0, 1)


def onsets(y, n, delta=0.07, wait=0.09):
    """Onset times + 0..1 strength from a (band-limited) signal."""
    o = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    o = o / (np.percentile(o, 99.5) or 1.0)
    pk, _ = find_peaks(o, height=0.25, distance=max(1, int(wait * FPS)), prominence=delta)
    return [[round(float(i) / FPS, 3), round(float(min(1.0, o[i])), 3)] for i in pk if i < n]


def beat_grid(y, duration):
    tempo, bt = librosa.beat.beat_track(y=y, sr=SR, hop_length=HOP, units="time", tightness=120)
    bt = np.asarray(bt, dtype=float)
    tempo = float(np.atleast_1d(tempo)[0])
    if len(bt) < 8:
        period = 60.0 / (tempo or 120.0)
        phase = bt[0] if len(bt) else 0.0
    else:
        period = float(np.median(np.diff(bt)))
        k = np.round((bt - bt[0]) / period)
        A = np.vstack([k, np.ones_like(k)]).T
        period, phase = np.linalg.lstsq(A, bt, rcond=None)[0]
    phase = phase % period
    beats = np.arange(phase, duration, period)
    return beats, 60.0 / period


def downbeat_phase(beats, low_env, per_bar=4):
    """The bar phase whose beats sit on the strongest low-end attacks (kick on 1)."""
    score = []
    for o in range(per_bar):
        idx = np.clip((beats[o::per_bar] * FPS).astype(int), 0, len(low_env) - 1)
        score.append(float(np.mean(low_env[idx])) if len(idx) else 0.0)
    return int(np.argmax(score))


def sections(y, beats, downbeats, duration, k):
    if len(beats) < 16:
        return [{"name": "main", "start": 0.0, "end": duration}]
    bf = librosa.time_to_frames(beats, sr=SR, hop_length=HOP)
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    mfcc = librosa.feature.mfcc(y=y, sr=SR, hop_length=HOP, n_mfcc=13)
    feat = np.vstack([librosa.util.normalize(chroma, axis=1), librosa.util.normalize(mfcc, axis=1)])
    sync = librosa.util.sync(feat, bf, aggregate=np.median)
    k = max(2, min(k, sync.shape[1] // 8))
    bounds = librosa.segment.agglomerative(sync, k)
    times = sorted({0.0, *[float(beats[min(b, len(beats) - 1)]) for b in bounds[1:]]})
    # snap to the nearest downbeat, drop sections shorter than 2 bars
    db = np.asarray(downbeats)
    snapped = [0.0]
    for t in times[1:]:
        s = float(db[np.argmin(np.abs(db - t))]) if len(db) else t
        if s - snapped[-1] >= 2 * 4 * (beats[1] - beats[0]):
            snapped.append(s)
    edges = snapped + [duration]
    return [{"name": f"sec{i + 1}", "start": round(edges[i], 3), "end": round(edges[i + 1], 3)} for i in range(len(edges) - 1)]


def demucs_stems(path):
    """Run Demucs (htdemucs) and return {drums,bass,vocals,other} mono arrays at SR, or None."""
    try:
        import subprocess, tempfile
        out = Path(tempfile.mkdtemp(prefix="smg-demucs-"))
        subprocess.run(["demucs", "-n", "htdemucs", "-o", str(out), str(path)], check=True)
        d = next(out.glob("htdemucs/*"))
        return {s: librosa.load(d / f"{s}.wav", sr=SR, mono=True)[0] for s in ["drums", "bass", "vocals", "other"]}
    except Exception as e:  # noqa: BLE001
        print(f"[stems] Demucs unavailable ({e}); using HPSS approximations")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("track")
    ap.add_argument("--stems", action="store_true", help="separate with Demucs (needs the 'stems' extra)")
    ap.add_argument("--sections", type=int, default=0, help="target section count (default: ~1 per 20 s)")
    ap.add_argument("--beats-per-bar", type=int, default=4)
    ap.add_argument("--plot", action="store_true", help="write analysis/qa.png")
    ap.add_argument("--downbeat-offset", type=int, default=None, help="force which beat (0..3) starts bar 1, when the guess is off (e.g. a kick on every beat)")
    a = ap.parse_args()

    src = Path(a.track).resolve()
    y, _ = librosa.load(src, sr=SR, mono=True)
    duration = len(y) / SR
    n = int(np.ceil(duration * FPS))
    print(f"{src.name}: {duration:.2f}s")

    low, mid, high = band(y, hi=150), band(y, 150, 2000), band(y, lo=4000)
    stems = demucs_stems(src) if a.stems else None
    if stems:
        drums, bass, vocal, other = stems["drums"], stems["bass"], stems["vocals"], stems["other"]
    else:
        harm, perc = librosa.effects.hpss(y)
        drums, other, bass, vocal = perc, harm, low, band(harm, 200, 3500)

    feats = {"rms": env(y, n), "low": env(low, n), "mid": env(mid, n), "high": env(high, n),
             "drums": env(drums, n), "bass": env(bass, n), "vocal": env(vocal, n), "other": env(other, n)}

    beats, bpm = beat_grid(y, duration)
    ph = downbeat_phase(beats, feats["low"], a.beats_per_bar)
    if a.downbeat_offset is not None:
        ph = a.downbeat_offset % a.beats_per_bar
    downbeats = beats[ph:: a.beats_per_bar]
    secs = sections(y, beats, downbeats, duration, a.sections or max(2, round(duration / 20)))

    perc_src = drums
    ons = {
        "kick": onsets(band(perc_src, hi=120), n, wait=0.12),
        "snare": onsets(band(perc_src, 180, 3000), n, wait=0.12),
        "hat": onsets(band(perc_src, lo=6000), n, wait=0.06),
        "vocal": onsets(vocal, n, wait=0.15),
    }

    (APP / "public/audio").mkdir(parents=True, exist_ok=True)
    dst = APP / "public/audio" / src.name
    if dst.resolve() != src:
        shutil.copyfile(src, dst)
    data = {
        "file": src.name,
        "duration": round(duration, 4),
        "bpm": round(float(bpm), 3),
        "fps": FPS,
        "beats": [round(float(b), 4) for b in beats],
        "downbeats": [round(float(b), 4) for b in downbeats],
        "sections": secs,
        "features": {k: [round(float(x), 3) for x in v] for k, v in feats.items()},
        "onsets": ons,
    }
    out = APP / "public/data/audio.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data), encoding="utf-8")
    print(f"wrote {out}\n  {bpm:.2f} BPM, {len(beats)} beats, {len(downbeats)} bars, sections: "
          + ", ".join(f"{s['name']}@{s['start']:.1f}" for s in secs)
          + "\n  onsets: " + ", ".join(f"{k} {len(v)}" for k, v in ons.items()))

    if a.plot:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        t = np.arange(n) / FPS
        fig, ax = plt.subplots(3, 1, figsize=(18, 8), sharex=True)
        for k in ["rms", "low", "high"]:
            ax[0].plot(t, feats[k], lw=0.6, label=k)
        ax[0].legend(loc="upper right")
        for k, c in [("kick", "r"), ("snare", "b"), ("hat", "g")]:
            ax[1].vlines([o[0] for o in ons[k]], 0, [o[1] for o in ons[k]], colors=c, lw=0.6, label=k)
        ax[1].legend(loc="upper right")
        ax[2].vlines(beats, 0, 0.5, colors="k", lw=0.4)
        ax[2].vlines(downbeats, 0, 1, colors="r", lw=0.8)
        for s in secs:
            ax[2].text(s["start"], 1.05, s["name"], fontsize=8)
        fig.tight_layout()
        fig.savefig(HERE / "qa.png", dpi=110)
        print(f"  QA plot: {HERE / 'qa.png'}")


if __name__ == "__main__":
    main()
