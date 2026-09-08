import {
  SURA_MSG,
  type GameResult,
  type InitPayload,
  type IntegrationMode,
  type SuraIntegrationState,
  type SuraServiceListener,
  type SuraSessionContext,
} from "./SuraTypes";
import { SURA_CONFIG, GAME_SLUG } from "./SuraRuntimeConfig";
import { SuraBridge } from "./SuraBridge";
import { RecordsService } from "../../services/RecordsService";

// ─── State machine (parent-submit flow) ──────────────────────────────────────
//
// disabled        → (standalone — no bridge, no transitions)
// waiting-context → ready        (received valid INIT_GAME)
// ready           → playing      (startGameSession called — MINIGAME_STARTED sent)
// playing         → completed    (completeGameSession called — GAME_COMPLETE sent)
// completed       → ready        (new INIT_GAME received, or requestFreshSession())
// waiting-context
//   | ready
//   | completed    → error       (invalid INIT payload received)
//
// Parent-submit model: the game communicates ONLY via postMessage.
// No HTTP calls are made from the game. Score persistence is handled
// by the SURA host after it receives GAME_COMPLETE.

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: SuraIntegrationService | null = null;

export function initSuraService(): SuraIntegrationService {
  if (!_instance) _instance = new SuraIntegrationService();
  return _instance;
}

export function getSuraService(): SuraIntegrationService {
  if (!_instance) {
    throw new Error(
      "[SURA] SuraIntegrationService not initialised. Call initSuraService() first (from main.ts).",
    );
  }
  return _instance;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SuraIntegrationService {
  private state: SuraIntegrationState;
  private readonly bridge: SuraBridge;
  private context:  SuraSessionContext | null = null;
  private readonly subscribers = new Set<SuraServiceListener>();
  private initialised = false;

  constructor() {
    this.state  = SURA_CONFIG.mode === "standalone" ? "disabled" : "waiting-context";
    this.bridge = new SuraBridge(SURA_CONFIG);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  get mode(): IntegrationMode {
    return SURA_CONFIG.mode;
  }

  getState(): SuraIntegrationState {
    return this.state;
  }

  /** Correlation hash from the host's INIT_GAME — NOT a bearer token, never sent as one. */
  getSessionToken(): string | null {
    return this.context?.token ?? null;
  }

  /** The player's own display name, as sent by the host. */
  getNickname(): string | null {
    return this.context?.nickname ?? null;
  }

  /** The mini-game's backend UUID, from INIT_GAME — null until the handshake completes. */
  getGameId(): string | null {
    return this.context?.gameId || null;
  }

  /** Base URL for the (public) leaderboard fetch, from INIT_GAME — null until the handshake completes. */
  getApiBaseUrl(): string | null {
    return this.context?.apiBaseUrl || null;
  }

  /**
   * Called once from main.ts. Attaches the postMessage bridge and notifies
   * the host that the game is ready to receive a session context.
   *
   * Must run as early as possible — the host's INIT_GAME can arrive as soon
   * as the iframe's own `load` event fires.
   */
  initialize(): void {
    if (this.initialised || SURA_CONFIG.mode === "standalone") return;
    this.initialised = true;
    this.bridge.start();
    this.registerBridgeHandlers();
    this.notifyReady();
  }

  /**
   * Asks the host for a new session by re-sending MINIGAME_READY — the same
   * message that opens the handshake the first time. Per the host's
   * contract, it re-sends INIT_GAME "when it receives your MINIGAME_READY",
   * so this is also how a *second* session gets requested.
   *
   * Needed because after GAME_COMPLETE the state is "completed" and nothing
   * else moves it back to "ready": the menu gates JUGAR on
   * `state === "ready"`, so without this, returning to the menu after
   * finishing a run leaves JUGAR permanently disabled.
   *
   * No-op outside the states where asking again makes sense.
   */
  requestFreshSession(): void {
    if (SURA_CONFIG.mode === "standalone") return;
    const resettable: SuraIntegrationState[] = ["completed", "error", "unauthorized"];
    if (!resettable.includes(this.state)) return;

    this.setState("waiting-context");
    this.notifyReady();
  }

  /**
   * Subscribe to service events (state changes, host pause/resume).
   */
  subscribe(listener: SuraServiceListener): void {
    this.subscribers.add(listener);
  }

  unsubscribe(listener: SuraServiceListener): void {
    this.subscribers.delete(listener);
  }

  /**
   * Standalone: returns true immediately.
   * SURA (parent-submit): sends MINIGAME_STARTED, transitions to "playing".
   */
  async startGameSession(): Promise<boolean> {
    if (SURA_CONFIG.mode === "standalone") return true;
    if (this.state !== "ready") return false;
    if (!this.context) return false;

    this.setState("playing");
    this.bridge.sendToParent(SURA_MSG.STARTED, {
      sessionId: this.context.sessionId,
      gameId:    this.context.gameId,
    });
    return true;
  }

  /**
   * Called after game over to report the result.
   *
   * SURA (parent-submit): sends the flat GAME_COMPLETE message via
   * postMessage. The host receives the score and is responsible for
   * persisting it. No HTTP calls are made from the game. The flat contract
   * has no room for isNewRecord/estimatedSuraPoints/etc — those exist only
   * for local UI, they don't survive onto the wire.
   */
  async completeGameSession(result: GameResult): Promise<void> {
    if (SURA_CONFIG.mode === "standalone") return;
    if (this.state !== "playing") return;
    if (!this.context) return;

    this.bridge.sendCompletion({
      sessionId:  this.context.sessionId,
      score:      result.score,
      provider:   GAME_SLUG,
      durationMs: result.durationMs,
    });
    this.setState("completed");
  }

  /**
   * Ask the parent (SURA app) to close the minigame iframe.
   */
  requestExit(): void {
    if (SURA_CONFIG.mode !== "sura") return;
    this.bridge.sendToParent(SURA_MSG.EXIT_REQUESTED, {});
  }

  destroy(): void {
    this.bridge.destroy();
    this.subscribers.clear();
    _instance = null;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private registerBridgeHandlers(): void {
    this.bridge.on(SURA_MSG.INIT,   (env) => this.handleInit(env.payload));
    this.bridge.on(SURA_MSG.PAUSE,  ()    => this.handleHostPause());
    this.bridge.on(SURA_MSG.RESUME, ()    => this.handleHostResume());
  }

  /**
   * MINIGAME_READY has to go out before the host's origin is known (that's
   * derived from the host's own INIT_GAME, which hasn't arrived yet) — the
   * bridge always sends it with target "*".
   */
  private notifyReady(): void {
    this.bridge.sendReady({ game_id: GAME_SLUG, version: SURA_CONFIG.gameVersion });
  }

  private handleInit(payload: Record<string, unknown>): void {
    const resettable: SuraIntegrationState[] = [
      "waiting-context", "completed", "error", "unauthorized",
    ];
    if (!resettable.includes(this.state)) return;

    // Validate required INIT fields. Real contract: camelCase, no player_id
    // (the host identifies the player from the session token itself).
    // gameId/apiBaseUrl/bestScore are optional so an older host that hasn't
    // rolled them out yet doesn't hard-fail the handshake.
    const p = payload as Partial<InitPayload>;
    const token     = typeof p.token     === "string" ? p.token     : null;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : null;

    if (!token || !sessionId) {
      this.setState("error");
      this.bridge.sendToParent(SURA_MSG.ERROR, { message: "Invalid INIT_GAME payload." });
      return;
    }

    // Store context in memory only — never logged, never persisted.
    this.context = {
      token,
      sessionId,
      gameId:     typeof p.gameId     === "string" ? p.gameId     : GAME_SLUG,
      apiBaseUrl: typeof p.apiBaseUrl === "string" ? p.apiBaseUrl : "",
      nickname:   typeof p.username   === "string" ? p.username   : undefined,
      bestScore:  typeof p.bestScore  === "number" ? p.bestScore  : undefined,
    };

    // Reconcile the local (per-device) record against the account's real
    // best score. Only ever raises it, never lowers it — a missing/stale/
    // zero remote value (older host not rolled out yet, no runs for this
    // account yet) must not erase a real local win that hasn't round-
    // tripped to the backend yet.
    if (this.context.bestScore !== undefined) {
      RecordsService.saveBest(this.context.bestScore);
    }

    // Acknowledge receipt of the context.
    this.bridge.sendToParent(SURA_MSG.SESSION_ACCEPTED, {
      sessionId,
      gameId: this.context.gameId,
    });

    // parent-submit: context is trusted as-is — no backend validation needed.
    // Enable the JUGAR button immediately.
    this.setState("ready");
  }

  private handleHostPause(): void {
    this.emit({ type: "host-pause" });
  }

  private handleHostResume(): void {
    this.emit({ type: "host-resume" });
  }

  private setState(next: SuraIntegrationState): void {
    this.state = next;
    this.emit({ type: "state-changed", state: next });
  }

  private emit(event: Parameters<SuraServiceListener>[0]): void {
    for (const listener of this.subscribers) {
      listener(event);
    }
  }
}
