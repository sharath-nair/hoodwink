import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Blobs } from '@/components/Blobs';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Hoodwink',
  description: 'Fool your friends with the most plausible fake answer.',
};

export const viewport: Viewport = { themeColor: '#120b2e', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Blobs />
        <Providers>
          <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
