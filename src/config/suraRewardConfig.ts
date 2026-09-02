export const LOCAL_SURA_REWARD_CONFIG = {
  scoreUnit:     100,
  pointsPerUnit: 50,
  currencyLabel: "SURA Points",
  popupEnabled:  true,
} as const;

// Total points for a session: every 100 meters earns 50 pts, regardless of previous best.
export function calcSuraPoints(sessionScore: number, _prevBestScore: number): number {
  const { scoreUnit, pointsPerUnit } = LOCAL_SURA_REWARD_CONFIG;
  return Math.floor(sessionScore / scoreUnit) * pointsPerUnit;
}
