export type BracketSide = "home" | "away";

export type BracketSourceResult = "winner" | "loser";

export type BracketTarget = {
  sourceMatchNumber: number;
  targetMatchNumber: number;
  side: BracketSide;
  sourceResult: BracketSourceResult;
};

export type BracketSource = {
  matchNumber: number;
  result: BracketSourceResult;
};

export type BracketTargetSources = Partial<Record<BracketSide, BracketSource>>;

// Official bracket paths. This is not a database correction: it is the tournament
// rule that defines where the winner/runner-up of a match goes next.
export const BRACKET_TARGETS: BracketTarget[] = [
  {
    sourceMatchNumber: 73,
    targetMatchNumber: 89,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 75,
    targetMatchNumber: 89,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 74,
    targetMatchNumber: 90,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 77,
    targetMatchNumber: 90,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 76,
    targetMatchNumber: 91,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 78,
    targetMatchNumber: 91,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 79,
    targetMatchNumber: 92,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 80,
    targetMatchNumber: 92,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 83,
    targetMatchNumber: 93,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 84,
    targetMatchNumber: 93,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 81,
    targetMatchNumber: 94,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 82,
    targetMatchNumber: 94,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 86,
    targetMatchNumber: 95,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 88,
    targetMatchNumber: 95,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 85,
    targetMatchNumber: 96,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 87,
    targetMatchNumber: 96,
    side: "away",
    sourceResult: "winner",
  },

  {
    sourceMatchNumber: 89,
    targetMatchNumber: 97,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 90,
    targetMatchNumber: 97,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 93,
    targetMatchNumber: 98,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 94,
    targetMatchNumber: 98,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 91,
    targetMatchNumber: 99,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 92,
    targetMatchNumber: 99,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 95,
    targetMatchNumber: 100,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 96,
    targetMatchNumber: 100,
    side: "away",
    sourceResult: "winner",
  },

  {
    sourceMatchNumber: 97,
    targetMatchNumber: 101,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 98,
    targetMatchNumber: 101,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 99,
    targetMatchNumber: 102,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 100,
    targetMatchNumber: 102,
    side: "away",
    sourceResult: "winner",
  },

  {
    sourceMatchNumber: 101,
    targetMatchNumber: 104,
    side: "home",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 102,
    targetMatchNumber: 104,
    side: "away",
    sourceResult: "winner",
  },
  {
    sourceMatchNumber: 101,
    targetMatchNumber: 103,
    side: "home",
    sourceResult: "loser",
  },
  {
    sourceMatchNumber: 102,
    targetMatchNumber: 103,
    side: "away",
    sourceResult: "loser",
  },
];

export function getBracketTargetsForSource(matchNumber: number) {
  return BRACKET_TARGETS.filter(
    (target) => target.sourceMatchNumber === matchNumber,
  );
}

export function getBracketSourcesForTarget(
  matchNumber: number,
): BracketTargetSources {
  return BRACKET_TARGETS.filter(
    (target) => target.targetMatchNumber === matchNumber,
  ).reduce<BracketTargetSources>((sources, target) => {
    sources[target.side] = {
      matchNumber: target.sourceMatchNumber,
      result: target.sourceResult,
    };
    return sources;
  }, {});
}

export function getBracketSourcePlaceholder(source: BracketSource | undefined) {
  if (!source) return "Offen";
  return `${source.result === "winner" ? "W" : "RU"}${source.matchNumber}`;
}

export function getLoserTeamId(input: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
}) {
  if (!input.winnerTeamId) return null;
  if (input.winnerTeamId === input.homeTeamId) return input.awayTeamId ?? null;
  if (input.winnerTeamId === input.awayTeamId) return input.homeTeamId ?? null;
  return null;
}
