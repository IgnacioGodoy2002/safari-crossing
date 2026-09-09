import { getSuraService } from "../integration/sura/SuraIntegrationService";
import { RecordsService } from "./RecordsService";

export type LeaderboardEntry = {
  alias:            string;
  score:            number;
  isCurrentPlayer?: boolean;
};

type ApiLeaderboardEntry = {
  position:   number;
  alias:      string | null;
  best_score: number;
};

type ApiLeaderboardResponse = {
  data: {
    entries: ApiLeaderboardEntry[];
  };
};

/**
 * Standalone fallback — the device's own local records, same ones the game
 * has always shown. Used whenever there's no real SURA session to fetch a
 * board from (a plain browser tab, or before/without the handshake).
 */
function localEntries(): LeaderboardEntry[] {
  return RecordsService.getLeaderboard().map((entry) => ({
    alias: entry.name,
    score: entry.score,
  }));
}

/**
 * Real leaderboard for this mini-game, via the PUBLIC (unauthenticated)
 * endpoint — the game runs in a sandboxed iframe/WebView with no real player
 * session (INIT_GAME only carries a launch-correlation hash, not an access
 * token), so it can't call the authenticated leaderboard route.
 *
 * `gameId` and `apiBaseUrl` come from the host's INIT_GAME payload, not from
 * build-time config — the same build has to work in every environment,
 * including the native app, which has no fixed API host to hardcode.
 *
 * Falls back to the local board in standalone mode, before the handshake
 * completes, or if the fetch fails, so the screen never renders empty.
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  let service: ReturnType<typeof getSuraService> | null = null;
  try { service = getSuraService(); } catch { /* not initialised yet */ }

  const gameId     = service?.getGameId() ?? null;
  const apiBaseUrl = service?.getApiBaseUrl() ?? null;
  if (!service || service.mode === "standalone" || !gameId || !apiBaseUrl) {
    return localEntries();
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/minigames/v1/games/${gameId}/leaderboard?per_page=12`,
    );
    if (!response.ok) return localEntries();

    const body = (await response.json()) as ApiLeaderboardResponse;
    const myNickname = service.getNickname();

    return body.data.entries.map((entry) => ({
      // A player with no nickname comes back as `alias: null` — a generic
      // placeholder, never an invented name.
      alias:           entry.alias ?? `Player ${entry.position}`,
      score:           entry.best_score,
      isCurrentPlayer: myNickname !== null && entry.alias === myNickname,
    }));
  } catch {
    return localEntries();
  }
}
