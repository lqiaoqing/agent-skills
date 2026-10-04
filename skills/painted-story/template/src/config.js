// config.js: project settings (scripts/new_project.mjs fills these in from the audio analysis).
//   duration: the video's length in seconds.
//   bpm:      the rhythm that bounces, dances and pulse() follow. If the video has music, set this to the song's tempo
//             (half-time for a ballad) and offset to the time in seconds of its first downbeat.
//   audio:    optional soundtrack muxed into the MP4 by render.mjs (path relative to the project).
const PROJECT = { title: 'painted-story', duration: 11, bpm: 120, offset: 0, audio: '' };
