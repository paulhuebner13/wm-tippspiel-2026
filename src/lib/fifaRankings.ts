import type { Team } from '@/lib/types';

export type FifaRanking = {
  rank: number;
  points: number;
};

const FIFA_RANKINGS_BY_SHORT_NAME: Record<string, FifaRanking> = {
  ARG: { rank: 1, points: 1877.27 },
  ESP: { rank: 2, points: 1874.71 },
  FRA: { rank: 3, points: 1870.70 },
  ENG: { rank: 4, points: 1828.02 },
  POR: { rank: 5, points: 1767.85 },
  BRA: { rank: 6, points: 1765.34 },
  MAR: { rank: 7, points: 1755.62 },
  NED: { rank: 8, points: 1753.57 },
  GER: { rank: 9, points: 1743.54 },
  BEL: { rank: 10, points: 1742.24 },
  CRO: { rank: 11, points: 1714.87 },
  MEX: { rank: 13, points: 1700.98 },
  COL: { rank: 14, points: 1698.35 },
  USA: { rank: 15, points: 1688.53 },
  SEN: { rank: 16, points: 1684.07 },
  URU: { rank: 17, points: 1673.07 },
  JPN: { rank: 18, points: 1661.58 },
  SUI: { rank: 19, points: 1640.92 },
  IRN: { rank: 20, points: 1619.58 },
  KOR: { rank: 22, points: 1612.55 },
  AUS: { rank: 23, points: 1605.61 },
  ECU: { rank: 24, points: 1598.52 },
  AUT: { rank: 25, points: 1597.40 },
  TUR: { rank: 27, points: 1579.47 },
  ALG: { rank: 28, points: 1571.03 },
  EGY: { rank: 29, points: 1562.37 },
  NOR: { rank: 30, points: 1557.44 },
  CAN: { rank: 31, points: 1551.50 },
  CIV: { rank: 33, points: 1540.87 },
  PAN: { rank: 34, points: 1539.16 },
  SCO: { rank: 37, points: 1518.77 },
  SWE: { rank: 39, points: 1509.79 },
  PAR: { rank: 42, points: 1488.05 },
  CZE: { rank: 43, points: 1484.82 },
  TUN: { rank: 45, points: 1476.41 },
  COD: { rank: 46, points: 1474.43 },
  QAT: { rank: 50, points: 1459.45 },
  UZB: { rank: 51, points: 1458.73 },
  IRQ: { rank: 57, points: 1446.28 },
  KSA: { rank: 60, points: 1423.88 },
  RSA: { rank: 61, points: 1414.88 },
  BIH: { rank: 63, points: 1395.19 },
  JOR: { rank: 64, points: 1387.74 },
  CPV: { rank: 67, points: 1371.11 },
  GHA: { rank: 73, points: 1346.88 },
  CUW: { rank: 82, points: 1287.00 },
  HAI: { rank: 84, points: 1277.67 },
  NZL: { rank: 85, points: 1275.58 },
};

export function getFifaRanking(team: Team | null | undefined): FifaRanking | null {
  if (!team?.short_name) return null;
  return FIFA_RANKINGS_BY_SHORT_NAME[team.short_name] ?? null;
}
