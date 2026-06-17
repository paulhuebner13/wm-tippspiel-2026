const FIFA_RANKING = [
  ['Argentinien', 1, 1889.06],
  ['Frankreich', 2, 1887.11],
  ['Spanien', 3, 1856.03],
  ['England', 4, 1847.68],
  ['Brasilien', 5, 1765.34],
  ['Marokko', 6, 1755.62],
  ['Portugal', 7, 1755.09],
  ['Niederlande', 8, 1749.2],
  ['Deutschland', 9, 1743.54],
  ['Belgien', 10, 1733.93],
  ['Mexiko', 12, 1700.98],
  ['Kolumbien', 13, 1698.35],
  ['Kroatien', 14, 1695.21],
  ['USA', 15, 1688.53],
  ['Senegal', 16, 1667.66],
  ['Japan', 17, 1665.94],
  ['Uruguay', 18, 1661.95],
  ['Schweiz', 19, 1640.92],
  ['Österreich', 21, 1612.86],
  ['Republik Korea', 22, 1612.55],
  ['Australien', 23, 1605.61],
  ['IR Iran', 24, 1605.12],
  ['Türkei', 26, 1579.47],
  ['Norwegen', 27, 1577.18],
  ['Ecuador', 28, 1570.76],
  ['Ägypten', 29, 1570.67],
  ['Elfenbeinküste', 30, 1568.62],
  ['Algerien', 31, 1559.24],
  ['Kanada', 32, 1551.5],
  ['Panama', 34, 1539.16],
  ['Schweden', 35, 1533.19],
  ['Schottland', 38, 1518.77],
  ['Paraguay', 42, 1488.05],
  ['DR Kongo', 43, 1487.18],
  ['Tschechien', 44, 1484.82],
  ['Katar', 49, 1459.45],
  ['Usbekistan', 50, 1458.73],
  ['Tunesien', 56, 1453],
  ['Saudi-Arabien', 59, 1435],
  ['Irak', 60, 1426.53],
  ['Südafrika', 61, 1414.88],
  ['Bosnien und Herzegowina', 63, 1395.19],
  ['Kap Verde', 64, 1389.79],
  ['Jordanien', 67, 1372.29],
  ['Ghana', 73, 1346.88],
  ['Neuseeland', 82, 1290.04],
  ['Curaçao', 83, 1287],
  ['Haiti', 85, 1277.67],
] as const;

const rankingByTeam = new Map<string, { rank: number; points: number }>();

FIFA_RANKING.forEach(([name, rank, points]) => {
  rankingByTeam.set(name, { rank, points });
});

export function getFifaRanking(teamName: string | undefined) {
  return teamName ? rankingByTeam.get(teamName) ?? null : null;
}
