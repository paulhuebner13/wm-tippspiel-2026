const FIFA_RANKING = [
  ['Argentinien', 1877.27],
  ['Spanien', 1874.71],
  ['Frankreich', 1870.7],
  ['England', 1828.02],
  ['Portugal', 1767.85],
  ['Brasilien', 1765.34],
  ['Marokko', 1755.62],
  ['Niederlande', 1753.57],
  ['Deutschland', 1743.54],
  ['Belgien', 1742.24],
  ['Kroatien', 1714.87],
  ['Mexiko', 1700.98],
  ['Kolumbien', 1698.35],
  ['USA', 1688.53],
  ['Senegal', 1684.07],
  ['Uruguay', 1673.07],
  ['Japan', 1661.58],
  ['Schweiz', 1640.92],
  ['IR Iran', 1619.58],
  ['Republik Korea', 1612.55],
  ['Australien', 1605.61],
  ['Ecuador', 1598.52],
  ['Österreich', 1597.4],
  ['Türkei', 1579.47],
  ['Algerien', 1571.03],
  ['Ägypten', 1562.37],
  ['Norwegen', 1557.44],
  ['Kanada', 1551.5],
  ['Elfenbeinküste', 1540.87],
  ['Panama', 1539.16],
  ['Schottland', 1518.77],
  ['Schweden', 1509.79],
  ['Paraguay', 1488.05],
  ['Tschechien', 1484.82],
  ['Tunesien', 1476.41],
  ['DR Kongo', 1474.43],
  ['Katar', 1459.45],
  ['Usbekistan', 1458.73],
  ['Irak', 1446.28],
  ['Saudi-Arabien', 1423.88],
  ['Südafrika', 1414.88],
  ['Bosnien und Herzegowina', 1395.19],
  ['Jordanien', 1387.74],
  ['Kap Verde', 1371.11],
  ['Ghana', 1346.88],
  ['Curaçao', 1287],
  ['Haiti', 1277.67],
  ['Neuseeland', 1275.58],
] as const;

const rankingByTeam = new Map<string, { rank: number; points: number }>();

FIFA_RANKING.forEach(([name, points], index) => {
  rankingByTeam.set(name, { rank: index + 1, points });
});

export function getFifaRanking(teamName: string | undefined) {
  return teamName ? rankingByTeam.get(teamName) ?? null : null;
}
