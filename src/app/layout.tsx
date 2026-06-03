import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WM Tippspiel 2026',
  description: 'Privates WM Tippspiel für Freunde',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
