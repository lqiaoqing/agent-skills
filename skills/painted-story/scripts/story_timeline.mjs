#!/usr/bin/env node
// story_timeline.mjs: turn a story script (Markdown, see references/story-script.md) into a painted-story timeline.
//
//   node story_timeline.mjs <project> story.md --mode=tts|subs|voice [options]
//
//   --mode=tts     edge-tts narration (scripts/tts.py, run through uv): every line is synthesised, its exact length
//                  drives the timeline; word boundaries are kept for the optional karaoke style.
//   --mode=subs    subtitles only: each line stays up for its reading time (CJK chars / --cps + words / --wps, clamped
//                  to --min..--max); with --bgm the lines and scene starts snap to the music's beats / bars.
//   --mode=voice   the user's own recording (--voice-audio=rec.wav): lines timed by faster-whisper (align_lyrics.py),
//                  or by a ready SRT/LRC/VTT (--voice-subs=rec.srt; cues map onto the script's lines in order).
//   --bgm=music.mp3 [--bgm-db=-15] [--no-duck]   background music under everything (looped/trimmed, faded, ducked under
//                  the narration with a side-chain compressor). Only use music whose licence allows it.
//   --style=subtitle|karaoke|none   how lines show (default subtitle: no fill; karaoke fills along the speech)
//   --cps=4.5 --wps=2.6 --min=1.8 --max=7   reading speed (subs mode); --rate=+0% --voice=… override the script
//   --lang=zh --model=small   whisper options (voice mode) · --no-cache  re-synthesise every TTS line
//
// Writes into <project>: src/config.js (duration, bpm/offset from the BGM or 90 BPM, soundtrack), src/lyrics.js
// (LY_STYLE + LY: one entry per subtitle cue, opts {speaker, sub, words, sing}), src/story.js (STORY scenes/lines +
// SCENE()/LINE() helpers for the shot files), assets/story.srt, assets/timeline.json, assets/soundtrack.wav.
// Re-run it after editing the script: scene files that use SCENE(n).t0 / LINE(n, k).t0 follow the new timing.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
const CJKG = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
const NARRATOR = /^(旁白|叙述|narrator|narration)$/i;
const r2 = x => Math.round(x * 100) / 100;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- script parsing ----------
function scalar(v) {
  v = v.replace(/^\s*((['"]).*?\2|[^#]*?)\s+#.*$/, '$1');   // drop a trailing "  # comment"
  v = v.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (v === 'true') return true; if (v === 'false') return false;
  return v !== '' && !isNaN(+v) ? +v : v;
}
function inlineOpts(s) {          // "{pause: 0.6, voice: zh-CN-YunxiNeural}" → object
  const o = {};
  for (const part of s.split(/[,，]/)) { const i = part.search(/[:：=]/); if (i > 0) o[part.slice(0, i).trim()] = scalar(part.slice(i + 1)); }
  return o;
}
const takeOpts = s => {            // "{k: v}" blocks anywhere in the line (usually at the end or before " | ")
  const o = {}; s = s.replace(/\s*\{([^{}]*:[^{}]*)\}\s*/g, (_, b) => { Object.assign(o, inlineOpts(b)); return ' '; });
  return [s.replace(/\s+(\|)/g, ' $1').trim(), o];
};

export function parseScript(text) {
  text = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  const meta = { voices: {} };
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (fm) {
    text = text.slice(fm[0].length);
    let obj = null;
    for (const raw of fm[1].split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const m = raw.match(/^(\s*)([^:：]+?)\s*[:：]\s*(.*)$/); if (!m) continue;
      const [, ind, k, v] = m;
      if (ind && obj) { meta[obj][k] = scalar(v); continue; }
      if (v.trim() === '') { obj = k; meta[k] = meta[k] || {}; continue; }
      obj = null;
      meta[k] = /^\[.*\]$/.test(v.trim()) ? v.trim().slice(1, -1).split(',').map(scalar) : scalar(v);
    }
  }
  const speakers = new Set([...Object.keys(meta.voices || {}), ...(Array.isArray(meta.speakers) ? meta.speakers : [])].map(String));
  const scenes = [];
  let sc = null;
  const scene = (title, opts) => { sc = { n: scenes.length + 1, title, opts, notes: [], lines: [] }; scenes.push(sc); };
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) { const [t, o] = takeOpts(h[1]); scene(t.replace(/^(场景|scene)?\s*\d+\s*[·.、:：\-–—]?\s*/i, '').trim() || t, o); continue; }
    if (!sc) scene('', {});
    if (line.startsWith('>')) { sc.notes.push(line.replace(/^>\s*/, '').replace(/^(视觉|画面|visual)\s*[:：]\s*/i, '')); continue; }
    if (/^[-*]\s*$/.test(line) || /^-{3,}$/.test(line)) continue;
    let [body, o] = takeOpts(line.replace(/^[-*]\s+/, ''));
    let speaker = '';
    const b = body.match(/^\*\*([^*]+)\*\*\s*[:：]\s*(.+)$/);           // **豆豆**：……  always a speaker
    const p = body.match(/^([^\s:：|]{1,16})\s*[:：]\s*(.+)$/);           // 豆豆：…… only if declared (voices / speakers) or 旁白
    if (b) { speaker = b[1].trim(); body = b[2]; }
    else if (p && (speakers.has(p[1]) || NARRATOR.test(p[1]))) { speaker = p[1]; body = p[2]; }
    const bar = body.split(/\s+\|\s+|\s*｜\s*/);
    const txt = bar[0].trim(), sub = bar.slice(1).join(' ').trim();
    if (!txt) continue;
    sc.lines.push({ speaker: NARRATOR.test(speaker) ? '' : speaker, voiceKey: speaker, text: txt, ...(sub ? { sub } : {}), opts: o });
  }
  return { meta, scenes: scenes.filter(s => s.lines.length || s.notes.length || s.title) };
}

// ---------- helpers ----------
const spokenText = s => s.replace(/[“”"「」『』]/g, '');
function readSeconds(s, cps, wps) {
  const cjk = (s.match(CJKG) || []).length, words = s.replace(CJKG, ' ').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  return cjk / cps + words / wps;
}
const widthPx = s => [...s].reduce((w, c) => w + (CJK.test(c) ? 64 : /\s/.test(c) ? 18 : 34), 0);
function run(cmd, args, o = {}) {
  const r = spawnSync(cmd, args, { stdio: o.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 1 << 30, ...o });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')} … exited ${r.status}${o.capture ? '\n' + String(r.stderr).slice(-1500) : ''}`);
  return r;
}
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
function decode(file) {           // → Float32Array mono 48 kHz
  const r = run(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { capture: true });
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}
function writeWav(file, x) {
  const n = x.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(clamp(x[i], -1, 1) * 32767), 44 + i * 2);
  writeFileSync(file, buf);
}
function trimSilence(x, thr = .008) {   // → [start, end] samples, keeping 30 ms before / 80 ms after the voice
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  return [Math.max(0, a - .03 * SR), Math.min(x.length, b + .08 * SR)].map(Math.round);
}
function uvPython(script, args) {
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  return run('uv', ['run', '--python', '3.12', ...args.with.flatMap(w => ['--with', w]), 'python', join(HERE, script), ...args.argv], { env });
}

// ---------- TTS ----------
function synth(lines, meta, o, dir) {
  const ttsDir = join(dir, 'assets/tts'); mkdirSync(ttsDir, { recursive: true });
  const def = o.voice || meta.voice || (meta.lang && String(meta.lang).startsWith('en') ? 'en-US-AnaNeural' : 'zh-CN-XiaoxiaoNeural');
  const jobs = lines.map((l, i) => ({
    id: i, text: spokenText(l.text),
    voice: l.opts.voice || (meta.voices || {})[l.voiceKey] || def,
    rate: String(l.opts.rate ?? o.rate ?? meta.rate ?? '+0%'), pitch: String(l.opts.pitch ?? meta.pitch ?? '+0Hz'), volume: String(meta.volume ?? '+0%'),
  }));
  const jobFile = join(ttsDir, 'jobs.json');
  writeFileSync(jobFile, JSON.stringify(jobs, null, 1));
  console.log(`== edge-tts: ${jobs.length} lines (${[...new Set(jobs.map(j => j.voice))].join(', ')})`);
  uvPython('tts.py', { with: ['edge-tts'], argv: [jobFile, '--out', ttsDir, ...(o['no-cache'] ? ['--no-cache'] : [])] });
  return JSON.parse(readFileSync(join(ttsDir, 'manifest.json'), 'utf8'));
}

// ---------- BGM ----------
async function beatsOf(bgm) {
  try {
    const { analyze } = await import('./analyze_audio.mjs');
    const a = analyze(bgm, {});
    return a;
  } catch (e) { console.log(`  BGM beat analysis skipped: ${e.message}`); return null; }
}
// loudness: voice and music are both normalised to -16 LUFS (one-pass loudnorm), then the music sits bgmDb under it
// (default -15 dB under a voice, -3 dB when it plays alone) and is ducked a further ~6 dB while someone speaks.
function mixSoundtrack(dir, { voiceWav, bgm, duration, bgmDb, duck = true }) {
  const out = join(dir, 'assets/soundtrack.wav');
  if (!bgm) { run(FFMPEG, ['-v', 'error', '-y', '-i', voiceWav, '-af', `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=${SR},alimiter=limit=0.95`, '-t', String(duration), '-c:a', 'pcm_s16le', out]); return out; }
  const fadeOut = Math.min(2.5, duration / 4);
  bgmDb = bgmDb ?? (voiceWav ? -15 : -3);
  const bg = `[B]atrim=0:${duration},asetpts=N/SR/TB,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=${SR},volume=${bgmDb}dB,afade=t=in:d=1.2,afade=t=out:st=${(duration - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`;
  let graph, inputs;
  if (voiceWav) {
    inputs = ['-i', voiceWav, '-stream_loop', '-1', '-i', bgm];
    graph = `[1:a]aresample=${SR},aformat=channel_layouts=stereo[B];${bg}[bg];[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=${SR},aformat=channel_layouts=stereo,asplit=2[v1][v2];` +
      (duck ? `[bg][v1]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=500:makeup=1[bd];` : `[bg]anull[bd];[v1]anullsink;`) +
      `[bd][v2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[o]`;
  } else {
    inputs = ['-stream_loop', '-1', '-i', bgm];
    graph = `[0:a]aresample=${SR},aformat=channel_layouts=stereo[B];${bg},alimiter=limit=0.95[o]`;
  }
  run(FFMPEG, ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[o]', '-t', String(duration), '-ar', String(SR), '-c:a', 'pcm_s16le', out]);
  return out;
}

// ---------- main ----------
export async function buildStory(dir, scriptPath, o = {}) {
  dir = resolve(dir);
  const { meta, scenes } = parseScript(readFileSync(scriptPath, 'utf8'));
  const mode = o.mode || meta.mode || 'tts';
  if (!['tts', 'subs', 'voice'].includes(mode)) throw new Error(`--mode must be tts, subs or voice (got ${mode})`);
  const lines = scenes.flatMap(s => s.lines.map(l => ({ ...l, scene: s.n })));
  if (!lines.length) throw new Error(`${scriptPath}: no narration lines found`);
  for (const d of ['assets', 'src']) mkdirSync(join(dir, d), { recursive: true });
  copyFileSync(scriptPath, join(dir, 'assets/story' + (extname(scriptPath) || '.md')));
  const num = (k, d) => +(o[k] ?? meta[k] ?? d);
  const leadIn = num('lead_in', 1.5), sceneLead = num('scene_lead', 1.2), gap = num('gap', .4), sceneTail = num('scene_tail', .5), tail = num('tail', 2);
  const cps = num('cps', 4.5), wps = num('wps', 2.6), minD = num('min', 1.8), maxD = num('max', 7);
  const bgm = o.bgm || meta.bgm ? resolve(o.bgm || meta.bgm) : '';
  if (bgm && !existsSync(bgm)) throw new Error(`no such BGM file: ${bgm}`);
  const warnings = [], warn = m => warnings.push(m);
  const grid = bgm ? await beatsOf(bgm) : null;
  if (grid && grid.tempoAmbiguous) warn(`BGM tempo ${grid.bpm} BPM is ambiguous (alternates ${(grid.alternates || []).map(a => a.bpm ?? a).join(', ')}); only matters for beat-snapped subtitles and idle bounce; check src/config.js`);
  const beat = grid ? 60 / grid.bpm : 0, gOff = grid ? grid.offset : 0, barOff = grid ? grid.offset + grid.downbeat * beat : 0;
  const snapBeat = t => grid ? gOff + Math.ceil((t - gOff - .12) / beat) * beat : t;
  const snapBar = t => grid ? barOff + Math.ceil((t - barOff - .2) / (4 * beat)) * 4 * beat : t;

  // 1 · per-line speech length
  let tts = null, voice = null;
  if (mode === 'tts') {
    tts = synth(lines, meta, o, dir);
    lines.forEach((l, i) => {
      const m = tts[i]; if (!m || !existsSync(m.file)) throw new Error(`TTS failed for line ${i + 1}: ${l.text}`);
      const x = decode(m.file), [a, b] = trimSilence(x);
      l.pcm = x.subarray(a, b); l.speech = l.pcm.length / SR;
      l.words = (m.words || []).map(([s, e, w]) => [r2(Math.max(0, s - a / SR)), r2(Math.max(0, e - a / SR)), w]);
    });
  } else if (mode === 'subs') {
    lines.forEach(l => { l.speech = clamp(readSeconds(l.text, cps, wps) + .5, minD, maxD); });
  } else {
    const rec = o['voice-audio'] || meta.voice_audio; if (!rec || !existsSync(rec)) throw new Error('--mode=voice needs --voice-audio=<recording>');
    let srt = o['voice-subs'] || meta.voice_subs;
    if (!srt) {
      const txt = join(dir, 'assets/voice_lines.txt'); writeFileSync(txt, lines.map(l => l.text).join('\n') + '\n');
      srt = join(dir, 'assets/voice_aligned.srt');
      const lang = o.lang || (meta.lang ? String(meta.lang).slice(0, 2) : 'zh');
      console.log('== faster-whisper alignment of the recording (align_lyrics.py)');
      uvPython('align_lyrics.py', { with: ['faster-whisper', 'zhconv'], argv: [rec, txt, '--out', srt, '--lang', lang, '--model', String(o.model || 'small'), '--words', join(dir, 'assets/voice_words.json')] });
    }
    const { parseLyrics } = await import('./lyrics_to_ly.mjs');
    const { ly } = parseLyrics(readFileSync(srt, 'utf8'), srt);
    if (ly.length !== lines.length) warn(`${basename(srt)} has ${ly.length} cues for ${lines.length} script lines; mapped in order`);
    voice = { file: resolve(rec), ly, dur: decode(rec).length / SR };
  }

  // 2 · timeline
  let t = 0;
  const sceneOut = [];
  for (const s of scenes) {
    const L = lines.filter(l => l.scene === s.n);
    const lead = +(s.opts.lead ?? (s.n === 1 ? leadIn : sceneLead));
    let t0;
    if (voice) {
      const first = L.length ? voice.ly[lines.indexOf(L[0])] : null;
      t0 = s.n === 1 ? 0 : Math.max(t, first ? first[0] - lead : t);
    } else t0 = s.n === 1 ? 0 : grid && mode === 'subs' ? snapBar(t) : t;
    t = t0 + (voice ? 0 : lead);
    for (const l of L) {
      const i = lines.indexOf(l);
      if (voice) {
        const c = voice.ly[i] || [t, t + clamp(readSeconds(l.text, cps, wps), minD, maxD)];
        l.t0 = c[0]; l.end = c[1]; t = l.end;
      } else {
        if (mode === 'subs' && grid) t = snapBeat(t);
        l.t0 = t; l.end = t + l.speech; t = l.end + +(l.opts.pause ?? gap);
      }
    }
    if (!voice) { t += +(s.opts.tail ?? sceneTail) - gap; if (s.opts.hold) t += +s.opts.hold; }
    else t = Math.max(t, t0 + .5) + .1;
    sceneOut.push({ s, t0 });
  }
  let duration = voice ? Math.max(voice.dur, t + tail - .1) : t + tail;
  if (grid && mode === 'subs') duration = snapBar(duration);
  duration = +(Math.ceil(duration * 24) / 24).toFixed(4);
  sceneOut.forEach((x, k) => { x.t1 = k + 1 < sceneOut.length ? sceneOut[k + 1].t0 : duration; });

  // 3 · subtitle cues (a line too wide for the bar is split at the punctuation nearest its middle)
  const style = o.style || meta.style || 'subtitle';
  const LY = [];
  lines.forEach((l, i) => {
    const next = i + 1 < lines.length ? lines[i + 1].t0 : duration;
    const show1 = Math.min(next - .05, l.end + (mode === 'subs' ? 0 : .35));
    const parts = splitLine(l.text, l.sub);
    let tc = l.t0;
    parts.forEach(([txt, sub], k) => {
      const frac = parts.length === 1 ? 1 : [...txt].length / [...l.text].length;
      const isLast = k === parts.length - 1, sp = (l.end - l.t0) * frac;
      const c1 = isLast ? show1 : tc + sp;
      const opts = {};
      if (l.speaker) opts.speaker = l.speaker;
      if (sub) opts.sub = sub;
      if (mode !== 'subs') opts.sing = r2(Math.max(.3, (isLast ? l.end : c1) - tc));
      if (l.words && l.words.length && parts.length === 1) opts.words = l.words;
      LY.push([r2(tc), r2(c1), txt, ...(Object.keys(opts).length ? [opts] : [])]);
      if (widthPx(txt) > 1700) warn(`"${txt}" is still too wide for the subtitle bar; shorten it in the script`);
      tc = c1;
    });
    l.show = r2(show1);
  });

  // 4 · audio
  let audio = '';
  const bgmDb = o['bgm-db'] ?? meta.bgm_db, duck = !(o['no-duck'] || meta.duck === false);
  if (mode === 'tts') {
    const x = new Float32Array(Math.ceil(duration * SR));
    for (const l of lines) { const a = Math.round(l.t0 * SR); x.set(l.pcm.subarray(0, Math.max(0, Math.min(l.pcm.length, x.length - a))), a); }
    const nw = join(dir, 'assets/narration.wav'); writeWav(nw, x);
    mixSoundtrack(dir, { voiceWav: nw, bgm, duration, bgmDb: bgmDb == null ? undefined : +bgmDb, duck }); audio = 'assets/soundtrack.wav';
  } else if (mode === 'voice') {
    const vw = join(dir, 'assets/narration.wav');
    run(FFMPEG, ['-v', 'error', '-y', '-i', voice.file, '-af', `apad=whole_dur=${duration}`, '-t', String(duration), '-ac', '1', '-ar', String(SR), vw]);
    mixSoundtrack(dir, { voiceWav: vw, bgm, duration, bgmDb: bgmDb == null ? undefined : +bgmDb, duck }); audio = 'assets/soundtrack.wav';
  } else if (bgm) { mixSoundtrack(dir, { bgm, duration, bgmDb: bgmDb == null ? undefined : +bgmDb }); audio = 'assets/soundtrack.wav'; }

  // 5 · files
  const bpm = grid ? grid.bpm : num('bpm', 90), offset = grid ? +barOff.toFixed(3) : 0;
  const title = o.title || meta.title || basename(scriptPath, extname(scriptPath));
  const q = JSON.stringify;
  writeFileSync(join(dir, 'src/config.js'), `// config.js: written by story_timeline.mjs from ${basename(scriptPath)} (mode ${mode}); re-run it after editing the script.
//   duration: video length in s · bpm/offset: beat grid (${grid ? 'from the BGM' : 'no BGM: a calm default pulse for idles'}) · audio: soundtrack muxed by render.mjs
const PROJECT = { title: ${q(title)}, duration: ${duration}, bpm: ${bpm}, offset: ${offset}, audio: ${q(audio)} };
`);
  const rows = LY.map(([a, b, tx, op]) => `  [${a}, ${b}, ${q(tx)}${op ? `, ${q(op)}` : ''}]`);
  writeFileSync(join(dir, 'src/lyrics.js'), `// lyrics.js: subtitle cues generated by story_timeline.mjs from ${basename(scriptPath)}; regenerate instead of editing.
// LY_STYLE.mode: 'subtitle' (whole line, optional speaker tag) | 'karaoke' (fills along the speech) | 'none' (no text)
const LY_STYLE = ${q({ mode: style, speaker: meta.speaker_tags !== false })};
const LY = [
${rows.join(',\n')}
];
`);
  const story = {
    title, mode, duration,
    scenes: sceneOut.map(({ s, t0, t1 }) => ({ n: s.n, title: s.title, t0: r2(t0), t1: r2(t1), ...s.opts, notes: s.notes,
      lines: lines.filter(l => l.scene === s.n).map(l => ({ t0: r2(l.t0), end: r2(l.end), show: l.show, text: l.text, ...(l.sub ? { sub: l.sub } : {}), ...(l.speaker ? { speaker: l.speaker } : {}) })) })),
  };
  writeFileSync(join(dir, 'src/story.js'), `// story.js: scenes and lines with their times, generated by story_timeline.mjs from ${basename(scriptPath)} (mode ${mode}).
// Use these in the shot files instead of literal seconds, so re-timing the story (new voice, edited text) moves the shots:
//   SCENE(2).t0 / .t1 = scene 2 start / end · LINE(2, 0).t0 = first line of scene 2 starts · .end = speech ends · .show = subtitle off
//   speaking(t, n, k) · talk(t, n, k) = a flapping mouth for clawd() while that line plays
const STORY = ${JSON.stringify(story, null, 1)};
const SCENE = n => STORY.scenes[n - 1];
const LINE = (n, k) => STORY.scenes[n - 1] && STORY.scenes[n - 1].lines[k < 0 ? STORY.scenes[n - 1].lines.length + k : k];
// Is LINE(n, k) being spoken at time t? talk() returns a mouth that flaps ~6×/s while it is (spread it into clawd()):
//   clawd(x, y, u, { ...emotions(t, keys), ...talk(t, 2, 1) })      talk(t, n, k, closedMouth, openMouth)
const speaking = (t, n, k) => { const L = LINE(n, k); return !!L && t >= L.t0 && t <= L.end; };
const talk = (t, n, k, closed = 'smile', open = 'open') => speaking(t, n, k) ? { mouth: Math.sin((t - LINE(n, k).t0) * TAU * 3.2) > -.2 ? open : closed } : {};
`);
  const srtT = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  writeFileSync(join(dir, 'assets/story.srt'), LY.map(([a, b, tx, op], i) => `${i + 1}\n${srtT(a)} --> ${srtT(b)}\n${op && op.speaker ? op.speaker + '：' : ''}${tx}${op && op.sub ? '\n' + op.sub : ''}\n`).join('\n'));
  writeFileSync(join(dir, 'assets/timeline.json'), JSON.stringify({ ...story, bpm, offset, audio, bgm: bgm || null, style, warnings }, null, 1));

  // 6 · report
  console.log(`\n${title} · mode ${mode} · ${duration.toFixed(2)} s · ${bpm} BPM${grid ? ' (BGM)' : ''} · ${LY.length} subtitle cues · audio ${audio || '(none)'}`);
  for (const sc of story.scenes) {
    console.log(`  scene ${sc.n} ${sc.title}  ${sc.t0.toFixed(2)}–${sc.t1.toFixed(2)} s`);
    for (const l of sc.lines) console.log(`     ${l.t0.toFixed(2)}–${l.end.toFixed(2)}  ${l.speaker ? l.speaker + '：' : ''}${l.text}`);
  }
  for (const w of warnings) console.log('  warning: ' + w);
  return { duration, story, LY, warnings };
}

function splitLine(text, sub) {
  if (widthPx(text) <= 1500) return [[text, sub]];
  const cs = [...text], mid = cs.length / 2;
  let best = -1;
  cs.forEach((c, i) => { if (/[，。！？；、,.!?;:：]/.test(c) && i > 2 && i < cs.length - 3 && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; });
  if (best < 0) best = Math.round(mid) - 1;
  const a = cs.slice(0, best + 1).join('').trim(), b = cs.slice(best + 1).join('').trim();
  return [[a, ''], [b, sub || '']].flatMap(([t, s]) => splitLine(t, s));
}

const isMain = () => { try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return false; } };
if (isMain()) {
  const argv = process.argv.slice(2);
  const args = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
  const [dir, script] = argv.filter(a => !a.startsWith('--'));
  if (!dir || !script) { console.error('usage: node story_timeline.mjs <project> story.md --mode=tts|subs|voice [--bgm=music.mp3] [--voice-audio=rec.wav] [--voice-subs=rec.srt] [--style=subtitle|karaoke|none]'); process.exit(2); }
  try { await buildStory(dir, script, args); } catch (e) { console.error('error: ' + e.message); process.exit(1); }
}
