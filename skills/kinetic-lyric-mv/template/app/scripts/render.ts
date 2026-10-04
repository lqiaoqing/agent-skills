#!/usr/bin/env node
// Offline renderer (Node 22.6+ with type stripping; `node scripts/render.ts …`). Drives the app in headless
// Chrome (?export=1) and either
//   stills:  node scripts/render.ts stills --t 1.5,23,40.2 [--only id1,id2] [--out dir]
//   sheet:   node scripts/render.ts sheet --from 20 --to 35 [--n 12] [--cols 4] [--only ids] [--out file.png]   (or --times a,b,c | --cuts)
//   perf:    node scripts/render.ts perf --from 20 --to 25 [--only ids] [--samples 1] [--shutter 0.5]   (avg ms per frame incl. GPU sync and the export's pixel readback)
//   video:   node scripts/render.ts video [--from 0] [--to <duration>] [--fps 60] [--crf 16] [--x264 aq-mode=3] [--samples 1] [--shutter 0.5] [--out ../out/video.mp4] [--noaudio]
//            --samples N averages N sub-frames per frame over shutter×(1/fps): motion blur + temporal AA;
//            --samples auto picks the count per frame (4, 12, 36, 108 or 324, see Engine.render)
//   gpu:     node scripts/render.ts gpu   (prints the WebGL renderer: check it's your GPU, not SwiftShader)
//   --scale N (all modes): render at N× the 1920x1080 layout (--scale 2 = true 3840x2160); stills are then saved
//            full-res from the pixel buffer, videos are encoded at the physical size.
//   --headed: show the browser window.
//
// kinetic-lyric-mv additions (Windows / integrated-GPU friendly):
//   --profile low|mid|high   quality preset (DEFAULT low; explicit flags override it):
//            low  = 1280x720 (--scale 0.6667), 30 fps, --samples 2 --shutter 0.3, x264 --preset fast, crf 20
//            mid  = 1920x1080, 30 fps, --samples auto --max-samples 12, x264 --preset medium, crf 18
//            high = upstream: 1920x1080, 60 fps, --samples auto (up to 324), x264 --preset slow, crf 16
//   --scale may be fractional below 1 (0.6667 = 720p, 0.5 = 540p).
//   --angle d3d11|d3d11on12|gl|vulkan|swiftshader   force the ANGLE backend (Windows default d3d11: Intel Arc/Iris OK)
//   --browser chrome|msedge   browser channel when CHROME_PATH is unset (default chrome, falls back to msedge)
//   FFMPEG=<path> env var if ffmpeg is not on PATH.
// Uses the Vite dev server at --url (default http://localhost:5173); starts a private one if unreachable.
//
// Ported from the reference project's Bun script to Node: Playwright's transports hang under Bun on Windows.
import { chromium, type Page } from 'playwright-core';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(APP, '..');
const PROFILES: Record<string, Record<string, string>> = {
  low: { scale: '0.6667', fps: '30', samples: '2', shutter: '0.3', preset: 'fast', crf: '20' },
  mid: { scale: '1', fps: '30', samples: 'auto', 'max-samples': '12', shutter: '0.3', preset: 'medium', crf: '18' },
  high: { scale: '1', fps: '60', samples: 'auto', shutter: '0.5', preset: 'slow', crf: '16' },
};
const PROFILE = opt('profile', 'low')!;
if (!PROFILES[PROFILE]) { console.error(`--profile must be one of ${Object.keys(PROFILES)}`); process.exit(1); }
/** explicit flag > profile value > upstream default */
const popt = (k: string, d: string) => opt(k) ?? PROFILES[PROFILE]![k] ?? d;
const SCALE_RAW = +popt('scale', '1');
const SCALE = SCALE_RAW < 1 ? Math.max(0.25, SCALE_RAW) : Math.min(4, Math.max(1, Math.round(SCALE_RAW)));
const OW = Math.round(1920 * SCALE), OH = Math.round(1080 * SCALE); // output size
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// --samples N (fixed) or --samples auto [--min-samples 4] [--max-samples 324] [--tol 3] (adaptive, see Engine.render)
const SAMPLES = popt('samples', '1') === 'auto'
  ? { min: +popt('min-samples', '4'), max: +popt('max-samples', '324'), tol: +popt('tol', '3') }
  : +popt('samples', '1');
const SHUTTER = +popt('shutter', '0.5');
const hist = (h: Record<string, number>) => Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ');

async function reachable(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

async function ensureServer(): Promise<{ url: string; stop: () => void }> {
  const url = opt('url', 'http://localhost:5173')!;
  if (await reachable(url)) return { url, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  // no live reload: a file saved mid-render must not reload the page
  const vite = path.join(APP, 'node_modules/vite/bin/vite.js');
  const proc = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: APP, stdio: 'ignore', env: { ...process.env, SMG_NO_HMR: '1' } });
  const u = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await reachable(u)); i++) await sleep(100);
  if (!(await reachable(u))) throw new Error(`vite did not start on ${u}`);
  return { url: u, stop: () => proc.kill() };
}

// the GPU backend per OS: Metal on macOS, D3D11 on Windows, the default (GL/Vulkan) elsewhere
const ANGLE = opt('angle');
const GPU_ARGS = [...(ANGLE ? [`--use-angle=${ANGLE}`, ...(ANGLE === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu'])]
  : process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : []),
  '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

async function openPage(url: string) {
  const launch = (channel?: string) => chromium.launch({
    channel: process.env.CHROME_PATH ? undefined : channel,
    executablePath: process.env.CHROME_PATH || undefined,
    headless: !flag('headed'),
    args: GPU_ARGS,
  });
  const want = opt('browser', 'chrome')!;
  let browser;
  try { browser = await launch(want); } catch (e) {
    if (process.env.CHROME_PATH || want !== 'chrome') throw e;
    console.error('Chrome not found, trying Microsoft Edge (set CHROME_PATH to pick a browser)');
    browser = await launch('msedge');
  }
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const only = opt('only');
  await page.goto(`${url}/?export=1${only ? `&only=${only}` : ''}${SCALE !== 1 ? `&scale=${SCALE}` : ''}`);
  console.error(`profile ${PROFILE}: ${OW}x${OH}, samples ${typeof SAMPLES === 'number' ? SAMPLES : `auto ${SAMPLES.min}-${SAMPLES.max}`}, shutter ${SHUTTER}`);
  await page.waitForFunction(() => (window as any).__smg?.ready || (window as any).__smg?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__smg.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const size: [number, number] = await page.evaluate(() => [(window as any).__smg.width ?? 1920, (window as any).__smg.height ?? 1080]);
  if (size[0] !== OW || size[1] !== OH) throw new Error(`app renders ${size[0]}x${size[1]}, expected ${OW}x${OH} (--scale ${SCALE})`);
  const sceneErrors: string[] = await page.evaluate(() => (window as any).__smg.errors);
  if (sceneErrors.length) console.error('SCENE ERRORS:\n' + sceneErrors.join('\n'));
  return { browser, page, logs };
}

async function stills(page: Page, times: number[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const t of times) {
    const k: number = await page.evaluate(([t, s, sh]) => (window as any).__smg.still(t, s, sh), [t, SAMPLES, SHUTTER] as const);
    const f = path.join(outDir, `f_${t.toFixed(2).padStart(7, '0')}.png`);
    if (typeof SAMPLES !== 'number') console.log(`t=${t}: ${k} sub-frames`);
    // at scale > 1 the canvas is shown downscaled on the page: save the full-res pixel buffer instead
    if (SCALE !== 1) writeFileSync(f, Buffer.from(await page.evaluate(() => (window as any).__smg.png()), 'base64'));
    else await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    files.push(f);
  }
  return files;
}

async function sheet(page: Page, times: number[], cols: number, out: string) {
  const dataUrl: string = await page.evaluate(async ({ times, cols }) => {
    const P = (window as any).__smg;
    const cw = 480, ch = 270, pad = 4, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      P.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      c.fillStyle = '#ddd'; c.font = '13px monospace'; c.fillText(`${t.toFixed(2)}s`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png');
  }, { times, cols });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

async function video(page: Page, from: number, to: number, fps: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const crf = popt('crf', '16');
  // the soundtrack named in public/data/audio.json ("file"); none (or --noaudio) renders silent
  const aj = path.join(APP, 'public/data/audio.json');
  const file: string | null = existsSync(aj) ? (JSON.parse(readFileSync(aj, 'utf8')).file ?? null) : null;
  const audio = file ? path.join(APP, 'public/audio', file) : '';
  const withAudio = !flag('noaudio') && !!file && existsSync(audio);
  const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${OW}x${OH}`, '-r', String(fps), '-i', 'pipe:0'];
  if (withAudio) args.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  args.push('-vf', 'vflip', '-c:v', 'libx264', '-preset', popt('preset', 'slow'), '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'grain', '-x264-params', opt('x264', 'aq-mode=3')!);
  if (withAudio) args.push('-c:a', 'aac', '-b:a', '320k', '-shortest');
  args.push('-movflags', '+faststart', out);
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.on('error', (e) => { console.error(`cannot run ${FFMPEG}: ${e.message} (install ffmpeg, or set FFMPEG=<path>)`); process.exit(1); });
  const ffDone = new Promise<number>((res) => ff.on('close', (c) => res(c ?? 0)));
  let frames = 0;
  const total = Math.round(to * fps) - Math.round(from * fps);
  const t0 = performance.now();
  const wss = new WebSocketServer({ port: 0, maxPayload: Math.max(64 * 1024 * 1024, OW * OH * 4 + 1024) });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const port = (wss.address() as { port: number }).port;
  wss.on('connection', (ws) => {
    // frames are written in order; each ack tells the page it may render one more (bounded memory at 4K)
    let chain = Promise.resolve();
    ws.on('message', (msg: Buffer, isBinary: boolean) => {
      if (!isBinary) return;
      chain = chain.then(async () => {
        if (!ff.stdin.write(msg)) await new Promise<void>((r) => ff.stdin.once('drain', () => r()));
        frames++;
        ws.send(String(frames));
        if (frames % 60 === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
        }
      });
    });
  });
  const used: Record<string, number> = await page.evaluate((o) => (window as any).__smg.stream(o), { from, to, fps, ws: `ws://localhost:${port}`, samples: SAMPLES, shutter: SHUTTER, inflight: 4 });
  while (frames < total) await sleep(20);
  ff.stdin.end();
  const code = await ffDone;
  wss.close();
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  console.log(`\nwrote ${out} (${frames} frames in ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`sub-frames per frame (count:frames): ${hist(used)}`);
}

const { url, stop } = await ensureServer();
const { browser, page, logs } = await openPage(url);
try {
  if (mode === 'gpu') {
    console.log(await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }));
  } else if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    const files = await stills(page, times, opt('out', path.join(ROOT, 'out/stills'))!);
    console.log(files.join('\n'));
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', '10')!, n = +opt('n', '12')!;
    let times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    if (flag('cuts')) {
      // 4 frames around every timeline boundary: 2 frames before, 2 after
      const tl: { id: string; start: number }[] = await page.evaluate(() => (window as any).__smg.timeline);
      times = tl.slice(1).flatMap((e) => [e.start - 0.1, e.start - 1 / 60, e.start + 1 / 60, e.start + 0.1]);
    }
    const out = opt('out', path.join(ROOT, `out/sheets/sheet_${from}-${to}.png`))!;
    await sheet(page, times, +opt('cols', '4')!, out);
    console.log(out);
  } else if (mode === 'perf') {
    const from = +opt('from', '0')!, to = +opt('to', '5')!;
    const r = await page.evaluate(async ({ from, to, samples, shutter }) => {
      const P = (window as any).__smg;
      const ms: number[] = [];
      const buf = new Uint8Array(P.width * P.height * 4);
      P.still(from);
      const used: Record<number, number> = {};
      for (let t = from; t < to; t += 1 / 60) {
        const a = performance.now();
        const k = P.engine.render(t, 1 / 60, false, samples, shutter);
        used[k] = (used[k] ?? 0) + 1;
        await P.engine.readPixelsAsync(buf);
        ms.push(performance.now() - a);
      }
      ms.sort((a, b) => a - b);
      return { n: ms.length, avg: ms.reduce((a, b) => a + b, 0) / ms.length, p50: ms[ms.length >> 1], p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1], used };
    }, { from, to, samples: SAMPLES, shutter: SHUTTER });
    console.log(`frames ${r.n}  avg ${r.avg.toFixed(1)}ms  p50 ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  max ${r.max.toFixed(1)}  sub-frames ${hist(r.used)}`);
  } else if (mode === 'video') {
    const dur: number = await page.evaluate(() => (window as any).__smg.duration);
    await video(page, +opt('from', '0')!, +opt('to', String(dur))!, +popt('fps', '60'), path.resolve(opt('out', path.join(ROOT, 'out/video.mp4'))!));
  }
  if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
} finally {
  await browser.close();
  stop();
}
