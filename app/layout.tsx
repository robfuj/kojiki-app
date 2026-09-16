import { Analytics } from '@vercel/analytics/next'
import { Geist, Geist_Mono, Zen_Old_Mincho } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

// Mincho is the typeface of the Kojiki itself; it carries headings only.
const mincho = Zen_Old_Mincho({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mincho',
})

export const metadata: Metadata = {
  title: 'Kojiki — Ontology Workspace',
  description:
    'Operational interface for the Kojiki ontology: run the Orientation Protocol, open projects, work with department agents through the SYNAPSIS cycle, and track OKR trees.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#262b36' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`bg-background ${geistSans.variable} ${geistMono.variable} ${mincho.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  )
}
