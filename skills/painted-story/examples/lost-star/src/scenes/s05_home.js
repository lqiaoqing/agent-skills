// s05_home.js · scene 5 回家: at the top the star flies home and lights up; the ending rhymes with the opening wide.
(() => {
  const S = SCENE(5), L0 = LINE(5, 0), L1 = LINE(5, 1);
  // 5a · tower top: she rises out of his hands, spins, brightens, thanks him
  function top(t, lt, dur) {
    const rise = easeOut(seg(lt, .2, dur));
    camBegin(960, 520 - 60 * rise, 1.05);
    nightSky(t, { key: 'skyH', warm: .35 * rise, moonAt: [1560, 200, 110], stars: 40, starY: 900 });
    crate(960, 980, 1.6, 'topCrate');
    const sx = 960 + 120 * Math.sin(lt * 2) * rise, sy = 690 - 360 * rise, lit = .55 + .45 * seg(lt, .3, 1.4);
    for (let i = 0; i < 8; i++) {   // sparkles shed as she rises
      const a = frac(lt * .9 + i / 8), q = [sx + (hash(i) - .5) * 180 * a, sy + 140 * a];
      glow(q[0], q[1], 16 * (1 - a), LS.starLt, (1 - a) * lit);
    }
    littleStar(sx, sy, 70 + 20 * rise, { face: 'happy', lit, mouth: talk(t, 5, 0, 'smile', 'open').mouth, rot: .15 * Math.sin(lt * 3), key: 'starH' });
    const m = emotions(t, [[0, 'hopeful', { lookY: -1 }], [L0.end, 'happy', { lookY: -1, emote: 'heart' }]], { base: DD });
    bulbGlow(960, 880, 24);
    doudou(960, 880, 24, { ...m, view: 'front', aL: 1.4 + .2 * Math.sin(lt * 6), aR: 1.4 - .2 * Math.sin(lt * 6), boilKey: 'ddH' });
    camEnd();
    if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, [LS.nightLo, LS.starDk]);
  }
  // 5b · the opening wide again, now with the tower and one bright star that winks at him; he waves; iris out
  function rhyme(t, lt, dur) {
    camBegin(960, 520, 1.05 - .05 * seg(lt, 0, dur));
    nightSky(t, { key: 'skyA', warm: .15 });
    junkHill(t, 960, 700, 'hillA');
    // the tower behind him (small)
    boilSeed('towerI');
    for (let i = 0; i < 6; i++) paint(rectPts(1150 - 30 + (i % 2) * 6, 700 - i * 34, 60, 34, 2), { wash: i % 2 ? '#B08A5A' : LS.junkB, ink: PAL.ink, sw: .6 });
    // her: big, bright, a face you can read even far away; winks on "眨眼睛"
    const wink = t > L1.end - .9 && t < L1.end - .3;
    littleStar(640, 230, 44, { face: wink ? 'wink' : 'happy', lit: 1, key: 'starI' });
    tire(960, 712, .9, 'tireA');
    const m = emotions(t, [[0, 'happy', { lookY: -1, lookX: -.6 }], [L1.end - .9, 'love', { lookY: -1, lookX: -.6 }]], { base: DD });
    bulbGlow(960, 700, 9);
    doudou(960, 700, 9, { ...m, view: 'q', flip: true, aR: 1.5 + .3 * Math.sin(t * 8), boilKey: 'ddA' });
    camEnd();
    if (lt < .3) brushWipe(.5 + lt / .6, [LS.nightLo, LS.starDk]);
    const left = dur - lt;
    if (left < 1.1) iris(640, 300, lerp(0, 1500, easeOut(left / 1.1)));
  }
  shots([[S.t0, top], [L1.t0 - .2, rhyme]]);
})();
