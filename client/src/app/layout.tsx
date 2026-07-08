import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ilovexams.com | Real-Time Technical Interview Platform',
  description: 'Conduct secure, real-time code, system design, and MCQ technical interviews with integrated anti-cheating protocols, live keystrokes, and WebRTC streaming.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen text-slate-100 selection:bg-purple-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
