import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KoGraph Studio',
  description: 'Photobooth SaaS for Sony A6400 operators'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}
