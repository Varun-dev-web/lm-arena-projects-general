const SCORE_KEY = 'bloom.scores.v1';
const SOUND_KEY = 'bloom.sound.v1';
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export class LocalStore {
  constructor(storage) {
    this.persistent = true;
    this.memory = [];
    try {
      this.storage = storage ?? globalThis.localStorage;
      if (!this.storage) this.persistent = false;
    } catch {
      this.persistent = false;
    }
    this.scores = this.readScores();
  }

  readScores() {
    if (!this.persistent) return this.memory;
    try {
      const data = JSON.parse(this.storage.getItem(SCORE_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      return data.filter((entry) => entry && finite(entry.score) && entry.score <= 1_000_000_000 && Number.isInteger(entry.score) && finite(entry.streak) && finite(entry.date) && entry.date <= 8_640_000_000_000_000)
        .map((entry) => ({ score: entry.score, streak: Math.floor(entry.streak), date: entry.date, id: String(entry.id ?? entry.date) }))
        .sort((a, b) => b.score - a.score || b.streak - a.streak || a.date - b.date).slice(0, 5);
    } catch {
      return [];
    }
  }

  saveScore(score, streak) {
    const entry = { score: Math.max(0, Math.floor(score)), streak: Math.max(0, Math.floor(streak)), date: Date.now(), id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    const previousBest = this.scores[0]?.score ?? 0;
    this.scores = [...this.scores, entry].sort((a, b) => b.score - a.score || b.streak - a.streak || a.date - b.date).slice(0, 5);
    this.memory = this.scores;
    try {
      this.storage.setItem(SCORE_KEY, JSON.stringify(this.scores));
    } catch {
      this.persistent = false;
    }
    return { entry, isBest: entry.score > previousBest, saved: this.scores.some((item) => item.id === entry.id) };
  }

  clearScores() {
    this.scores = [];
    this.memory = [];
    try { this.storage.removeItem(SCORE_KEY); } catch { this.persistent = false; }
  }

  get sound() {
    try { return this.storage?.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  }

  set sound(enabled) {
    try { this.storage?.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch { /* Gameplay remains available without storage. */ }
  }
}
