#!/usr/bin/env python3
"""tts.py: synthesise narration lines with edge-tts (Microsoft Edge's online neural voices; free, no key).

  uv run --python 3.12 --with edge-tts python tts.py jobs.json --out assets/tts [--no-cache]

jobs.json = [{"id": 0, "text": "...", "voice": "zh-CN-XiaoxiaoNeural", "rate": "+0%", "pitch": "+0Hz", "volume": "+0%"}, ...]
Writes one MP3 per line (named by a hash of text + voice settings, so re-runs only synthesise changed lines) and
manifest.json = [{"id", "file", "voice", "words": [[start_s, end_s, "word"], ...]}, ...] in job order. Word boundaries
come from the service (empty when a voice doesn't send them). story_timeline.mjs runs this for --mode=tts.
Behind a proxy set HTTPS_PROXY (e.g. http://127.0.0.1:7890); it is passed to edge-tts.
Voices: `uv run --with edge-tts edge-tts --list-voices` (zh-CN-XiaoxiaoNeural / XiaoyiNeural / YunxiNeural /
YunxiaNeural, en-US-AnaNeural / JennyNeural / GuyNeural, ...).
"""
import argparse
import asyncio
import hashlib
import json
import os
import sys

import edge_tts


def key(j):
    s = '|'.join(str(j.get(k, '')) for k in ('text', 'voice', 'rate', 'pitch', 'volume'))
    return hashlib.sha1(s.encode('utf-8')).hexdigest()[:12]


async def one(j, path, proxy, tries=3):
    kw = dict(rate=j.get('rate', '+0%'), pitch=j.get('pitch', '+0Hz'), volume=j.get('volume', '+0%'), proxy=proxy)
    for attempt in range(tries):
        try:
            try:
                com = edge_tts.Communicate(j['text'], j['voice'], boundary='WordBoundary', **kw)
            except TypeError:                       # edge-tts < 7 has no boundary argument (always word boundaries)
                com = edge_tts.Communicate(j['text'], j['voice'], **kw)
            audio, words = bytearray(), []
            async for c in com.stream():
                if c['type'] == 'audio':
                    audio += c['data']
                elif c['type'] in ('WordBoundary', 'SentenceBoundary'):
                    s = c['offset'] / 1e7
                    words.append([round(s, 3), round(s + c['duration'] / 1e7, 3), c['text']])
            if not audio:
                raise RuntimeError('no audio received')
            with open(path, 'wb') as f:
                f.write(audio)
            return words
        except Exception as e:                      # network hiccups: retry
            if attempt == tries - 1:
                raise
            print(f'  retry line {j["id"]}: {e}', file=sys.stderr)
            await asyncio.sleep(1.5 * (attempt + 1))


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('jobs')
    ap.add_argument('--out', default='assets/tts')
    ap.add_argument('--no-cache', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    jobs = json.load(open(a.jobs, encoding='utf-8'))
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy') or os.environ.get('ALL_PROXY') or None
    out = []
    for j in jobs:
        path = os.path.join(a.out, f'{key(j)}.mp3')
        meta = path[:-4] + '.json'
        if not a.no_cache and os.path.exists(path) and os.path.exists(meta):
            words = json.load(open(meta, encoding='utf-8'))
            print(f'  cached {j["id"]:>3}  {j["text"]}')
        else:
            words = await one(j, path, proxy)
            json.dump(words, open(meta, 'w', encoding='utf-8'), ensure_ascii=False)
            print(f'  tts    {j["id"]:>3}  {j["voice"]}  {j["text"]}')
        out.append({'id': j['id'], 'file': os.path.abspath(path), 'voice': j['voice'], 'words': words})
    json.dump(out, open(os.path.join(a.out, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    asyncio.run(main())
