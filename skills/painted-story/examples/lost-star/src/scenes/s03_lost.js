// s03_lost.js · scene 3 想回家: close-up of the little star in a tin can, dim and crying; Doudou's head peeks in.
(() => {
  const S = SCENE(3), L = LINE(3, 0);
  function lost(t, lt, dur) {
    camBegin(960, 540 + 8 * Math.sin(lt), 1.04 + .03 * seg(lt, 0, dur));
    boilSeed('skyE'); paint(rectPts(-300, -300, W + 600, H + 600), { wash: '#26305C', ink: null });
    paint(ellPts(960, 1180, 1300, 520, 24), { fill: '#3E4A7E', fillOp: 120, bleed: .2, tex: .5, ink: null });
    for (let i = 0; i < 12; i++) glow(hash(i * 5.3) * W, hash(i * 2.9) * 400, 10, LS.star, .35);
    // the big open can, lying on its side
    boilSeed('canE');
    paint(ellPts(980, 700, 330, 240, 26), { wash: '#8EA2B4', fill: LS.tinDk, fillOp: 120, bleed: .08, ink: PAL.ink, sw: 1.4 });
    paint(ellPts(980, 700, 290, 205, 26), { wash: '#3B4660', fill: '#232A40', fillOp: 120, ink: PAL.ink, sw: 1 });
    const flick = .32 + .1 * Math.sin(t * 13) * Math.sin(t * 5.7), sob = Math.abs(Math.sin(t * 5)) * 6;
    littleStar(980, 720 - sob, 120, { face: lt < .5 ? 'sad' : 'cry', lit: flick, mouth: talk(t, 3, 0, 'frown', 'wail').mouth, rot: .08 * Math.sin(t * 2), key: 'starE' });
    // Doudou's head leaning in from the right edge, worried
    const m = emotions(t, [[0, 'sad', { lookX: -1, lookY: .5, emote: null }]], { base: DD });
    doudou(1700, 1180, 46, { ...m, view: 'q', flip: true, rot: -.15, aL: -.5, aR: -.5, boilKey: 'ddE' });
    camEnd();
    if (lt < .3) brushWipe(.5 + lt / .6, [LS.nightLo, '#5A6AA8']);
  }
  shots([[S.t0, lost]]);
})();
