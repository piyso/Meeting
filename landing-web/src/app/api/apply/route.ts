import { NextResponse } from 'next/server'

/**
 * Sovereign Intake API
 *
 * Microsoft has disabled basic SMTP auth (535 5.7.139) on Outlook.com.
 * Instead of SMTP, this route:
 *   1. Validates the intake form data
 *   2. Sends email via Resend API (if RESEND_API_KEY is set)
 *   3. Falls back to a structured JSON webhook (if WEBHOOK_URL is set)
 *   4. Always logs the submission to Vercel's runtime logs
 */

interface IntakeData {
  fullName: string
  email: string
  firm?: string
  role?: string
  type?: 'access' | 'demo'
  intent?: string
}

function validateIntake(data: unknown): data is IntakeData {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.fullName === 'string' &&
    d.fullName.length > 0 &&
    typeof d.email === 'string' &&
    d.email.includes('@')
  )
}

function buildHtml(data: IntakeData): string {
  return `
    <div style="font-family: 'Courier New', Courier, monospace; background-color: #0a0e1a; color: #4ade80; padding: 20px; border-radius: 8px;">
      <h2 style="color: white; border-bottom: 1px solid #4ade80; padding-bottom: 10px;">🛡️ Sovereign Intake: New Application</h2>
      <p><strong>Type:</strong> ${data.type === 'access' ? 'Private Access Request' : 'Private Demo'}</p>
      <p><strong>Name:</strong> ${data.fullName}</p>
      <p><strong>Firm:</strong> ${data.firm || 'N/A'}</p>
      <p><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #60a5fa;">${data.email}</a></p>
      <p><strong>Role:</strong> ${data.role || 'N/A'}</p>
      
      <h3 style="color: white; margin-top: 20px;">Statement of Intent / Details:</h3>
      <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-left: 3px solid #4ade80; color: #cbd5e1;">
        ${data.intent || 'No intent provided.'}
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'BlueArkive Intake <onboarding@resend.dev>',
      to: ['bluearkive@outlook.com'],
      reply_to: data.email,
      subject: `[Intake] New ${data.type === 'access' ? 'Access Request' : 'Demo Request'} from ${data.fullName}`,
      html: buildHtml(data),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[Intake] Resend error:', err)
    return false
  }
  return true
}

async function sendViaWebhook(data: IntakeData): Promise<boolean> {
  const webhookUrl = process.env.WEBHOOK_URL
  if (!webhookUrl) return false

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🛡️ *New Sovereign Intake*\n*Name:* ${data.fullName}\n*Email:* ${data.email}\n*Firm:* ${data.firm || 'N/A'}\n*Role:* ${data.role || 'N/A'}\n*Type:* ${data.type || 'unknown'}\n*Intent:* ${data.intent || 'N/A'}`,
      ...data,
    }),
  })

  return res.ok
}

export async function POST(req: Request) {
  try {
    const data = await req.json()

    if (!validateIntake(data)) {
      return NextResponse.json(
        { success: false, error: 'Name and valid email are required.' },
        { status: 400 }
      )
    }

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

    // Try Resend first, then webhook fallback
    const sent = (await sendViaResend(data)) || (await sendViaWebhook(data))

    if (!sent) {
      // Even if email delivery fails, the application is logged above.
      // This is still a success from the user's perspective.
      console.warn(
        '[Intake] No delivery channel configured (set RESEND_API_KEY or WEBHOOK_URL). Application logged only.'
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully.',
    })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Intake API] Error:', errMsg)
    return NextResponse.json(
      { success: false, error: 'Failed to submit application. Please try again later.' },
      { status: 500 }
    )
  }
}
