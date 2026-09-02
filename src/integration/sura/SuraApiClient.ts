import type {
  ApiResponse,
  CompletedSession,
  GameResult,
  StartedSession,
  SuraSessionContext,
  ValidatedSession,
} from "./SuraTypes";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ISuraApiClient {
  validateSession(
    context: SuraSessionContext,
  ): Promise<ApiResponse<ValidatedSession>>;

  startSession(
    context: SuraSessionContext,
  ): Promise<ApiResponse<StartedSession>>;

  completeSession(
    context: SuraSessionContext,
    result: GameResult,
  ): Promise<ApiResponse<CompletedSession>>;
}

// ─── Real (stub) implementation ───────────────────────────────────────────────

/**
 * RealSuraApiClient — reference stub for a future direct-API flow.
 *
 * NOT used in the current parent-submit model. In parent-submit, the game
 * communicates only via postMessage (MINIGAME_COMPLETED). The SURA host
 * receives the score and calls its own backend. No HTTP requests are made
 * from the game.
 *
 * This class is kept as documentation of the API shape in case a future
 * flow requires direct backend calls from the game. At that point, replace
 * each method body with the real fetch call once SURA provides the endpoints,
 * headers, and response shapes.
 */
export class RealSuraApiClient implements ISuraApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async validateSession(
    _context: SuraSessionContext,
  ): Promise<ApiResponse<ValidatedSession>> {
    return this.notImplemented<ValidatedSession>();
  }

  async startSession(
    _context: SuraSessionContext,
  ): Promise<ApiResponse<StartedSession>> {
    return this.notImplemented<StartedSession>();
  }

  async completeSession(
    _context: SuraSessionContext,
    _result: GameResult,
  ): Promise<ApiResponse<CompletedSession>> {
    return this.notImplemented<CompletedSession>();
  }

  private notImplemented<T>(): ApiResponse<T> {
    return {
      success: false,
      errors:  [],
      message: `[RealSuraApiClient] Real endpoint not yet configured. Base URL: ${this.baseUrl}`,
    };
  }
}
