import Link from 'next/link';
import { logoutAction } from '@/app/actions';
import type { Profile } from '@/lib/types';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Nav({ user }: { user: Profile }) {
  return (
    <header className="topbar">
      <div>
        <strong>WM Tippspiel 2026</strong>
        <span className="userName">{user.username}</span>
        <ThemeToggle />
      </div>
      <nav>
        <Link href="/matches">Tipps</Link>
        <Link href="/results">Ergebnisse</Link>
        <Link href="/ranking">Ranking</Link>
        <Link href="/rules">Regeln</Link>
        {user.is_admin && <Link href="/admin">Admin</Link>}
        <form action={logoutAction}>
          <button className="linkButton">Logout</button>
        </form>
      </nav>
    </header>
  );
}
