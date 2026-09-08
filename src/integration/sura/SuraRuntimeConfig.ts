import type { IntegrationMode } from "./SuraTypes";

const GAME_SLUG    = "safari_crossing";
const GAME_VERSION = "1.0.0";

export type SuraConfig = {
  readonly mode:        IntegrationMode;
  readonly gameVersion: string;
  readonly isEmbedded:  boolean;
  readonly isDev:       boolean;
};

/**
 * Mode, parentOrigin, gameId and apiBaseUrl used to be decided at build time
 * via VITE_SURA_* env vars — one build per environment, and no answer at all
 * for the native app's WebView (no host origin to hardcode).
 *
 * Now only `isEmbedded` is a build-independent runtime fact, checked once at
 * load. Everything else (parentOrigin, gameId, apiBaseUrl) comes from the
 * host's own INIT_GAME payload — see SuraIntegrationService.handleInit and
 * SuraBridge's dynamic parentOrigin capture. One build works everywhere
 * (matches Pengu Rush / Coin Kingdom / Joystick Pop).
 */
function buildConfig(): SuraConfig {
  const nativeWebView = (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  const isEmbedded = window.parent !== window || Boolean(nativeWebView);

  // Never standalone while embedded — an iframe or native WebView is always
  // a real host, whether or not this happens to be a dev build.
  const mode: IntegrationMode = isEmbedded ? "sura" : "standalone";

  return {
    mode,
    gameVersion: GAME_VERSION,
    isEmbedded,
    isDev: import.meta.env.DEV as boolean,
  };
}

// Singleton — built once at module load time.
export const SURA_CONFIG: SuraConfig = buildConfig();

// Self-announced in MINIGAME_READY, before the host's INIT_GAME (and its real
// backend UUID) has arrived. Purely informational on the host's side.
export { GAME_SLUG };
