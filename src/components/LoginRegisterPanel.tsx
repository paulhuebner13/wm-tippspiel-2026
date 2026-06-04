'use client';

import { useState } from 'react';
import { loginAction, registerAction } from '@/app/actions';

type Props = {
  initialMode?: 'login' | 'register';
  error?: string;
  created?: string;
};

function getErrorMessage(error?: string) {
  if (!error) return null;

  switch (error) {
    case 'invalid':
      return 'Login fehlgeschlagen. Prüfe Name und Passwort.';
    case 'missing':
      return 'Bitte Name und Passwort eingeben.';
    case 'user_exists':
      return 'Dieser Name ist bereits vergeben.';
    case 'register_failed':
      return 'Konto konnte nicht erstellt werden. Bitte versuche es erneut.';
    case 'user_data_too_short':
      return 'Name und Passwort müssen mindestens 2 Zeichen lang sein.';
    default:
      return 'Etwas hat nicht funktioniert. Bitte versuche es erneut.';
  }
}

export default function LoginRegisterPanel({ initialMode = 'login', error, created }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const errorMessage = getErrorMessage(error);

  return (
    <section className="loginCard">
      <h1>WM Tippspiel 2026</h1>

      <div className="authSwitch" aria-label="Login oder Konto erstellen">
        <span className={`authSwitchMarker ${mode === 'register' ? 'register' : ''}`} />
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          Einloggen
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
        >
          Konto erstellen
        </button>
      </div>

      {created && <p className="successText">Konto erstellt. Du bist jetzt eingeloggt.</p>}
      {errorMessage && <p className="errorText">{errorMessage}</p>}

      {mode === 'login' ? (
        <form action={loginAction} className="loginForm authFormBlock">
          <p className="authHint">Melde dich mit deinem Namen und Passwort an.</p>
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
      ) : (
        <form action={registerAction} className="loginForm authFormBlock">
          <p className="authHint">Erstelle dir selbst ein Konto. Der Name darf noch nicht vergeben sein.</p>
          <label>
            Name
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Passwort
            <input name="password" type="password" autoComplete="new-password" required />
          </label>
          <button type="submit">Konto erstellen</button>
        </form>
      )}
    </section>
  );
}
