#!/usr/bin/env node
// new_project.mjs: scaffold a painted-mv project (cross-platform replacement for the upstream new_project.sh).
//   node <SKILL>/scripts/new_project.mjs <project-dir> [--audio=song.mp3] [--lyrics=song.lrc|.srt|.vtt|.tsv|.json]
//        [--title="歌名"] [--bpm=N] [--offset=S] [--duration=S] [--keep-demo] [--no-install] [--force]
// Copies template/ → <project-dir>, unhooks the demo scene (unless --keep-demo), copies the song to assets/, measures its
// beat grid (analyze_audio.mjs → assets/analysis.json + src/config.js), converts timed lyrics (lyrics_to_ly.mjs →
// src/lyrics.js), runs `npm install` and checks node / ffmpeg / Chrome. Plain-text lyrics: run align_lyrics.py first.
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)), TEMPLATE = resolve(HERE, '../template');
const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const dir = process.argv.slice(2).find(a => !a.startsWith('--'));
const die = m => { console.error('error: ' + m); process.exit(1); };
if (!dir) die('usage: node new_project.mjs <project-dir> [--audio=song.mp3] [--lyrics=song.lrc] [--title=..] [--bpm=N] [--offset=S] [--duration=S] [--keep-demo] [--no-install] [--force]');
if (args.audio && !existsSync(args.audio)) die(`no such audio file: ${args.audio}`);
if (args.lyrics && !existsSync(args.lyrics)) die(`no such lyrics file: ${args.lyrics}`);
if (existsSync(join(dir, 'studio.html')) && !args.force) die(`${dir} already has a studio.html; not overwriting (use --force)`);

// 1 · engine
mkdirSync(dir, { recursive: true });
cpSync(TEMPLATE, dir, { recursive: true, filter: s => !/[\\/](node_modules|out)([\\/]|$)/.test(s.slice(TEMPLATE.length)) });
for (const d of ['assets', 'out/check']) mkdirSync(join(dir, d), { recursive: true });
if (!args['keep-demo']) {
  const f = join(dir, 'studio.html');
  writeFileSync(f, readFileSync(f, 'utf8').replace('<script src="src/scenes/demo.js"></script>', '<!-- <script src="src/scenes/demo.js"></script>  (example only) -->'));
}
console.log(`engine → ${resolve(dir)}`);

// 2 · song + beat grid
const cfg = { title: args.title || (args.audio ? basename(args.audio, extname(args.audio)) : 'painted-mv'), duration: +args.duration || 11, bpm: +args.bpm || 120, offset: +args.offset || 0, audio: '' };
let analysis = null;
if (args.audio) {
  cfg.audio = `assets/song${extname(args.audio).toLowerCase() || '.mp3'}`;
  copyFileSync(args.audio, join(dir, cfg.audio));
  try {
    const { analyze, report } = await import('./analyze_audio.mjs');
    analysis = analyze(args.audio, { bpm: args.bpm ? +args.bpm : 0 });
    writeFileSync(join(dir, 'assets/analysis.json'), JSON.stringify(analysis, null, 2));
    console.log('\n' + report(analysis) + '\n');
    if (!args.bpm) cfg.bpm = analysis.bpm;
    if (args.offset == null) cfg.offset = analysis.offset;
    if (!args.duration) cfg.duration = Math.floor(analysis.duration * 100) / 100;
  } catch (e) { console.log(`beat analysis skipped: ${e.message}\n  (set bpm/offset in src/config.js by hand, or run scripts/beat_grid.py)`); }
}

// 3 · lyrics
if (args.lyrics) {
  const { parseLyrics, lyToJs } = await import('./lyrics_to_ly.mjs');
  const { ly, warnings } = parseLyrics(readFileSync(args.lyrics, 'utf8'), args.lyrics, { duration: cfg.duration });
  copyFileSync(args.lyrics, join(dir, 'assets', 'lyrics' + extname(args.lyrics).toLowerCase()));
  writeFileSync(join(dir, 'src/lyrics.js'), lyToJs(ly, basename(args.lyrics)));
  console.log(`lyrics → src/lyrics.js: ${ly.length} lines${ly.length ? `, ${ly[0][0]}s – ${ly[ly.length - 1][1]}s` : ''}`);
  for (const w of warnings) console.log('  warning: ' + w);
}
const q = JSON.stringify;
writeFileSync(join(dir, 'src/config.js'), `// config.js: project settings (written by new_project.mjs; edit freely).
//   duration: video length in s · bpm/offset: the beat grid (beats at offset + n * 60 / bpm; use half-time for a ballad)
//   audio: soundtrack muxed into the MP4 by render.mjs
const PROJECT = { title: ${q(cfg.title)}, duration: ${cfg.duration}, bpm: ${cfg.bpm}, offset: ${cfg.offset}, audio: ${q(cfg.audio)} };
`);
console.log(`src/config.js: ${q(cfg.title)}, ${cfg.duration} s, ${cfg.bpm} BPM, beat 0 at ${cfg.offset} s`);

// 4 · deps (p5, p5.brush, puppeteer-core). npm honours HTTPS_PROXY / npm config proxy.
const win = process.platform === 'win32';
if (!args['no-install']) {
  console.log('== npm install (p5, p5.brush, puppeteer-core)');
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', shell: win });
  if (r.status) console.log('npm install failed: re-run it inside the project (behind a proxy: set HTTPS_PROXY=http://127.0.0.1:7890)');
}

// 5 · toolchain check
console.log('== toolchain');
const has = (cmd, a = ['-version']) => { const r = spawnSync(cmd, a, { shell: win, stdio: 'ignore' }); return r.status === 0; };
console.log(`node   ${process.version}${+process.versions.node.split('.')[0] < 18 ? '  (need >= 18)' : ''}`);
console.log(has(process.env.FFMPEG || 'ffmpeg') ? 'ffmpeg ok' : 'MISSING: ffmpeg (Windows: winget install Gyan.FFmpeg --scope user · macOS: brew install ffmpeg)');
const LAD = process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local');
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(LAD, 'Google/Chrome/Application/chrome.exe'), 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
console.log(chrome ? `chrome ${chrome}` : 'MISSING: Chrome/Edge (install one, or pass --chrome=<path> to render.mjs)');
console.log(`== ready: ${resolve(dir)}\n   cd ${dir} && node render.mjs --gpu && node render.mjs --sheet=0.5,2,4,6 --cols=4 --w=480 --out=out/check/setup.jpg`);
