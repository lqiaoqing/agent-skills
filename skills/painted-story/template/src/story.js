// story.js: scenes and narration lines with their times. scripts/story_timeline.mjs overwrites this file from the story
// script; until then it is empty (a song MV doesn't need it).
//   SCENE(n).t0 / .t1 · LINE(n, k).t0 / .end / .show (k < 0 counts from the scene's last line) · speaking() / talk()
const STORY = { title: '', mode: '', duration: 0, scenes: [] };
const SCENE = n => STORY.scenes[n - 1];
const LINE = (n, k) => STORY.scenes[n - 1] && STORY.scenes[n - 1].lines[k < 0 ? STORY.scenes[n - 1].lines.length + k : k];
// Is LINE(n, k) being spoken at time t? talk() returns a mouth that flaps ~6×/s while it is (spread it into clawd()):
//   clawd(x, y, u, { ...emotions(t, keys), ...talk(t, 2, 1) })      talk(t, n, k, closedMouth, openMouth)
const speaking = (t, n, k) => { const L = LINE(n, k); return !!L && t >= L.t0 && t <= L.end; };
const talk = (t, n, k, closed = 'smile', open = 'open') => speaking(t, n, k) ? { mouth: Math.sin((t - LINE(n, k).t0) * TAU * 3.2) > -.2 ? open : closed } : {};
