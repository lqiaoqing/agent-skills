// lyrics.js: [start, end, text, opts?] in video seconds. Generate it with
//   node <SKILL>/scripts/lyrics_to_ly.mjs assets/lyrics.lrc --out=src/lyrics.js
// (LRC / SRT / VTT / TSV / JSON). Plain text? Align it first with scripts/align_lyrics.py (faster-whisper).
// opts (hand-added): { sing: seconds to sweep the line, hold: seconds to keep it up, pun: { from, to, at } } — see karaoke.js.
const LY = [
];
