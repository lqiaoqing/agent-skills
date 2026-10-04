// Output resolution multiplier, read once from the page URL (`?scale=2` renders 3840x2160).
// Scenes keep laying out in logical 1920x1080 px; the engine renders at SCALE x that.
// Kept in its own module so glsl/common.ts can use it without an import cycle through gl.ts.
// kinetic-lyric-mv: scales below 1 are allowed for low-spec machines (integrated GPUs):
//   ?scale=0.6667 -> 1280x720, ?scale=0.5 -> 960x540. Above 1 it stays an integer (2 = 4K), as upstream.
function readScale() {
  if (typeof location === 'undefined') return 1;
  const raw = Number(new URLSearchParams(location.search).get('scale') ?? '1');
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  if (raw < 1) return Math.max(0.25, raw);
  return Math.min(Math.round(raw), 4);
}

/** Physical pixels per logical pixel of the output (0.25..1 fractional, or integer 1..4; default 1). */
export const SCALE = readScale();
