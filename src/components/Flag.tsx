import type { Team } from '@/lib/types';

const flagPathByTeamName: Record<string, string> = {
  'Mexiko': '/flags/mexico.svg',
  'Südafrika': '/flags/south-africa.svg',
  'Republik Korea': '/flags/south-korea.svg',
  'Südkorea': '/flags/south-korea.svg',
  'Tschechien': '/flags/czechia.svg',
  'Kanada': '/flags/canada.svg',
  'Bosnien und Herzegowina': '/flags/bosnia-and-herzegovina.svg',
  'Katar': '/flags/qatar.svg',
  'Schweiz': '/flags/switzerland.svg',
  'Brasilien': '/flags/brazil.svg',
  'Marokko': '/flags/morocco.svg',
  'Haiti': '/flags/haiti.svg',
  'Schottland': '/flags/scotland.svg',
  'USA': '/flags/united-states.svg',
  'Paraguay': '/flags/paraguay.svg',
  'Australien': '/flags/australia.svg',
  'Türkei': '/flags/turkey.svg',
  'Deutschland': '/flags/germany.svg',
  'Curaçao': '/flags/curacao.svg',
  'Elfenbeinküste': '/flags/ivory-coast.svg',
  "Côte d'Ivoire": '/flags/ivory-coast.svg',
  'Ecuador': '/flags/ecuador.svg',
  'Niederlande': '/flags/netherlands.svg',
  'Japan': '/flags/japan.svg',
  'Schweden': '/flags/sweden.svg',
  'Tunesien': '/flags/tunisia.svg',
  'Belgien': '/flags/belgium.svg',
  'Ägypten': '/flags/egypt.svg',
  'IR Iran': '/flags/iran.svg',
  'Iran': '/flags/iran.svg',
  'Neuseeland': '/flags/new-zealand.svg',
  'Spanien': '/flags/spain.svg',
  'Kap Verde': '/flags/cape-verde.svg',
  'Saudi-Arabien': '/flags/saudi-arabia.svg',
  'Uruguay': '/flags/uruguay.svg',
  'Frankreich': '/flags/france.svg',
  'Senegal': '/flags/senegal.svg',
  'Irak': '/flags/iraq.svg',
  'Norwegen': '/flags/norway.svg',
  'Argentinien': '/flags/argentina.svg',
  'Algerien': '/flags/algeria.svg',
  'Österreich': '/flags/austria.svg',
  'Jordanien': '/flags/jordan.svg',
  'Portugal': '/flags/portugal.svg',
  'DR Kongo': '/flags/dr-congo.svg',
  'Usbekistan': '/flags/uzbekistan.svg',
  'Kolumbien': '/flags/colombia.svg',
  'England': '/flags/england.svg',
  'Kroatien': '/flags/croatia.svg',
  'Ghana': '/flags/ghana.svg',
  'Panama': '/flags/panama.svg',
};

function getFlagPath(team: Team) {
  const savedPath = team.flag_path?.trim();
  if (savedPath && !savedPath.toLowerCase().includes('generic')) {
    return savedPath;
  }

  return flagPathByTeamName[team.name] ?? savedPath ?? '';
}

export function Flag({ team }: { team: Team | null | undefined }) {
  if (!team) {
    return <span className="flagPlaceholder" aria-hidden="true" />;
  }

  const flagPath = getFlagPath(team);

  if (!flagPath) {
    return <span className="flagPlaceholder" title={team.name} aria-hidden="true" />;
  }

  return (
    <span className="flagFrame" title={team.name}>
      <img src={flagPath} alt={`${team.name} Flagge`} className="flagImage" loading="lazy" />
    </span>
  );
}
