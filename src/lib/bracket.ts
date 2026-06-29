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


export const OFFICIAL_MATCH_NUMBERS_BY_STAGE: Record<string, number[]> = {
  round_of_32: [73, 75, 74, 77, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  round_of_16: [89, 90, 91, 92, 93, 94, 95, 96],
  quarter_final: [97, 98, 99, 100],
  semi_final: [101, 102],
  third_place: [103],
  final: [104],
};

type MatchNumberInput = {
  id: string;
  stage: string;
  kickoff_time: string;
  match_number: number;
};

function compareByKickoffThenStoredNumber(a: MatchNumberInput, b: MatchNumberInput) {
  const timeDiff =
    new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
  if (timeDiff !== 0) return timeDiff;
  return a.match_number - b.match_number;
}

export function getOfficialMatchNumberForMatch(
  match: MatchNumberInput,
  allMatches: MatchNumberInput[],
) {
  const officialNumbers = OFFICIAL_MATCH_NUMBERS_BY_STAGE[match.stage];
  if (!officialNumbers) return match.match_number;

  const stageMatches = allMatches
    .filter((candidate) => candidate.stage === match.stage)
    .sort(compareByKickoffThenStoredNumber);
  const index = stageMatches.findIndex((candidate) => candidate.id === match.id);

  return index >= 0 ? officialNumbers[index] ?? match.match_number : match.match_number;
}

export function applyOfficialBracketMatchNumbers<T extends MatchNumberInput>(
  matches: T[],
): T[] {
  if (matches.length === 0) return matches;

  const officialNumberById = new Map<string, number>();

  for (const [stage, officialNumbers] of Object.entries(
    OFFICIAL_MATCH_NUMBERS_BY_STAGE,
  )) {
    const stageMatches = matches
      .filter((match) => match.stage === stage)
      .sort(compareByKickoffThenStoredNumber);

    stageMatches.forEach((match, index) => {
      officialNumberById.set(
        match.id,
        officialNumbers[index] ?? match.match_number,
      );
    });
  }

  return matches.map((match) => {
    const officialMatchNumber = officialNumberById.get(match.id);
    if (!officialMatchNumber || officialMatchNumber === match.match_number) {
      return match;
    }

    return {
      ...match,
      match_number: officialMatchNumber,
    };
  });
}


export const ROUND_OF_32_PLACEHOLDERS: Record<number, { home: string; away: string }> = {
  73: { home: "Zweiter Gruppe A", away: "Zweiter Gruppe B" },
  74: { home: "Erster Gruppe E", away: "Dritter Gruppe A/B/C/D/F" },
  75: { home: "Erster Gruppe F", away: "Zweiter Gruppe C" },
  76: { home: "Erster Gruppe C", away: "Zweiter Gruppe F" },
  77: { home: "Erster Gruppe I", away: "Dritter Gruppe C/D/F/G/H" },
  78: { home: "Zweiter Gruppe E", away: "Zweiter Gruppe I" },
  79: { home: "Erster Gruppe A", away: "Dritter Gruppe C/E/F/H/I" },
  80: { home: "Erster Gruppe L", away: "Dritter Gruppe E/H/I/J/K" },
  81: { home: "Erster Gruppe D", away: "Dritter Gruppe B/E/F/I/J" },
  82: { home: "Erster Gruppe G", away: "Dritter Gruppe A/E/H/I/J" },
  83: { home: "Zweiter Gruppe K", away: "Zweiter Gruppe L" },
  84: { home: "Erster Gruppe H", away: "Zweiter Gruppe J" },
  85: { home: "Erster Gruppe B", away: "Dritter Gruppe E/F/G/I/J" },
  86: { home: "Erster Gruppe J", away: "Zweiter Gruppe H" },
  87: { home: "Erster Gruppe K", away: "Dritter Gruppe D/E/I/J/L" },
  88: { home: "Zweiter Gruppe D", away: "Zweiter Gruppe G" },
};

export function getRoundOf32Placeholder(
  matchNumber: number,
  side: BracketSide,
) {
  return ROUND_OF_32_PLACEHOLDERS[matchNumber]?.[side] ?? null;
}

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
  return `${source.result === "winner" ? "Sieger" : "Verlierer"} Spiel ${source.matchNumber}`;
}

export function getBracketSourceShortLabel(source: BracketSource | undefined) {
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
