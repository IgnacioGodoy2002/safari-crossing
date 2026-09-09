export type Locale = {
  menu_title_1:        string;
  menu_title_2:        string;
  menu_subtitle:       string;
  menu_record:         string;
  menu_play:           string;
  menu_ranking:        string;
  menu_btn_ranking:    string;
  menu_btn_howto:      string;
  menu_no_records:     string;
  leaderboard_title:   string;
  leaderboard_close:   string;
  leaderboard_pos:     string;
  leaderboard_loading: string;
  howto_title:         string;
  howto_close:         string;
  sura_waiting:        string;
  sura_ready:          string;
  sura_playing:        string;
  sura_completed:      string;
  sura_error:          string;
  sura_unauthorized:   string;
  gameover_title:      string;
  gameover_score:      string;
  gameover_record:     string;
  gameover_new_record: string;
  gameover_retry:      string;
  gameover_menu:       string;
  gameover_back_sura:  string;
  gameover_sura_sent:  string;
  gameover_sura_err:   string;
  gameover_save_label: string;
  gameover_save_btn:   string;
  gameover_saved_ok:   string;
  popup_win_title:     string;
  popup_win_points:    string;
  popup_win_hint:      string;
  popup_try_title:     string;
  popup_try_hint:      string;
  popup_continue:      string;
};

export const es: Locale = {
  menu_title_1:        "SAFARI",
  menu_title_2:        "CROSSING",
  menu_subtitle:       "¡Cruzá la sabana!",
  menu_record:         "MEJOR",
  menu_play:           "JUGAR",
  menu_ranking:        "TOP 3",
  menu_btn_ranking:    "VER RANKING",
  menu_btn_howto:      "CÓMO JUGAR",
  menu_no_records:     "Aún no hay récords",
  leaderboard_title:   "TABLA DE RÉCORDS",
  leaderboard_close:   "CERRAR",
  leaderboard_loading: "Cargando...",
  leaderboard_pos:     "#",
  howto_title:         "CÓMO JUGAR",
  howto_close:         "¡ENTENDIDO!",
  sura_waiting:        "Esperando sesión SURA...",
  sura_ready:          "¡Listo para jugar!",
  sura_playing:        "En juego",
  sura_completed:      "Resultado enviado ✓",
  sura_error:          "Sesión no disponible.",
  sura_unauthorized:   "Sesión inválida.",
  gameover_title:      "GAME OVER",
  gameover_score:      "CALLES: {score}",
  gameover_record:     "RÉCORD: {record}",
  gameover_new_record: "¡NUEVO RÉCORD!",
  gameover_retry:      "REINTENTAR",
  gameover_menu:       "MENÚ",
  gameover_back_sura:  "VOLVER A SURA",
  gameover_sura_sent:  "Resultado enviado ✓",
  gameover_sura_err:   "Error al enviar resultado.",
  gameover_save_label: "GUARDAR EN RANKING",
  gameover_save_btn:   "GUARDAR",
  gameover_saved_ok:   "¡Guardado! ✓",
  popup_win_title:     "¡GANASTE!",
  popup_win_points:    "+{points} SURA Points",
  popup_win_hint:      "Cada {scoreUnit} puntos conseguirás {points} SURA Points",
  popup_try_title:     "¡SEGUÍ INTENTANDO!",
  popup_try_hint:      "Cada {scoreUnit} metros ganarás puntos",
  popup_continue:      "CONTINUAR",
};
