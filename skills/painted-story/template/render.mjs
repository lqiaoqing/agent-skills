// render.mjs: renders studio.html in headless Chrome (or Edge). Length and fps come from the page (PROJECT in src/config.js).
//
//   Look at it (open the images with your image viewer / Read tool):
//     node render.mjs --sheet=0.5,1,1.5,2 [--cols=4] [--w=480] --out=out/check/a.jpg        contact sheet of chosen times
//     node render.mjs --strip=2.0:2.5 [--cols=6] [--w=320] --out=out/check/strip.jpg        EVERY frame in a stretch (motion)
//     node render.mjs --sheet=2.1,2.2 --crop=760,300,400,400 --w=600 --out=out/check/face.jpg full-res crops (details)
//     node render.mjs --strip=2.0:2.5 --crop-at=960,780,500,400 --out=out/check/feet.jpg       crops that follow a WORLD point
//     node render.mjs --stills=1.2,3.4 --out=out/stills                                     full-res PNGs
//     node render.mjs --gpu                                                                  which GPU WebGL landed on
//   Make the video:
//     node render.mjs --clip [--range=0:4] --out=out/video.mp4                               straight to MP4 (one worker)
//     node render.mjs --frames [--range=0:8] --workers=4                                     JPEG frames -> out/frames (parallel, resumable)
//     node render.mjs --encode --out=out/video.mp4                                           out/frames -> MP4
//   Standalone loops (LOOPS in the page): add --loop=<name> to any of the above (times are then loop times), or
//     node render.mjs --loop=emotions --png --out=out/loop_emotions                          one cycle as PNGs (for GIFs)
//   Music: --audio=assets/song.mp3 (or PROJECT.audio) is muxed into --clip and --encode (--noaudio to skip).
//   Other flags: --fps=24 (12 = quick draft; the linework boils at 12 fps anyway), --size=1280x720 (scale the encoded
//   MP4 down; the page always paints 1920x1080), --crf=18, --preset=medium, --chrome=<path to Chrome/Edge/Chromium>
//   (or CHROME_PATH), --angle=d3d11|d3d11on12|gl|vulkan|metal|swiftshader, --soft-gl (= swiftshader), --ffmpeg=<path> (or FFMPEG).
//
// Windows notes (painted-mv): Chrome is looked up in Program Files, %LOCALAPPDATA% and then Edge; WebGL runs on ANGLE/D3D11,
// which works on Intel Arc / Iris integrated GPUs. If `--gpu` reports SwiftShader or frames fail, try --angle=d3d11on12 or
// --angle=gl, and close other GPU-heavy apps. Paths may use / or \.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, renameSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const s = a.replace(/^--/, ''), i = s.indexOf('='); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; }));
const LAD = process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local');
const CHROMES = [args.chrome, process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(LAD, 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ...playwrightChromes()];
// Chromium builds Playwright downloaded (~/.cache/ms-playwright or %LOCALAPPDATA%/ms-playwright), newest first
function playwrightChromes() {
  const out = [];
  for (const dir of [`${homedir()}/.cache/ms-playwright`, join(LAD, 'ms-playwright')]) {
    if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir).filter(n => /^chromium-\d+$/.test(n)).sort((a, b) => b.split('-')[1] - a.split('-')[1]))
      out.push(`${dir}/${n}/chrome-linux64/chrome`, `${dir}/${n}/chrome-win64/chrome.exe`, `${dir}/${n}/chrome-win/chrome.exe`);
  }
  return out;
}
const CHROME = CHROMES.find(p => p && existsSync(p));
if (!CHROME && !args.encode) { console.error('Chrome/Edge not found: pass --chrome=<path> or set CHROME_PATH'); process.exit(1); }
const FFMPEG = args.ffmpeg || process.env.FFMPEG || 'ffmpeg';
const SIZE = args.size ? String(args.size).toLowerCase().split('x').map(Number) : null;
const scaleVf = SIZE ? ['-vf', `scale=${SIZE[0]}:${SIZE[1]}:flags=lanczos`] : [];
const fps = +(args.fps || 24), FRAMES_DIR = 'out/frames';
const run = (cmd, a) => new Promise((ok, bad) => { const p = spawn(cmd, a, { stdio: 'inherit' }); p.on('error', e => bad(new Error(`cannot run ${cmd}: ${e.message} (install ffmpeg or pass --ffmpeg=<path>)`))); p.on('close', c => c ? bad(new Error(cmd + ' exited ' + c)) : ok()); });
const times = s => String(s).split(',').map(Number);
const span = s => String(s).split(':').map(Number);
// comma-separated fields, keeping commas inside parentheses ('PLK.MX(1.38),PLK.WL,500,300'); numbers stay numbers
const fields = s => { const out = []; let d = 0, cur = ''; for (const ch of String(s)) { if (ch === ',' && !d) { out.push(cur); cur = ''; continue; } d += ch === '(' ? 1 : ch === ')' ? -1 : 0; cur += ch; } out.push(cur); return out.map(v => isNaN(+v) ? v : +v); };

if (args.encode) {
  // the soundtrack: --audio, else PROJECT.audio from src/config.js (no browser is started for --encode)
  const cfgAudio = (() => { try { const m = readFileSync('src/config.js', 'utf8').match(/audio:\s*['"]([^'"]+)['"]/); return m && existsSync(m[1]) ? m[1] : ''; } catch { return ''; } })();
  const out = args.out || 'out/video.mp4', n = readdirSync(FRAMES_DIR).filter(f => f.endsWith('.jpg')).length, audio = args.noaudio ? '' : (args.audio || cfgAudio);
  mkdirSync(dirname(out), { recursive: true });
  console.log(`encoding ${n} frames → ${out}${audio ? ' with ' + audio : ''}`);
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-stats', '-framerate', String(fps), '-i', `${FRAMES_DIR}/f%05d.jpg`,
    ...(audio ? ['-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), ...scaleVf,
    '-c:v', 'libx264', '-preset', args.preset || 'slow', '-crf', String(args.crf || 17), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  console.log('wrote ' + out);
  process.exit(0);
}

// --soft-gl: no GPU on this machine; render WebGL in software (SwiftShader), which Chrome only allows when asked.
// --gpu-angle=vulkan|gl-egl: headless Linux on an NVIDIA GPU (e.g. a cloud or cluster node); plain --use-gl=angle gets
// no WebGL context there. Check which GPU Chrome actually lands on with gpu_probe.mjs.
// --angle=<backend> (alias --gpu-angle): force an ANGLE backend. Windows default d3d11 (Intel Arc/Iris, NVIDIA, AMD all fine).
const ANGLE = { vulkan: ['--use-angle=vulkan', '--enable-features=Vulkan'], 'gl-egl': ['--use-angle=gl-egl'], d3d11: ['--use-angle=d3d11'],
  d3d11on12: ['--use-angle=d3d11on12'], gl: ['--use-angle=gl'], metal: ['--use-angle=metal'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
const angle = args.angle || args['gpu-angle'];
if (angle && !ANGLE[angle]) { console.error(`--angle must be one of ${Object.keys(ANGLE)}`); process.exit(1); }
const gpu = args['soft-gl'] ? ANGLE.swiftshader
  : angle ? ANGLE[angle]
  : process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-gl=angle'];
// Ubuntu 23.10+ blocks Chrome's user-namespace sandbox; headless rendering of local files doesn't need it.
const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : [];
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 0,
  args: [...sandbox, '--allow-file-access-from-files', '--ignore-gpu-blocklist', ...gpu, '--enable-gpu-rasterization', '--window-size=1920,1080', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']
});
async function openPage(tag = '') {
  const page = await browser.newPage();
  page.on('console', m => { if (['error', 'warn'].includes(m.type())) console.log(`[page${tag}]`, m.text()); });
  page.on('pageerror', e => console.log(`[page error${tag}]`, e.message));
  await page.goto(pathToFileURL(resolve('studio.html')).href + '?render', { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.ready === true', { timeout: 60000 });
  if (args.loop) {
    const ok = await page.evaluate(name => { if (!LOOPS[name]) return false; window.LOOP = LOOPS[name]; return true; }, args.loop);
    if (!ok) { console.error(`no loop named "${args.loop}"`); process.exit(1); }
  }
  return page;
}
const frameOf = async (page, t, type, q) => {
  const url = await page.evaluate((t, type, q) => window.renderAt(t, type, q), t, type, q);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
};
// the length of whatever is being rendered: a loop's .len, or the video's duration
const lengthOf = page => page.evaluate(() => window.LOOP ? window.LOOP.len : DUR);

if (args.gpu) {
  const page = await openPage();
  console.log('chrome:', CHROME, '\nflags:', gpu.join(' '), '\nGPU:', await page.evaluate(() => window.gpuInfo ? window.gpuInfo() : (() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); })()));
} else if (args.sheet || args.strip) {
  const page = await openPage(), out = args.out || 'out/sheet.jpg'; mkdirSync(dirname(out), { recursive: true });
  let ts;
  if (args.strip) { const [a, b] = span(args.strip); ts = []; for (let i = Math.round(a * fps); i <= Math.round(b * fps); i++) ts.push(i / fps); }
  else ts = times(args.sheet);
  const crop = args.crop ? times(args.crop) : null, at = args['crop-at'] ? fields(args['crop-at']) : null;
  const { url, ms } = await page.evaluate((ts, c, w, crop, at) => window.renderSheet(ts, c, w, crop, at), ts, +(args.cols || (args.strip ? 6 : 3)), +(args.w || (args.strip ? 320 : 640)), crop, at);
  writeFileSync(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  console.log(`${out}  (${ts.length} frames)  ms/frame: ${ms.join(' ')}`);
} else if (args.stills) {
  const page = await openPage(), out = args.out || 'out/stills'; mkdirSync(out, { recursive: true });
  console.log('GPU:', await page.evaluate(() => window.gpuInfo()));
  for (const s of times(args.stills)) {
    const t0 = Date.now(), buf = await frameOf(page, s, 'image/png');
    const f = `${out}/t${s.toFixed(2).replace('.', '_')}.png`; writeFileSync(f, buf);
    console.log(`${f}  ${Date.now() - t0} ms`);
  }
} else if (args.png) {
  // PNG sequence (for GIFs): a loop's full cycle (frame n equals frame 0, so it isn't rendered), or --range=a:b.
  const probe = await openPage(), len = await lengthOf(probe); await probe.close();
  const [a, b] = args.range ? span(args.range) : [0, len], n = Math.round((b - a) * fps);
  const out = args.out || `out/${args.loop ? 'loop_' + args.loop : 'png'}`, workers = +(args.workers || 3); mkdirSync(out, { recursive: true });
  let next = 0; const start = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const page = await openPage('#' + w);
    while (next < n) { const i = next++; writeFileSync(`${out}/f${String(i).padStart(4, '0')}.png`, await frameOf(page, a + i / fps, 'image/png')); }
  }));
  console.log(`${n} frames → ${out}  (${((Date.now() - start) / n).toFixed(0)} ms/frame)`);
} else if (args.frames) {
  // Parallel and resumable: each worker pulls the next missing frame; files are written atomically.
  const probe = await openPage(), len = await lengthOf(probe); await probe.close();
  const [a, b] = args.range ? span(args.range) : [0, len], workers = +(args.workers || 4);
  mkdirSync(FRAMES_DIR, { recursive: true });
  const first = Math.round(a * fps), last = Math.min(Math.ceil(len * fps) - 1, Math.round(b * fps) - 1);
  const todo = []; for (let i = first; i <= last; i++) { const f = `${FRAMES_DIR}/f${String(i).padStart(5, '0')}.jpg`; if (!existsSync(f) || statSync(f).size < 1000) todo.push(i); }
  console.log(`${todo.length} frames to render (${last - first + 1 - todo.length} already done), ${workers} workers`);
  let next = 0, done = 0; const start = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const page = await openPage('#' + w);
    while (next < todo.length) {
      const i = todo[next++], f = `${FRAMES_DIR}/f${String(i).padStart(5, '0')}.jpg`;
      const buf = await frameOf(page, i / fps, 'image/jpeg', .94);
      writeFileSync(f + '.tmp', buf); renameSync(f + '.tmp', f);
      if (++done % 24 === 0 || done === todo.length) {
        const el = (Date.now() - start) / 1000;
        console.log(`frame ${done}/${todo.length}  ${(el / done * 1000).toFixed(0)} ms/frame effective  eta ${((todo.length - done) * el / done / 60).toFixed(1)} min`);
      }
    }
  }));
} else if (args.clip) {
  const page = await openPage(), len = await lengthOf(page);
  const [a, b] = args.range ? span(args.range) : typeof args.clip === 'string' ? span(args.clip) : [0, len];
  const audio = args.noaudio ? '' : (args.audio || await page.evaluate(() => PROJECT.audio || ''));
  const out = args.out || 'out/clip.mp4'; mkdirSync(dirname(out), { recursive: true });
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    ...(audio ? ['-ss', String(a), '-t', String(b - a), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), ...scaleVf,
    '-c:v', 'libx264', '-preset', args.preset || 'medium', '-crf', String(args.crf || 18), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.on('error', e => { console.error(`cannot run ${FFMPEG}: ${e.message} (install ffmpeg or pass --ffmpeg=<path>)`); process.exit(1); });
  const n = Math.round((b - a) * fps), start = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await frameOf(page, a + i / fps, 'image/jpeg', .93);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 24 === 0 || i === n - 1) console.log(`frame ${i + 1}/${n}  ${((Date.now() - start) / (i + 1)).toFixed(0)} ms/frame`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log(`wrote ${out}  (${n} frames, ${((Date.now() - start) / 1000).toFixed(1)} s total, ${((Date.now() - start) / n).toFixed(0)} ms/frame)`);
} else {
  console.log('nothing to do: see the usage notes at the top of render.mjs');
}
await browser.close();
