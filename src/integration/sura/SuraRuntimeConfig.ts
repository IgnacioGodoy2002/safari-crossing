import type { IntegrationMode } from "./SuraTypes";

const PROVISIONAL_GAME_ID      = "crossy_road";
const PROVISIONAL_GAME_VERSION = "1.0.0";

export type SuraConfig = {
  readonly mode:          IntegrationMode;
  readonly gameId:        string;
  readonly gameVersion:   string;
  readonly parentOrigin:  string;
  readonly apiBaseUrl:    string;
  readonly isEmbedded:    boolean;
  readonly isDev:         boolean;
};

function buildConfig(): SuraConfig {
  const isDev      = import.meta.env.DEV as boolean;
  const isEmbedded = window.parent !== window;

  const gameId      = (import.meta.env.VITE_SURA_GAME_ID       as string | undefined) ?? PROVISIONAL_GAME_ID;
  const gameVersion = (import.meta.env.VITE_SURA_GAME_VERSION  as string | undefined) ?? PROVISIONAL_GAME_VERSION;
  const envOrigin   = (import.meta.env.VITE_SURA_PARENT_ORIGIN as string | undefined) ?? "";
  const envBaseUrl  = (import.meta.env.VITE_SURA_API_BASE_URL  as string | undefined) ?? "";

  let mode: IntegrationMode;

  if (!isDev) {
    const envMode = import.meta.env.VITE_SURA_INTEGRATION_MODE as string | undefined;
    mode = envMode === "sura" ? "sura" : "standalone";
  } else {
    const params = new URLSearchParams(window.location.search);
    mode = params.get("sura_mode") === "mock" ? "sura-mock" : "standalone";
  }

  let parentOrigin = envOrigin;
  if (mode === "sura-mock" && !parentOrigin) {
    parentOrigin = window.location.origin;
  }

  if (mode === "sura" && !parentOrigin) {
    console.error(
      "[SuraRuntimeConfig] VITE_SURA_PARENT_ORIGIN is required when " +
      "VITE_SURA_INTEGRATION_MODE=sura. Falling back to standalone mode.",
    );
    mode = "standalone";
  }

  return { mode, gameId, gameVersion, parentOrigin, apiBaseUrl: envBaseUrl, isEmbedded, isDev };
}

export const SURA_CONFIG: SuraConfig = buildConfig();
