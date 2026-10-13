import { NextResponse } from 'next/server'

/**
 * Sovereign Intake API
 *
 * Microsoft has disabled basic SMTP auth (535 5.7.139) on Outlook.com.
 * Instead of SMTP, this route:
 *   1. Validates and bounds the intake form data
 *   2. Sends email via Resend API (if RESEND_API_KEY is set)
 *   3. Falls back to a structured JSON webhook (if WEBHOOK_URL is set)
 *   4. Always logs the submission to Vercel's runtime logs
 *
 * It answers "success" only when one of the two channels accepted the
 * application. Otherwise the applicant is told to write to CONTACT_EMAIL,
 * instead of being shown a confirmation for something nobody will read.
 */

const CONTACT_EMAIL = 'bluearkive@outlook.com'

const MAX_BODY_CHARS = 16_000
const MAX_LENGTH = {
  fullName: 120,
  email: 254,
  firm: 160,
  role: 80,
  intent: 4000,
} as const

const DELIVERY_TIMEOUT_MS = 8000

// Best effort only: serverless instances do not share memory, so this slows a
// single noisy client down rather than enforcing a global limit.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_MAX_CLIENTS = 2000
const recentSubmissions = new Map<string, number[]>()

interface IntakeData {
  fullName: string
  email: string
  firm: string
  role: string
  type: 'access' | 'demo'
  intent: string
}

type ParsedIntake = { ok: true; data: IntakeData } | { ok: false; error: string }

/** One line of text: control characters and line breaks become spaces. */
function singleLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Free text: line breaks are kept, other control characters are dropped. */
function multiLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max)
}

// The pattern browsers apply to <input type="email">, plus a dot in the domain.
// One plain address and nothing else, so the value is safe as a Reply-To.
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

function parseIntake(body: unknown): ParsedIntake {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Name and valid email are required.' }
  }
  const raw = body as Record<string, unknown>

  const fullName = singleLine(raw.fullName, MAX_LENGTH.fullName)
  const email = typeof raw.email === 'string' ? raw.email.trim() : ''
  if (!fullName || email.length > MAX_LENGTH.email || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Name and valid email are required.' }
  }

  return {
    ok: true,
    data: {
      fullName,
      email,
      firm: singleLine(raw.firm, MAX_LENGTH.firm),
      role: singleLine(raw.role, MAX_LENGTH.role),
      type: raw.type === 'demo' ? 'demo' : 'access',
      intent: multiLine(raw.intent, MAX_LENGTH.intent),
    },
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Slack-style message text treats &, < and > as markup (mentions, links). */
function escapeChatText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The address as a mailto link target, with nothing that could add headers. */
function mailtoHref(email: string): string {
  const at = email.lastIndexOf('@')
  return `mailto:${encodeURIComponent(email.slice(0, at))}@${encodeURIComponent(email.slice(at + 1))}`
}

function buildHtml(data: IntakeData): string {
  return `
    <div style="font-family: 'Courier New', Courier, monospace; background-color: #0a0e1a; color: #4ade80; padding: 20px; border-radius: 8px;">
      <h2 style="color: white; border-bottom: 1px solid #4ade80; padding-bottom: 10px;">🛡️ Sovereign Intake: New Application</h2>
      <p><strong>Type:</strong> ${data.type === 'access' ? 'Private Access Request' : 'Private Demo'}</p>
      <p><strong>Name:</strong> ${escapeHtml(data.fullName)}</p>
      <p><strong>Firm:</strong> ${escapeHtml(data.firm || 'N/A')}</p>
      <p><strong>Email:</strong> <a href="${mailtoHref(data.email)}" style="color: #60a5fa;">${escapeHtml(data.email)}</a></p>
      <p><strong>Role:</strong> ${escapeHtml(data.role || 'N/A')}</p>

      <h3 style="color: white; margin-top: 20px;">Statement of Intent / Details:</h3>
      <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-left: 3px solid #4ade80; color: #cbd5e1;">
        ${escapeHtml(data.intent || 'No intent provided.').replace(/\n/g, '<br/>')}
      </div>

      <p style="margin-top: 30px; font-size: 12px; color: rgba(255,255,255,0.4);">
        BlueArkive Automated System<br/>
        Sovereign Memory Fabric
      </p>
    </div>
  `
}

async function sendViaResend(data: IntakeData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BlueArkive Intake <onboarding@resend.dev>',
        to: [CONTACT_EMAIL],
        reply_to: data.email,
        subject: `[Intake] New ${data.type === 'access' ? 'Access Request' : 'Demo Request'} from ${data.fullName}`,
        html: buildHtml(data),
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Intake] Resend error:', res.status, err.slice(0, 500))
      return false
    }
    return true
  } catch (error: unknown) {
    console.error('[Intake] Resend request failed:', describeError(error))
    return false
  }
}

async function sendViaWebhook(data: IntakeData): Promise<boolean> {
  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) return false

  const line = (value: string) => escapeChatText(value || 'N/A')

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        text: `🛡️ *New Sovereign Intake*\n*Name:* ${line(data.fullName)}\n*Email:* ${line(data.email)}\n*Firm:* ${line(data.firm)}\n*Role:* ${line(data.role)}\n*Type:* ${data.type}\n*Intent:* ${line(data.intent)}`,
      }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })

    if (!res.ok) console.error('[Intake] Webhook error:', res.status)
    return res.ok
  } catch (error: unknown) {
    console.error('[Intake] Webhook request failed:', describeError(error))
    return false
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The caller's address as reported by the hosting platform, if it reports one. */
function clientKey(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip')?.trim() || null
}

/** Seconds until this client may submit again, or 0 if it may submit now. */
function retryAfterSeconds(key: string, now: number): number {
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = (recentSubmissions.get(key) ?? []).filter(at => at > windowStart)

  if (recent.length >= RATE_LIMIT_MAX) {
    recentSubmissions.set(key, recent)
    const oldest = recent[0] ?? now
    return Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000))
  }

  if (!recentSubmissions.has(key) && recentSubmissions.size >= RATE_LIMIT_MAX_CLIENTS) {
    for (const [other, times] of recentSubmissions) {
      if (!times.some(at => at > windowStart)) recentSubmissions.delete(other)
    }
    // Still full of active clients: forget the one seen longest ago.
    if (recentSubmissions.size >= RATE_LIMIT_MAX_CLIENTS) {
      const first = recentSubmissions.keys().next()
      if (!first.done) recentSubmissions.delete(first.value)
    }
  }

  recent.push(now)
  recentSubmissions.set(key, recent)
  return 0
}

export async function POST(req: Request) {
  try {
    // Without an address every visitor would share one allowance, so no limit then.
    const client = clientKey(req)
    const waitSeconds = client ? retryAfterSeconds(client, Date.now()) : 0
    if (waitSeconds > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many applications from this connection. Please try again later, or write to ${CONTACT_EMAIL}.`,
        },
        { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
      )
    }

    const tooLong = () =>
      NextResponse.json(
        { success: false, error: 'That application is too long. Please shorten it.' },
        { status: 413 }
      )
    if (Number(req.headers.get('content-length')) > MAX_BODY_CHARS) return tooLong()
    const raw = await req.text()
    if (raw.length > MAX_BODY_CHARS) return tooLong()

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Name and valid email are required.' },
        { status: 400 }
      )
    }

    const parsed = parseIntake(body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }
    const data = parsed.data

    // Always log to Vercel runtime logs (visible in dashboard)
    console.log(
      '[Intake] New application:',
      JSON.stringify({
        fullName: data.fullName,
        email: data.email,
        firm: data.firm,
        role: data.role,
        type: data.type,
        timestamp: new Date().toISOString(),
      })
    )

    const configured = Boolean(process.env.RESEND_API_KEY || process.env.WEBHOOK_URL)
    if (!configured) {
      console.error(
        '[Intake] No delivery channel configured (set RESEND_API_KEY or WEBHOOK_URL). Application logged only.'
      )
    }

    // Try Resend first, then webhook fallback
    const sent = configured && ((await sendViaResend(data)) || (await sendViaWebhook(data)))

    if (!sent) {
      return NextResponse.json(
        {
          success: false,
          error: `We could not deliver your application. Please write to ${CONTACT_EMAIL} instead.`,
          contact: CONTACT_EMAIL,
        },
        { status: configured ? 502 : 503 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully.',
    })
  } catch (error: unknown) {
    console.error('[Intake API] Error:', describeError(error))
    return NextResponse.json(
      {
        success: false,
        error: `Failed to submit application. Please try again later, or write to ${CONTACT_EMAIL}.`,
        contact: CONTACT_EMAIL,
      },
      { status: 500 }
    )
  }
}
