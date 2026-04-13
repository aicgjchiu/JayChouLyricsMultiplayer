// client/src/distraction.js
// Plays random short audio clips at random intervals to distract the recorder.
// URLs are URL-encoded because filenames contain Chinese characters.
const DISTRACTION_POOL = [
  '七月的極光_1284.64-1288.04.mp3',
  '淘金小鎮_2357.48-2362.2.mp3',
  '聖誕星_2765.72-2770.3.mp3',
  '淘金小鎮_2340.48-2344.1.mp3',
  '女兒殿下_2139.44-2143.88.mp3',
  '太陽之子_405-413.mp3',
  'i_do_1681.8-1686.46.mp3',
  '誰稀罕_1087.2-1092.6.mp3',
].map(f => `/audio/${encodeURIComponent(f)}`);

export class DistractionScheduler {
  constructor({ volume = 0.35 } = {}) {
    this.audio = new Audio();
    this.audio.volume = volume;
    this.audio.preload = 'auto';
    this.stopped = false;
    this._timer = null;
    this.audio.addEventListener('ended', () => this._scheduleNext());
    this.audio.addEventListener('error', () => this._scheduleNext());
  }

  start() {
    if (this.stopped) return;
    this._playRandom();
  }

  stop() {
    this.stopped = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    try { this.audio.pause(); } catch {}
    this.audio.src = '';
  }

  _playRandom() {
    if (this.stopped) return;
    const src = DISTRACTION_POOL[Math.floor(Math.random() * DISTRACTION_POOL.length)];
    this.audio.src = src;
    this.audio.currentTime = 0;
    this.audio.play().catch(() => this._scheduleNext());
  }

  _scheduleNext() {
    if (this.stopped) return;
    const waitMs = 3000 + Math.floor(Math.random() * 5000);
    this._timer = setTimeout(() => this._playRandom(), waitMs);
  }
}
