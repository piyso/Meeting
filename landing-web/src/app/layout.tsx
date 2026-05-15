import type { Metadata } from 'next'
import { Poppins, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import { SmoothScroll } from '@/components/SmoothScroll'

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-poppins',
  display: 'swap',
})

const sourceSerif4 = Source_Serif_4({
  weight: ['400', '500'],
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-source-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BlueArkive — The Sovereign Memory Fabric',
  description:
    'Private AI meeting notes that run 100% locally on your machine. No bots. No cloud. No fees. Free forever.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${sourceSerif4.variable}`}
    >
      <body suppressHydrationWarning>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  )
}
