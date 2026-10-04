import { hexToLinear } from './util';

// PROJECT PALETTE: edit the hex values, keep the keys. The keys are roles used everywhere (GLSL consts
// C_INK, C_BONE, C_SIGNAL…, LIN.* for GL, rgba('signal') for Canvas2D). Restraint is the look: one dark,
// one light, ONE signal/accent colour (+ its hot/deep variants), and at most one rare extra accent.
// Defaults are the reference project's (examples/pdoom/TREATMENT.md).
export const HEX = {
  ink: '#0A0A0B', // background black (slightly warm)
  ink2: '#151517', // raised black (panels, paper-in-the-dark)
  graphite: '#5E5B57', // dim lines, secondary text
  ash: '#9C978F', // mid grey
  bone: '#EEE9DF', // paper white, primary text
  signal: '#FF4D12', // THE accent: the one colour that glows (only signal/ember exceed ~0.85 linear)
  ember: '#FF8A3D', // hotter, lighter orange for cores/highlights
  blood: '#C21D0B', // deep red-orange for shadows of signal
  acid: '#D8FF3C', // rare second accent: one moment only, or never
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
