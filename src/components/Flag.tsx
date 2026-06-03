import type { Team } from '@/lib/types';

export function Flag({ team }: { team: Team | null | undefined }) {
  if (!team) {
    return <span className="flagPlaceholder" aria-hidden="true" />;
  }

  return (
    <span className="flagFrame" title={team.name}>
      <img src={team.flag_path} alt={`${team.name} Flagge`} className="flagImage" loading="lazy" />
    </span>
  );
}
