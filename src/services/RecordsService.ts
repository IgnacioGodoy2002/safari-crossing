const KEY_BEST        = 'crossy-road:best-score';
const KEY_LEADERBOARD = 'crossy-road:leaderboard';

export interface LeaderEntry {
  name:  string;
  score: number;
}

export const RecordsService = {
  getBest(): number {
    try { return Number(localStorage.getItem(KEY_BEST) ?? 0); } catch { return 0; }
  },

  saveBest(score: number): boolean {
    const prev = this.getBest();
    if (score > prev) {
      try { localStorage.setItem(KEY_BEST, String(score)); } catch {}
      return true;
    }
    return false;
  },

  getLeaderboard(): LeaderEntry[] {
    try {
      const raw = localStorage.getItem(KEY_LEADERBOARD);
      return raw ? (JSON.parse(raw) as LeaderEntry[]) : [];
    } catch { return []; }
  },

  addEntry(name: string, score: number): void {
    if (score <= 0) return;
    const entries = this.getLeaderboard();
    entries.push({ name: (name.trim().toUpperCase() || '---').slice(0, 12), score });
    entries.sort((a, b) => b.score - a.score);
    try { localStorage.setItem(KEY_LEADERBOARD, JSON.stringify(entries.slice(0, 50))); } catch {}
  },
};
