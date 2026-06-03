import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WM Tippspiel 2026',
  description: 'Privates WM Tippspiel für Freunde',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/app-icon.png',
    apple: '/app-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'WM Tippspiel',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.dataset.theme = savedTheme || (prefersDark ? 'dark' : 'light');
              } catch (error) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
