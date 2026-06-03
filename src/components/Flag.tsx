import Image from 'next/image';
import type { Team } from '@/lib/types';

export function Flag({ team }: { team: Team | null | undefined }) {
  if (!team) {
    return <span className="flagPlaceholder" aria-hidden="true" />;
  }

  return (
    <span className="flagFrame" title={team.name}>
      <Image src={team.flag_path} alt={`${team.name} Flagge`} width={48} height={32} className="flagImage" />
    </span>
  );
}
