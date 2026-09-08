import { Game } from "./game/Game";
import { SoundManager } from "./game/SoundManager";
import { MusicManager } from "./game/MusicManager";
import { RecordsService } from "./services/RecordsService";
import { initSuraService } from "./integration/sura/SuraIntegrationService";
import { SURA_CONFIG } from "./integration/sura/SuraRuntimeConfig";
import { calcSuraPoints, LOCAL_SURA_REWARD_CONFIG } from "./config/suraRewardConfig";
import { t, setLang, getLang, type LangCode } from "./i18n";
import type { SuraIntegrationState } from "./integration/sura/SuraTypes";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const menuEl         = document.getElementById("menu")!;
const gameoverEl     = document.getElementById("end")!;
const counterEl      = document.getElementById("counter")!;
const pauseBtn       = document.getElementById("pause-btn") as HTMLButtonElement;
const pauseOverlay   = document.getElementById("pause-overlay")!;
const resumeBtn      = document.getElementById("resume-btn")!;
const pauseMenuBtn   = document.getElementById("pause-menu-btn")!;
const muteBtn        = document.getElementById("mute-btn") as HTMLButtonElement;

// menu
const menuRecordVal    = document.getElementById("menu-record-val");
const playBtn          = document.getElementById("play-btn") as HTMLButtonElement;
const suraStatus       = document.getElementById("sura-status")!;
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
const goSuraMsg    = document.getElementById("go-sura-msg")!;

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
    if (event.state === "completed") {
      goSuraMsg.textContent = t("gameover_sura_sent");
      goSuraMsg.className = "go-sura-msg go-sura-msg--ok";
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

  refreshTop3();
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

function refreshTop3(): void {
  const entries = RecordsService.getLeaderboard().slice(0, 3);
  menuTop3List.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "top3-empty";
    empty.textContent = t("menu_no_records");
    menuTop3List.appendChild(empty);
    return;
  }

  entries.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = "top3-item";
    li.innerHTML = `
      <span class="top3-medal">${MEDALS[i] ?? ""}</span>
      <span class="top3-name">${escapeHtml(entry.name)}</span>
      <span class="top3-score">${entry.score}</span>
    `;
    menuTop3List.appendChild(li);
  });
}

function renderLeaderboard(): void {
  const entries = RecordsService.getLeaderboard();
  lbList.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "top3-empty";
    empty.textContent = t("menu_no_records");
    lbList.appendChild(empty);
    return;
  }

  entries.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = "lb-item";
    li.innerHTML = `
      <span class="lb-medal">${MEDALS[i] ?? ""}</span>
      <span class="lb-pos">${i < 3 ? "" : `#${i + 1}`}</span>
      <span class="lb-name">${escapeHtml(entry.name)}</span>
      <span class="lb-score">${entry.score}</span>
    `;
    lbList.appendChild(li);
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

function refreshSuraStatus(state: SuraIntegrationState): void {
  if (SURA_CONFIG.mode === "standalone") {
    suraStatus.style.display = "none";
    playBtn.disabled = false;
    return;
  }

  suraStatus.style.display = "block";
  suraStatus.className = "sura-status";

  switch (state) {
    case "waiting-context":
      suraStatus.textContent = t("sura_waiting");
      suraStatus.classList.add("sura-status--waiting");
      playBtn.disabled = true;
      break;
    case "ready":
      suraStatus.textContent = t("sura_ready");
      suraStatus.classList.add("sura-status--ready");
      playBtn.disabled = false;
      break;
    case "playing":
      suraStatus.textContent = t("sura_playing");
      suraStatus.classList.add("sura-status--playing");
      break;
    case "completed":
      suraStatus.textContent = t("sura_completed");
      suraStatus.classList.add("sura-status--done");
      playBtn.disabled = true;
      break;
    case "error":
      suraStatus.textContent = t("sura_error");
      suraStatus.classList.add("sura-status--error");
      playBtn.disabled = true;
      break;
    case "unauthorized":
      suraStatus.textContent = t("sura_unauthorized");
      suraStatus.classList.add("sura-status--error");
      playBtn.disabled = true;
      break;
    default:
      suraStatus.textContent = "";
  }
}

// ─── Leaderboard overlay ──────────────────────────────────────────────────────

btnRanking.addEventListener("click", () => {
  renderLeaderboard();
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

async function startGame(): Promise<void> {
  if (playBtn.disabled) return;

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

  goTitle.textContent   = t("gameover_title");
  goScore.textContent   = t("gameover_score",  { score });
  goRecord.textContent  = t("gameover_record", { record: RecordsService.getBest() });
  goNewRecord.style.display = isRecord ? "block" : "none";
  if (isRecord) goNewRecord.textContent = t("gameover_new_record");

  retryBtn.textContent = t("gameover_retry");
  menuBtn.textContent  = t("gameover_menu");

  goSuraMsg.style.display = SURA_CONFIG.mode !== "standalone" ? "block" : "none";

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

// ─── Init ─────────────────────────────────────────────────────────────────────

applyLang();
refreshSuraStatus(sura.getState());
showMenu();
