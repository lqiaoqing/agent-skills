// s02_fall.js · scene 2 掉下来的光: a star streaks down into the can pile; Doudou runs over and digs.
(() => {
  const S = SCENE(2), L0 = LINE(2, 0), L1 = LINE(2, 1);
  const land = L0.t0 + 1.3;   // she lands on "掉下来"
  function fall(t, lt, dur) {
    const shake = t > land ? shakeXY(t, 14 * Math.exp(-(t - land) * 6)) : [0, 0];
    camBegin(960 + shake[0], 520 + shake[1], 1.02);
    nightSky(t, { key: 'skyC' });
    junkHill(t, 760, 720, 'hillC');
    // the can pile on the right
    for (let i = 0; i < 7; i++) can(1280 + (i % 4) * 46 - (i > 3 ? -23 : 0), 820 - (i > 3 ? 32 : 0), 1.1, (hash(i) - .5) * .6, i % 2 ? LS.tin : '#C8B07A', 'pileC' + i);
    const k = seg(t, L0.t0 + .1, land), P = arcPt([260, -60], [1350, 790], -90, easeIn(k));
    if (t < land) {
      for (let i = 1; i < 7; i++) { const q = arcPt([260, -60], [1350, 790], -90, easeIn(Math.max(0, k - i * .03))); glow(q[0], q[1], 46 - i * 6, LS.star, .85 - i * .11); }
      if (k > 0) littleStar(P[0], P[1], 26, { face: 'O', rot: t * 9, key: 'fallStar' });
    } else {
      const a = t - land;
      glow(1350, 790, 300 * Math.exp(-a * 2) + 90, LS.star, .9 - .4 * seg(a, 0, 1));
      for (let i = 0; i < 4; i++) {   // cans pop out of the pile
        const q = arcPt([1340, 790], [1100 + i * 170, 860], 220 + 60 * hash(i), easeOut(seg(a, 0, .7)));
        can(q[0], q[1], 1, a * 8 * (i % 2 ? 1 : -1), i % 2 ? LS.tin : '#C8B07A', 'popC' + i);
      }
      sfx('咚!', 1380, 640, 150, PAL.ochre, a, { life: 1 });
    }
    const m = emotions(t, [[0, 'hopeful', { lookY: -1, lookX: -.6 }], [L0.t0 + .3, 'surprised', { lookX: .2, lookY: -.8 }], [land + .05, 'surprised', { lookX: 1 }]], { base: DD, take: .9 });
    bulbGlow(700, 734, 13);
    doudou(700, 734, 13, { ...m, view: 'q', boilKey: 'ddC' });
    camEnd();
  }
  // 2b · he runs in and digs; cans fly out behind him; a glow under the pile; "哎呀，你没事吧？"
  function dig(t, lt, dur) {
    camBegin(1000, 560, 1.18);
    nightSky(t, { key: 'skyD', stars: 18, moon: false });
    boilSeed('groundD'); paint(rectPts(-300, 820, W + 600, 500, 4), { wash: LS.hill, ink: null });
    glow(1150, 840, 220 + 30 * Math.sin(t * 7), LS.star, .75);
    for (let i = 0; i < 9; i++) can(980 + (i % 5) * 52, 880 - Math.floor(i / 5) * 34, 1.3, (hash(i * 3) - .5) * .7, i % 3 ? LS.tin : '#C8B07A', 'pileD' + i);
    for (let i = 0; i < 5; i++) {   // flung cans: one every 0.32 s
      const a = lt - i * .32 - .2; if (a < 0 || a > .9) continue;
      const q = arcPt([1100, 820], [1650 + 80 * hash(i), 900], 330, a / .9);
      can(q[0], q[1], 1.1, a * 10, LS.tin, 'flyD' + i);
    }
    const run = easeOut(seg(lt, 0, .5)), x = lerp(500, 820, run);
    const m = emotions(t, [[0, 'surprised', { lookX: 1 }], [L1.t0 - .2, 'nervous', { lookX: 1, lookY: .6, emote: 'sweat' }]], { base: DD });
    const dig = Math.sin(lt * 18);
    bulbGlow(x, 840, 22);
    doudou(x, 840, 22, { ...m, ...talk(t, 2, 1, 'wobble', 'O'), view: 'q', walk: run < 1 ? lt * 4 : null, rot: run >= 1 ? .18 : 0, aR: run >= 1 ? .4 + .5 * dig : .6, aL: run >= 1 ? .3 - .5 * dig : .2, boilKey: 'ddD' });
    camEnd();
    if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, [LS.nightLo, '#5A6AA8']);
  }
  shots([[S.t0, fall], [L1.t0 - .55, dig]]);
})();
