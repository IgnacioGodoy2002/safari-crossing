import { Game } from "./game/Game";
import { SoundManager } from "./game/SoundManager";
import { MusicManager } from "./game/MusicManager";
import { RecordsService } from "./services/RecordsService";
import { fetchLeaderboard, type LeaderboardEntry } from "./services/LeaderboardService";
import { initSuraService } from "./integration/sura/SuraIntegrationService";
import { SURA_CONFIG } from "./integration/sura/SuraRuntimeConfig";
import { calcSuraPoints, LOCAL_SURA_REWARD_CONFIG } from "./config/suraRewardConfig";
import { t, setLang, getLang, type LangCode } from "./i18n";
import type { SuraIntegrationState, SuraServiceEvent } from "./integration/sura/SuraTypes";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const menuEl         = document.getElementById("menu")!;
const gameoverEl     = document.getElementById("end")!;
const counterEl      = document.getElementById("counter")!;
const pauseBtn       = document.getElementById("pause-btn") as HTMLButtonElement;
const pauseOverlay   = document.getElementById("pause-overlay")!;
const resumeBtn      = document.getElementById("resume-btn")!;
const pauseMenuBtn   = document.getElementById("pause-menu-btn")!;
const muteBtn        = document.getElementById("mute-btn") as HTMLButtonElement;
const rotateMsg      = document.getElementById("rotate-msg")!;

// menu
const menuRecordVal    = document.getElementById("menu-record-val");
const playBtn          = document.getElementById("play-btn") as HTMLButtonElement;
const langChips        = document.querySelectorAll<HTMLElement>("[data-lang]");
const menuSub          = document.getElementById("menu-sub")!;
const menuRankingLabel = document.getElementById("menu-ranking-label")!;
const menuTop3List     = document.getElementById("menu-top3-list")!;
const btnRanking       = document.getElementById("btn-ranking") as HTMLButtonElement;
const btnHowto         = document.getElementById("btn-howto") as HTMLButtonElement;

// leaderboard overlay
const lbOverlay  = document.getElementById("leaderboard-overlay")!;
const lbTitle    = document.getElementById("lb-title")!;
const lbList     = document.getElementById("lb-list")!;
const lbCloseBtn = document.getElementById("lb-close-btn")!;

// how to play overlay
const howtoOverlay   = document.getElementById("howto-overlay")!;
const howtoTitleEl   = document.getElementById("howto-title")!;
const howtoMove      = document.getElementById("howto-move")!;
const howtoAlt       = document.getElementById("howto-alt")!;
const howtoTouch     = document.getElementById("howto-touch")!;
const howtoObjective = document.getElementById("howto-objective")!;
const howtoCloseBtn  = document.getElementById("howto-close-btn")!;

// gameover
const goTitle      = document.getElementById("go-title")!;
const goScore      = document.getElementById("go-score")!;
const goRecord     = document.getElementById("go-record")!;
const goNewRecord  = document.getElementById("go-new-record")!;
const retryBtn     = document.getElementById("retry-btn")!;
const menuBtn      = document.getElementById("menu-btn")!;

// popup
const popupEl     = document.getElementById("sura-popup")!;
const popupTitle  = document.getElementById("popup-title")!;
const popupPoints = document.getElementById("popup-points")!;
const popupHint   = document.getElementById("popup-hint")!;
const popupBtn    = document.getElementById("popup-btn")!;

// ─── State ────────────────────────────────────────────────────────────────────

type AppState = "menu" | "playing" | "paused" | "gameover";
let appState: AppState = "menu";
let game: Game | null = null;
let currentScore = 0;
let playStartedAt = 0;

const sura = initSuraService();

// ─── SURA ─────────────────────────────────────────────────────────────────────

sura.subscribe(event => {
  if (event.type === "state-changed") {
    refreshSuraStatus(event.state);
    // The very first render of the menu happens before the host's INIT_GAME
    // round-trip completes, so it falls back to the local board. Once the
    // handshake finishes (gameId/apiBaseUrl now known), refresh so the real
    // leaderboard replaces it without needing a reload or language toggle.
    if (event.state === "ready" && appState === "menu") {
      void refreshTop3();
    }
  }
});

sura.initialize();

// ─── i18n ─────────────────────────────────────────────────────────────────────

function applyLang(): void {
  menuSub.textContent           = t("menu_subtitle");
  playBtn.textContent           = t("menu_play");
  menuRankingLabel.textContent  = t("menu_ranking");
  btnRanking.textContent        = t("menu_btn_ranking");
  btnHowto.textContent          = t("menu_btn_howto");
  lbTitle.textContent           = t("leaderboard_title");
  lbCloseBtn.textContent        = t("leaderboard_close");
  howtoTitleEl.textContent      = t("howto_title");
  howtoCloseBtn.textContent     = t("howto_close");

  // How-to content (hardcoded but translated via keys)
  howtoMove.textContent      = getLang() === "en"
    ? "Move your character"
    : getLang() === "pt" ? "Mover seu personagem" : "Mover tu personaje";
  howtoAlt.textContent       = getLang() === "en"
    ? "Alternative controls"
    : getLang() === "pt" ? "Controles alternativos" : "Controles alternativos";
  howtoTouch.textContent     = getLang() === "en"
    ? "Swipe in any direction"
    : getLang() === "pt" ? "Deslize em qualquer direção" : "Deslizá en cualquier dirección";
  howtoObjective.textContent = getLang() === "en"
    ? "Cross as many roads as possible without getting hit by cars or trains!"
    : getLang() === "pt"
    ? "Cruze o máximo de ruas sem ser atropelado por carros ou trens!"
    : "¡Cruzá la mayor cantidad de calles sin ser atropellado por autos o trenes!";

  void refreshTop3();
  langChips.forEach(chip => {
    chip.setAttribute("aria-pressed", chip.dataset.lang === getLang() ? "true" : "false");
  });
}

langChips.forEach(chip => {
  chip.addEventListener("click", () => {
    setLang(chip.dataset.lang as LangCode);
    applyLang();
  });
});

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"];

// Bumped on every refreshTop3/renderLeaderboard call so a slow fetch that
// resolves after a newer one started doesn't clobber the freshest result.
let top3Token = 0;
let lbToken   = 0;

async function refreshTop3(): Promise<void> {
  const token = ++top3Token;
  const entries = (await fetchLeaderboard()).slice(0, 3);
  if (token !== top3Token) return;

  renderEntries(menuTop3List, entries, "top3-item", "top3-medal", "top3-name", "top3-score");
}

async function renderLeaderboard(): Promise<void> {
  const token = ++lbToken;
  lbList.innerHTML = `<li class="top3-empty">${escapeHtml(t("leaderboard_loading"))}</li>`;
  const entries = await fetchLeaderboard();
  if (token !== lbToken) return;

  renderEntries(lbList, entries, "lb-item", "lb-medal", "lb-name", "lb-score", true);
}

function renderEntries(
  list:      HTMLElement,
  entries:   LeaderboardEntry[],
  itemClass: string,
  medalClass: string,
  nameClass:  string,
  scoreClass: string,
  showPos = false,
): void {
  list.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "top3-empty";
    empty.textContent = t("menu_no_records");
    list.appendChild(empty);
    return;
  }

  entries.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = itemClass + (entry.isCurrentPlayer ? ` ${itemClass}--me` : "");
    li.innerHTML = `
      <span class="${medalClass}">${MEDALS[i] ?? ""}</span>
      ${showPos ? `<span class="lb-pos">${i < 3 ? "" : `#${i + 1}`}</span>` : ""}
      <span class="${nameClass}">${escapeHtml(entry.alias)}</span>
      <span class="${scoreClass}">${entry.score}</span>
    `;
    list.appendChild(li);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

function showMenu(): void {
  appState = "menu";
  applyLang();
  gameoverEl.style.display      = "none";
  popupEl.style.display         = "none";
  pauseOverlay.style.display    = "none";
  lbOverlay.style.display       = "none";
  howtoOverlay.style.display    = "none";
  menuEl.style.display          = "flex";
  counterEl.style.display       = "none";
  pauseBtn.style.display        = "none";

  // Without this, JUGAR stays disabled forever after the first run: once
  // completeGameSession() moves the state to "completed", nothing else asks
  // the host for a fresh session. Re-sending MINIGAME_READY here mirrors
  // Pengu Rush / Coin Kingdom, whose host contract re-sends INIT_GAME upon
  // receiving it.
  sura.requestFreshSession();
}

// No status text shown to the player (matches Pengu Rush / Coin Kingdom) —
// "ready"/"sent" confirmations read as debug output, not something a player
// needs. JUGAR's own dimmed/disabled look already communicates "not yet".
function refreshSuraStatus(state: SuraIntegrationState): void {
  if (SURA_CONFIG.mode === "standalone") {
    playBtn.disabled = false;
    return;
  }

  playBtn.disabled = state !== "ready";
}

// ─── Leaderboard overlay ──────────────────────────────────────────────────────

btnRanking.addEventListener("click", () => {
  void renderLeaderboard();
  lbOverlay.style.display = "flex";
});

lbCloseBtn.addEventListener("click", () => {
  lbOverlay.style.display = "none";
});

lbOverlay.addEventListener("click", (e) => {
  if (e.target === lbOverlay) lbOverlay.style.display = "none";
});

// ─── How to play overlay ──────────────────────────────────────────────────────

btnHowto.addEventListener("click", () => {
  howtoOverlay.style.display = "flex";
});

howtoCloseBtn.addEventListener("click", () => {
  howtoOverlay.style.display = "none";
});

howtoOverlay.addEventListener("click", (e) => {
  if (e.target === howtoOverlay) howtoOverlay.style.display = "none";
});

// ─── Play ─────────────────────────────────────────────────────────────────────

// How long REINTENTAR waits for the host to grant a fresh session before
// giving up — requestFreshSession() was already fired the moment the Game
// Over screen appeared, so this only covers unusually slow round-trips.
const RETRY_SESSION_TIMEOUT_MS = 4000;

function waitForSuraReady(timeoutMs: number): Promise<boolean> {
  if (sura.getState() === "ready") return Promise.resolve(true);

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      sura.unsubscribe(listener);
      clearTimeout(timer);
      resolve(result);
    };
    const listener = (event: SuraServiceEvent) => {
      if (event.type === "state-changed" && event.state === "ready") finish(true);
    };
    sura.subscribe(listener);
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

async function startGame(): Promise<void> {
  if (SURA_CONFIG.mode !== "standalone" && sura.getState() !== "ready") {
    // Not ready yet — most likely REINTENTAR beat the host's response to
    // the requestFreshSession() sent when the Game Over screen appeared.
    // Ask again and give it a little more time instead of silently doing
    // nothing, which just looked like the game had frozen.
    sura.requestFreshSession();
    const gotReady = await waitForSuraReady(RETRY_SESSION_TIMEOUT_MS);
    if (!gotReady) {
      // Host still hasn't granted a session — bounce to the menu (which
      // shows the real waiting/error status) rather than leaving the
      // player stuck on an unresponsive screen.
      showMenu();
      return;
    }
  }

  const ok = await sura.startGameSession();
  if (!ok && SURA_CONFIG.mode !== "standalone") return;

  appState = "playing";
  playStartedAt = Date.now();
  menuEl.style.display       = "none";
  gameoverEl.style.display   = "none";
  pauseOverlay.style.display = "none";
  counterEl.style.display    = "block";
  counterEl.textContent      = "0";
  pauseBtn.style.display     = "flex";

  try {
    if (!game) {
      game = new Game({
        counterEl,
        onGameOver:    handleGameOver,
        onScoreChange: () => {},
      });
    } else {
      game.reset();
    }
  } catch (err) {
    console.error("[CrossyRoad] Game init error:", err);
    menuEl.style.display    = "flex";
    counterEl.style.display = "none";
    appState = "menu";
  }
}

playBtn.addEventListener("click", () => void startGame());

// ─── Game Over ────────────────────────────────────────────────────────────────

async function handleGameOver(score: number): Promise<void> {
  appState = "gameover";
  currentScore = score;
  SoundManager.playGameOver();

  const prevBest   = RecordsService.getBest();
  const isRecord   = RecordsService.saveBest(score);
  RecordsService.addEntry("---", score);
  const suraPoints = calcSuraPoints(score, prevBest);

  await sura.completeGameSession({
    score,
    isNewRecord:         isRecord,
    estimatedSuraPoints: suraPoints,
    rewardScoreUnit:     LOCAL_SURA_REWARD_CONFIG.scoreUnit,
    rewardPointsPerUnit: LOCAL_SURA_REWARD_CONFIG.pointsPerUnit,
    durationMs:          playStartedAt ? Date.now() - playStartedAt : undefined,
  });

  // REINTENTAR skips the menu (the only other place that asks for a new
  // session), so without this the host is never told we want another round
  // — state stays "completed" forever and tapping REINTENTAR silently does
  // nothing. Ask now, while the player is still reading the score, so the
  // fresh session has time to arrive before they tap it.
  sura.requestFreshSession();

  goTitle.textContent   = t("gameover_title");
  goScore.textContent   = t("gameover_score",  { score });
  goRecord.textContent  = t("gameover_record", { record: RecordsService.getBest() });
  goNewRecord.style.display = isRecord ? "block" : "none";
  if (isRecord) goNewRecord.textContent = t("gameover_new_record");

  retryBtn.textContent = t("gameover_retry");
  menuBtn.textContent  = t("gameover_menu");

  counterEl.style.display    = "none";
  pauseBtn.style.display     = "none";
  pauseOverlay.style.display = "none";
  gameoverEl.style.display   = "flex";

  if (LOCAL_SURA_REWARD_CONFIG.popupEnabled) {
    setTimeout(() => showPopup(score, prevBest, suraPoints), 600);
  }
}

// ─── Popup ────────────────────────────────────────────────────────────────────

function showPopup(score: number, prevBest: number, suraPoints: number): void {
  if (suraPoints <= 0) return;
  const { scoreUnit, pointsPerUnit } = LOCAL_SURA_REWARD_CONFIG;
  popupTitle.textContent    = t("popup_win_title");
  popupPoints.textContent   = t("popup_win_points", { points: suraPoints });
  popupPoints.style.display = "block";
  popupHint.textContent     = "";
  popupHint.style.display   = "none";
  popupBtn.textContent      = t("popup_continue");
  popupEl.style.display     = "flex";
}

popupBtn.addEventListener("click", () => { popupEl.style.display = "none"; });

// ─── Gameover buttons ─────────────────────────────────────────────────────────

retryBtn.addEventListener("click", () => {
  gameoverEl.style.display = "none";
  popupEl.style.display    = "none";
  void startGame();
});

menuBtn.addEventListener("click", () => {
  popupEl.style.display = "none";
  showMenu();
});


// ─── Pause ────────────────────────────────────────────────────────────────────

function pauseGame(): void {
  if (appState !== "playing") return;
  appState = "paused";
  game?.pause();
  pauseOverlay.style.display = "flex";
  pauseBtn.style.display     = "none";
}

function resumeGame(): void {
  if (appState !== "paused") return;
  appState = "playing";
  game?.resume();
  pauseOverlay.style.display = "none";
  pauseBtn.style.display     = "flex";
}

pauseBtn.addEventListener("click", pauseGame);
resumeBtn.addEventListener("click", resumeGame);
pauseMenuBtn.addEventListener("click", () => {
  game?.pause();
  showMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (appState === "playing") pauseGame();
    else if (appState === "paused") resumeGame();
  }
});

// ─── Music ────────────────────────────────────────────────────────────────────

const MUSIC_MUTE_KEY = "safari-crossing-music-muted";

function updateMuteBtn(): void {
  muteBtn.textContent = MusicManager.isMuted() ? "🔇" : "🔊";
}

MusicManager.setMuted(localStorage.getItem(MUSIC_MUTE_KEY) === "1");
updateMuteBtn();

muteBtn.addEventListener("click", () => {
  MusicManager.setMuted(!MusicManager.isMuted());
  localStorage.setItem(MUSIC_MUTE_KEY, MusicManager.isMuted() ? "1" : "0");
  updateMuteBtn();
});

// Browsers require a user gesture before audio can start — kick the music
// off on the first interaction and keep it looping through menu and game.
function beginMusicOnFirstInteraction(): void {
  MusicManager.start();
  document.removeEventListener("pointerdown", beginMusicOnFirstInteraction);
  document.removeEventListener("keydown", beginMusicOnFirstInteraction);
}
document.addEventListener("pointerdown", beginMusicOnFirstInteraction);
document.addEventListener("keydown", beginMusicOnFirstInteraction);

// ─── Rotate-device overlay ─────────────────────────────────────────────────────
//
// Only real touch/mobile devices can be rotated — a desktop window (or the
// SURA host embedding the game in a narrow, portrait-shaped iframe/panel on
// PC) can be just as narrow-and-tall as a phone in portrait, but there's no
// device to turn. Gate on the actual input/device type, not just the
// viewport's aspect ratio, so desktop never gets stuck behind this overlay.

function isMobileDevice(): boolean {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
  return coarsePointer || mobileUA;
}

function updateRotateOverlay(): void {
  const isPortrait = window.innerWidth < window.innerHeight;
  rotateMsg.style.display = isMobileDevice() && isPortrait ? "flex" : "none";
}

window.addEventListener("resize", updateRotateOverlay);
window.matchMedia("(orientation: portrait)").addEventListener("change", updateRotateOverlay);
updateRotateOverlay();

// ─── Init ─────────────────────────────────────────────────────────────────────

applyLang();
refreshSuraStatus(sura.getState());
showMenu();
