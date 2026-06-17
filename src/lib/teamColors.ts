import type { Team } from './types';

const TEAM_COLORS: Record<string, string> = {
  algeria: '#006233',
  argentina: '#6cace4',
  australia: '#00843d',
  austria: '#ed2939',
  belgium: '#ef3340',
  'bosnia-and-herzegovina': '#002f6c',
  brazil: '#009739',
  canada: '#ff0000',
  'cape-verde': '#003893',
  colombia: '#fcd116',
  croatia: '#f00000',
  curacao: '#002b7f',
  czechia: '#d7141a',
  'dr-congo': '#007fff',
  ecuador: '#ffdd00',
  egypt: '#ce1126',
  england: '#cf142b',
  france: '#0055a4',
  germany: '#dd0000',
  ghana: '#fcd116',
  haiti: '#00209f',
  iran: '#239f40',
  iraq: '#ce1126',
  'ivory-coast': '#f77f00',
  japan: '#bc002d',
  jordan: '#007a3d',
  mexico: '#006847',
  morocco: '#c1272d',
  netherlands: '#ff4f00',
  'new-zealand': '#00247d',
  norway: '#ba0c2f',
  panama: '#005293',
  paraguay: '#d52b1e',
  portugal: '#006600',
  qatar: '#8a1538',
  'saudi-arabia': '#006c35',
  scotland: '#005eb8',
  senegal: '#00853f',
  'south-africa': '#007a4d',
  'south-korea': '#c60c30',
  spain: '#c60b1e',
  sweden: '#006aa7',
  switzerland: '#ff0000',
  tunisia: '#e70013',
  turkey: '#e30a17',
  'united-states': '#3c3b6e',
  uruguay: '#0038a8',
  uzbekistan: '#1eb6e7',
};

function slugFromTeam(team?: Pick<Team, 'name' | 'flag_path'> | null) {
  const flagSlug = team?.flag_path?.split('/').pop()?.replace(/\.svg$/i, '');
  if (flagSlug) return flagSlug;

  return (team?.name ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getTeamColor(team?: Pick<Team, 'name' | 'flag_path'> | null) {
  return TEAM_COLORS[slugFromTeam(team)] ?? '#2563eb';
}
