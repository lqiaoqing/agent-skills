// cast.js: characters, props and the Junk Hill set for 《豆豆和迷路的小星星》 (see ../STORYBOARD.md).
// Loaded after clawd.js and story.js, before the scene files.
const LS = {
  night: '#1F2A58', nightLo: '#3A4683', nightHi: '#2A3570', moon: '#F7E9BC', star: '#FFE07A', starLt: '#FFF4C4', starDk: '#E3A63A',
  hill: '#3B3F63', hillLt: '#545A86', junkA: '#7A6A8C', junkB: '#8C7560', junkC: '#5C7090', tire: '#2B2733', rust: '#C0703E',
  tin: '#A9BCCB', tinDk: '#6F8597', robot: '#E7A948', robotDk: '#A9722A', robotLt: '#F8D892', bulb: '#86E6F2', warm: '#FFB45E',
};
const DD = { col: LS.robot, dk: LS.robotDk, lt: LS.robotLt };   // Doudou's body colours (emotions(..., { base: DD }))

// talk(t, n, k) / speaking(t, n, k) come from src/story.js (generated): a flapping mouth while LINE(n, k) plays.

// 豆豆 Doudou: a little mustard tin robot (the Clawd body recoloured) with an antenna bulb, two rivets and a dial.
function doudou(x, y, u, o = {}) {
  const blink = .6 + .4 * Math.sin(T * 5.1);
  clawd(x, y, u, { seed: 5, col: DD.col, dk: DD.dk, lt: DD.lt, ...o, tint: o.tint,
    draw: (uu, sw) => {
      inkLine([[0, -8 * uu], [-.3 * uu, -9.3 * uu], [0, -10.4 * uu]], sw, PAL.ink, 'ink', .6);
      paint(ellPts(0, -11 * uu, .85 * uu, .85 * uu, 12), { wash: mixCol(LS.tinDk, LS.bulb, blink), sw: sw * .8 });
      paint(ellPts(-3.9 * uu, -2.8 * uu, .3 * uu, .3 * uu, 8), { wash: DD.dk, ink: null });
      paint(ellPts(3.9 * uu, -2.8 * uu, .3 * uu, .3 * uu, 8), { wash: DD.dk, ink: null });
      paint(ellPts(0, -1.3 * uu, .9 * uu, .9 * uu, 12), { wash: LS.tin, ink: PAL.ink, sw: sw * .6 });   // chest dial
      inkLine([[0, -1.3 * uu], [.5 * uu * Math.cos(T * 2), -1.3 * uu + .5 * uu * Math.sin(T * 2)]], sw * .6, PAL.ink, 'ink', 0);
      if (o.draw) o.draw(uu, sw);
    } });
}
function bulbGlow(x, y, u, a = 1) { glow(x, y - 11 * u, 3 * u, LS.bulb, a * (.45 + .25 * Math.sin(T * 5.1))); }

// 小星星 Little Star: a chubby five-pointed star with a face. o.face: 'happy' | 'sad' | 'cry' | 'wink' | 'O' | 'sleep';
// o.lit 0..1 = how bright she shines (dim when she's lost); o.mouth overrides the mouth ('open' while talking).
function littleStar(x, y, r, o = {}) {
  const lit = o.lit ?? 1, face = o.face || 'happy', rot = o.rot || 0, key = o.key || 'star';
  glow(x, y, r * (2.6 + 1.6 * lit), LS.star, .25 + .75 * lit);
  boilSeed(key);
  const body = mixCol('#B9A877', LS.star, .35 + .65 * lit);
  paint(starPts(x, y, r, .55, 5, -Math.PI / 2 + rot), { wash: body, fill: mixCol(body, LS.starDk, .5), fillOp: 70, bleed: .06, tex: .35, ink: PAL.ink, sw: clamp(r / 50, .5, 1.4), curv: .45 });
  paint(ellPts(x - r * .22, y - r * .3, r * .16, r * .09, 10, 0, -.6), { fill: '#FFFFFF', fillOp: 90 * lit, ink: null });
  if (r < 14) return;
  const ex = r * .2, ey = y - r * .02, er = r * .075, sw = clamp(r / 60, .5, 1.2);
  const eye = (cx, kind) => {
    if (kind === 'line') inkLine([[cx - er * 1.3, ey + er * .2], [cx, ey - er * .7], [cx + er * 1.3, ey + er * .2]], sw, PAL.ink, 'ink', .5);
    else if (kind === 'shut') inkLine([[cx - er * 1.3, ey], [cx, ey + er * .6], [cx + er * 1.3, ey]], sw, PAL.ink, 'ink', .5);
    else paint(ellPts(cx, ey, er, er * 1.25, 10), { wash: PAL.ink, ink: null });
  };
  const L = face === 'happy' ? 'line' : face === 'cry' || face === 'sleep' ? 'shut' : 'dot', R = face === 'wink' ? 'line' : L;
  eye(x - ex, L); eye(x + ex, R);
  if (face === 'sad' || face === 'cry') {   // worried brows
    inkLine([[x - ex - er * 1.4, ey - er * 2.4], [x - ex + er * 1.2, ey - er * 3.1]], sw * .8, PAL.ink, 'ink', 0);
    inkLine([[x + ex + er * 1.4, ey - er * 2.4], [x + ex - er * 1.2, ey - er * 3.1]], sw * .8, PAL.ink, 'ink', 0);
  }
  paint(ellPts(x - ex * 1.7, ey + r * .14, r * .09, r * .05, 8), { wash: PAL.rose || '#E88A9A', ink: null });
  paint(ellPts(x + ex * 1.7, ey + r * .14, r * .09, r * .05, 8), { wash: PAL.rose || '#E88A9A', ink: null });
  const my = y + r * .2, mouth = o.mouth || ({ happy: 'smile', wink: 'smile', sad: 'frown', cry: 'wail', O: 'O', sleep: 'o' })[face];
  if (mouth === 'smile') inkLine([[x - r * .1, my], [x, my + r * .06], [x + r * .1, my]], sw, PAL.ink, 'ink', .5);
  else if (mouth === 'frown') inkLine([[x - r * .09, my + r * .05], [x, my], [x + r * .09, my + r * .05]], sw, PAL.ink, 'ink', .5);
  else if (mouth === 'open' || mouth === 'wail' || mouth === 'O') paint(ellPts(x, my + r * .02, r * (mouth === 'wail' ? .1 : .07), r * (mouth === 'O' ? .09 : .07), 10), { wash: '#7A2E3A', ink: PAL.ink, sw: sw * .7 });
  else paint(ellPts(x, my + r * .02, r * .04, r * .04, 8), { wash: PAL.ink, ink: null });
  if (face === 'cry') for (const s of [-1, 1]) {   // two tear streams with a drop sliding down each
    const d = frac(T * .9 + (s > 0 ? .5 : 0));
    paint(ellPts(x + s * ex, ey + er * 2 + d * r * .5, r * .035, r * .06, 8), { wash: '#9FD3F0', ink: null });
  }
}

// ---------- props ----------
function tire(x, y, s, key) {
  boilSeed(key);
  paint(ellPts(x, y, 70 * s, 26 * s, 20), { wash: LS.tire, ink: PAL.ink, sw: .9 });
  paint(ellPts(x, y - 4 * s, 34 * s, 10 * s, 14), { wash: '#15131C', ink: null });
}
function can(x, y, s, rot = 0, col = LS.tin, key = 'can') {
  boilSeed(key);
  push(); translate(x, y); rotate(rot);
  paint(rrPts(-14 * s, -34 * s, 28 * s, 34 * s, 3 * s), { wash: col, fill: mixCol(col, PAL.ink, .25), fillOp: 60, bleed: .05, ink: PAL.ink, sw: .7 });
  paint(rectPts(-14 * s, -24 * s, 28 * s, 10 * s), { wash: mixCol(col, LS.rust, .55), ink: null });
  pop();
}
function tvBox(x, y, s, key = 'tv') {
  boilSeed(key);
  paint(rrPts(x - 60 * s, y - 90 * s, 120 * s, 90 * s, 10 * s, 2), { wash: LS.junkB, fill: '#5E4A3A', fillOp: 80, ink: PAL.ink, sw: 1 });
  paint(rrPts(x - 45 * s, y - 78 * s, 72 * s, 60 * s, 12 * s), { wash: '#5D7C86', fill: '#3D5560', fillOp: 90, ink: PAL.ink, sw: .8 });
  inkLine([[x - 20 * s, y - 90 * s], [x - 40 * s, y - 120 * s]], .8); inkLine([[x + 5 * s, y - 90 * s], [x + 25 * s, y - 118 * s]], .8);
}
function wheel(x, y, r, spin = 0, key = 'wheel') {
  boilSeed(key);
  paint(ellPts(x, y, r, r * .35, 22), { wash: '#3A3646', ink: PAL.ink, sw: .9 });
  paint(ellPts(x, y, r * .82, r * .27, 22), { wash: LS.night, ink: null });
  for (let i = 0; i < 4; i++) { const a = spin + i * Math.PI / 4; inkLine([[x - Math.cos(a) * r * .8, y - Math.sin(a) * r * .26], [x + Math.cos(a) * r * .8, y + Math.sin(a) * r * .26]], .5, LS.tin, 'inkfine', 0); }
}
function crate(x, y, s, key = 'crate') {
  boilSeed(key);
  paint(rectPts(x - 55 * s, y - 70 * s, 110 * s, 70 * s, 2), { wash: '#B08A5A', fill: '#7E5E3A', fillOp: 80, bleed: .05, ink: PAL.ink, sw: 1 });
  inkLine([[x - 55 * s, y - 70 * s], [x + 55 * s, y]], .7); inkLine([[x + 55 * s, y - 70 * s], [x - 55 * s, y]], .7);
}
function coilSpring(x, y, s, key = 'spring') {
  boilSeed(key);
  const P = []; for (let i = 0; i <= 14; i++) P.push([x + (i % 2 ? 22 : -22) * s, y - i * 6 * s]);
  inkLine(P, 1.1, LS.tinDk, 'ink', .7);
}

// ---------- the set ----------
function nightSky(t, o = {}) {
  const warm = o.warm || 0, key = o.key || 'sky';
  boilSeed(key);
  paint(rectPts(-300, -300, W + 600, H + 600), { wash: mixCol(LS.night, '#3A2E62', warm * .6), ink: null });
  paint(ellPts(W / 2, H + 80, W, 560, 24), { fill: mixCol(LS.nightLo, '#8A5A7A', warm), fillOp: 140, bleed: .25, tex: .5, border: .2, ink: null });
  if (o.moon !== false) {
    const [mx, my, mr] = o.moonAt || [1560, 210, 70];
    glow(mx, my, mr * 3.4, LS.moon, .45);
    boilSeed(key + 'moon'); paint(ellPts(mx, my, mr, mr, 22), { wash: LS.moon, fill: '#E8D49A', fillOp: 70, bleed: .1, ink: PAL.ink, sw: .8 });
  }
  const n = o.stars ?? 30, lit = o.lit;
  for (let i = 0; i < n; i++) {
    const x = hash(i * 3.1 + 9) * W, y = hash(i * 7.7 + 2) * (o.starY || 620), tw = .55 + .45 * Math.sin(t * (1.3 + hash(i) * 2) + i * 2);
    const hi = lit ? lit(i) : 0;
    glow(x, y, 9 + 10 * tw * hash(i * 2.3) + 26 * hi, LS.star, .65 * tw + .35 * hi);
  }
}
// Junk Hill: a lumpy mound with tyres, cans and a TV sticking out; the top is at (cx, top).
function junkHill(t, cx = 960, top = 640, key = 'hill') {
  boilSeed(key + 'far'); paint(ellPts(cx + 640, top + 330, 820, 230, 22, 8), { wash: '#2C3157', ink: null });
  boilSeed(key + 'near');
  paint([[cx - 1100, H + 200], [cx - 700, top + 190], [cx - 330, top + 60], [cx - 90, top], [cx + 160, top + 20], [cx + 480, top + 120], [cx + 900, top + 230], [cx + 1300, H + 200]],
    { wash: LS.hill, fill: LS.hillLt, fillOp: 80, bleed: .08, tex: .6, ink: PAL.ink, sw: 1.1, curv: .45 });
  // junk embedded in the slope (cheap: one fill each)
  const bits = [[-520, 150, LS.junkA, 70, 24, .3], [-260, 70, LS.junkC, 54, 20, -.2], [300, 85, LS.junkB, 64, 22, .15], [560, 170, LS.junkA, 80, 26, -.1], [40, 120, LS.rust, 40, 15, .5]];
  bits.forEach(([dx, dy, c, rx, ry, rot], i) => { boilSeed(key + 'b' + i); paint(ellPts(cx + dx, top + dy, rx, ry, 12, 4, rot), { wash: c, ink: PAL.ink, sw: .6 }); });
  can(cx - 420, top + 128, 1.1, -.5, LS.tin, key + 'c1'); can(cx + 420, top + 118, 1, .4, '#C8B07A', key + 'c2');
  tvBox(cx + 210, top + 70, .7, key + 'tv');
}
