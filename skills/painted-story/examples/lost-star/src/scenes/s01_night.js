// s01_night.js · scene 1 废品山的夜: establishing wide, then Doudou counting stars. Times from story.js (SCENE/LINE).
(() => {
  const S = SCENE(1);
  // 1a · wide: night over Junk Hill, tiny Doudou on a tyre at the top; iris in, slow push
  function wide(t, lt, dur) {
    camBegin(960, 520 + 30 * seg(lt, 0, dur), 1 + .05 * seg(lt, 0, dur));
    nightSky(t, { key: 'skyA' });
    junkHill(t, 960, 700, 'hillA');
    tire(960, 712, .9, 'tireA');
    const m = emotions(t, [[0, 'hopeful', { lookY: -1, emote: null }]], { base: DD });
    bulbGlow(960, 700, 9);
    doudou(960, 700, 9, { ...m, view: 'q', boilKey: 'ddA' });
    camEnd();
    if (lt < .9) iris(960, 600, lerp(0, 1500, easeIn(lt / .9)));
  }
  // 1b · medium: he points from star to star; each one he points at flares up
  function counting(t, lt, dur) {
    camBegin(900 + 20 * Math.sin(lt * .6), 470, 1.08);
    const k = Math.floor(lt / .55), targets = [3, 11, 17, 6, 22, 9];
    nightSky(t, { key: 'skyB', moonAt: [1640, 180, 60], lit: i => i === targets[k % targets.length] ? Math.exp(-frac(lt / .55) * 2.5) : 0 });
    boilSeed('hillB'); paint(ellPts(900, 1130, 1200, 360, 30, 6), { wash: LS.hill, fill: LS.hillLt, fillOp: 80, bleed: .1, tex: .6, ink: PAL.ink, sw: 1 });
    tire(900, 812, 2.1, 'tireB');
    const tg = targets[k % targets.length], sx = hash(tg * 3.1 + 9) * W, sy = hash(tg * 7.7 + 2) * 620;
    const ang = Math.atan2(sy - 640, sx - 900);   // arm points toward the flaring star
    const m = emotions(t, [[0, 'hopeful', { lookY: -1 }], [LINE(1, 1).t0 + 1.4, 'happy', { lookY: -.9, emote: null }]], { base: DD });
    bulbGlow(900, 790, 21);
    doudou(900, 790, 21, { ...m, view: 'q', lookX: Math.cos(ang) * .8, aR: 1.6 + .25 * Math.sin(ang * 2), aL: .1, boilKey: 'ddB' });
    camEnd();
  }
  shots([[S.t0, wide], [LINE(1, 1).t0 - .25, counting]]);
})();
