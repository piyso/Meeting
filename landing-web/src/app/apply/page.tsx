import { MembershipApplication } from '@/components/MembershipApplication'
import Image from 'next/image'
import Link from 'next/link'

export default function ApplyPage() {
  return (
    <main>
      {/* ═══ VIDEO BACKGROUND ═══ */}
      <video className="video-bg" autoPlay muted loop playsInline>
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260315_073750_51473149-4350-4920-ae24-c8214286f323.mp4"
          type="video/mp4"
        />
      </video>
      <div className="video-overlay" />

      {/* ═══ MINIMAL NAV ═══ */}
      <nav className="hero-nav scrolled" id="main-nav">
        <Link href="/" className="nav-logo">
          <Image src="/logo.svg" alt="BlueArkive Logo" width={32} height={32} />
          BlueArkive
        </Link>
        <div className="nav-links">
          <Link href="/" className="btn-secondary liquid-glass" style={{ padding: '0.5rem 1.5rem', fontSize: '0.8125rem' }}>
            Return to Core
          </Link>
        </div>
      </nav>

      {/* ═══ CONTENT ═══ */}
      <div className="content-layer" style={{ padding: '8rem 2rem 4rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <MembershipApplication />
      </div>
    </main>
  )
}
