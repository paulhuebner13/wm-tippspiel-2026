import { loginAction } from '@/app/actions';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/matches');

  const params = await searchParams;
  const error = params.error;

  return (
    <main className="loginPage">
      <section className="loginCard">
        <h1>WM Tippspiel 2026</h1>
        <p>Melde dich mit deinem Namen und Passwort an.</p>
        {error && <p className="errorText">Login fehlgeschlagen. Prüfe Name und Passwort.</p>}
        <form action={loginAction} className="loginForm">
          <label>
            Name
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Passwort
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Einloggen</button>
        </form>
      </section>
    </main>
  );
}
