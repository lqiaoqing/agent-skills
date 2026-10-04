// s04_tower.js · scene 4 搭一座塔: the junk tower grows piece by piece; then Doudou climbs it with the star.
(() => {
  const S = SCENE(4), L0 = LINE(4, 0), L1 = LINE(4, 1);
  // the tower, bottom to top: [kind, dx, height of the piece]
  const PIECES = [['crate', 0, 70], ['tv', -10, 90], ['tire', 5, 30], ['crate', -8, 70], ['wheel', 0, 36], ['tv', 6, 90], ['spring', 0, 84], ['crate', -4, 70]];
  const drawPiece = (kind, x, y, key) => kind === 'crate' ? crate(x, y, 1, key) : kind === 'tv' ? tvBox(x, y, 1, key) : kind === 'tire' ? tire(x, y - 14, .8, key)
    : kind === 'wheel' ? wheel(x, y - 18, 60, T * .5, key) : coilSpring(x, y, 1, key);
  // 4a · stacking: one piece lands every ~0.42 s, the camera tilts up with the tower
  function stack(t, lt, dur) {
    const n = PIECES.length, per = (dur - .6) / n, got = clamp(Math.floor((lt - .2) / per) + 1, 0, n);
    let h = 0; for (let i = 0; i < got; i++) h += PIECES[i][2];
    camBegin(960, 560 - Math.min(h, 420) * .7, 1);
    nightSky(t, { key: 'skyF', starY: 900 });
    boilSeed('groundF'); paint(ellPts(960, 1130, 1400, 300, 28, 6), { wash: LS.hill, fill: LS.hillLt, fillOp: 70, ink: PAL.ink, sw: 1 });
    let y = 860;
    for (let i = 0; i < n; i++) {
      const tl = .2 + i * per, a = lt - tl; if (a < 0) break;
      const drop = easeIn(seg(a, 0, .22)), yy = lerp(y - 420, y, drop), squash = a > .22 ? Math.exp(-(a - .22) * 12) * Math.sin((a - .22) * 30) * .06 : 0;
      push(); translate(960 + PIECES[i][1], yy); scale(1 + squash, 1 - squash); drawPiece(PIECES[i][0], 0, 0, 'pc' + i); pop();
      if (a > .2 && a < .5) for (const s of [-1, 1]) glow(960 + s * (70 + 120 * (a - .2)), y - 6, 18, '#C9C0D8', .5 * (1 - (a - .2) / .3));
      y -= PIECES[i][2];
    }
    // Doudou at the foot of the tower heaving the next piece up
    const lift = Math.abs(Math.sin(lt * Math.PI / per));
    const m = emotions(t, [[0, 'determined', { lookX: .6, lookY: -.6 }]], { base: DD });
    bulbGlow(700, 870, 18);
    doudou(700, 870, 18, { ...m, view: 'q', aL: .6 + 1 * lift, aR: .6 + 1 * lift, dy: -lift * 1.2, boilKey: 'ddF' });
    littleStar(640, 650 + 10 * Math.sin(t * 3), 34, { face: 'sad', lit: .45, key: 'starF' });
    camEnd();
  }
  // 4b · climbing: the tower scrolls down past him; he carries the star on his head; "抓紧我，我们上去！"
  function climb(t, lt, dur) {
    camBegin(960, 540, 1.1);
    nightSky(t, { key: 'skyG', moonAt: [1500, 150, 90], stars: 36, starY: 1000 });
    const scroll = lt * 260;
    for (let i = -1; i < 7; i++) {   // the tower column, repeating pieces sliding down
      const p = PIECES[(i + 16) % PIECES.length], y = 1080 + 40 - i * 170 + (scroll % 170);
      drawPiece(p[0], 960 + p[1] * 2, y, 'cl' + ((i + 16) % PIECES.length));
    }
    const step = Math.sin(lt * 9);
    const m = emotions(t, [[0, 'determined', { lookY: -1 }], [L1.end + .1, 'excited', { lookY: -1, emote: null }]], { base: DD, take: .7 });
    const x = 960, y = 760 + 10 * step;
    littleStar(x - 10, y - 320, 40, { face: 'O', lit: .6 + .2 * seg(lt, 0, dur), key: 'starG' });
    bulbGlow(x, y, 22);
    doudou(x, y, 22, { ...m, ...talk(t, 4, 1, 'flat', 'open'), view: 'qback', aL: 1.3 + .4 * step, aR: 1.3 - .4 * step, dy: -Math.abs(step) * .6, boilKey: 'ddG' });
    camEnd();
  }
  shots([[S.t0, stack], [L1.t0 - .35, climb]]);
})();
