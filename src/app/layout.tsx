import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Neon Archivist",
  description: "A music guessing game prototype",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <body>
        <nav className="global-nav">
          <a href="/" className="nav-logo">Neon Archivist</a>
          <div className="nav-links">
            <a href="/">Game Lobby</a>
            <a href="/playlists">Playlists</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
