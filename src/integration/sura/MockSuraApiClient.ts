import type {
  ApiResponse,
  ApiSuccess,
  CompletedSession,
  GameResult,
  StartedSession,
  SuraSessionContext,
  ValidatedSession,
} from "./SuraTypes";
import type { ISuraApiClient } from "./SuraApiClient";

// ─── Mock token values ────────────────────────────────────────────────────────
//
// Use these tokens in the test-host page to exercise each code path:
//   mock-valid-token        → all calls succeed
//   mock-invalid-token      → validateSession returns 401
//   mock-expired-token      → validateSession returns 403
//   mock-network-error      → validateSession throws (simulated network failure)

const VALID_TOKEN         = "mock-valid-token";
const EXPIRED_TOKEN       = "mock-expired-token";
const NETWORK_ERROR_TOKEN = "mock-network-error";

const DELAY_MS = 400;

/**
 * MockSuraApiClient — local-only simulation for development.
 *
 * This client never makes real HTTP requests. It reads the session token and
 * returns predictable responses so every integration state can be exercised
 * without a live SURA backend.
 *
 * Only instantiated in DEV mode (guard is in SuraIntegrationService.buildClient).
 */
export class MockSuraApiClient implements ISuraApiClient {
  async validateSession(
    context: SuraSessionContext,
  ): Promise<ApiResponse<ValidatedSession>> {
    await delay();
    return this.checkToken<ValidatedSession>(context.token, {
      success: true,
      data: {
        session_id: context.sessionId,
        player_id:  context.playerId,
        game_id:    context.gameId,
      },
      message: "Session validated (mock).",
    });
  }

  async startSession(
    context: SuraSessionContext,
  ): Promise<ApiResponse<StartedSession>> {
    await delay();
    return this.checkToken<StartedSession>(context.token, {
      success: true,
      data: {
        session_id: context.sessionId,
        game_id:    context.gameId,
      },
      message: "Session started (mock).",
    });
  }

  async completeSession(
    context: SuraSessionContext,
    result: GameResult,
  ): Promise<ApiResponse<CompletedSession>> {
    await delay();
    return this.checkToken<CompletedSession>(context.token, {
      success: true,
      data: {
        session_id: context.sessionId,
        game_id:    context.gameId,
        score:      result.score,
        status:     "completed",
      },
      message: "Session completed (mock).",
    });
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private checkToken<T>(
    token: string,
    success: ApiSuccess<T>,
  ): ApiResponse<T> {
    if (token === NETWORK_ERROR_TOKEN) {
      throw new Error("Simulated network error (mock-network-error token).");
    }
    if (token === EXPIRED_TOKEN) {
      return {
        success: false,
        errors:  [{ code: "session_expired" }],
        message: "403 Forbidden — session expired (mock).",
      };
    }
    if (token !== VALID_TOKEN) {
      return {
        success: false,
        errors:  [{ code: "unauthorized" }],
        message: "401 Unauthorized — invalid token (mock).",
      };
    }
    return success;
  }
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}
