import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    // Outlook SMTP Configuration
    // The user MUST provide their App Password in environment variables.
    // Standard password often won't work with Microsoft due to security defaults.
    const transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false, // TLS requires secure: false for port 587
      auth: {
        user: 'bluearkive@outlook.com',
        pass: process.env.OUTLOOK_APP_PASSWORD || '', 
      },
      tls: {
        ciphers: 'SSLv3',
      },
    });

    // Formatting the email properly based on the submission type
    const htmlBody = `
      <div style="font-family: 'Courier New', Courier, monospace; background-color: #0a0e1a; color: #4ade80; padding: 20px; border-radius: 8px;">
        <h2 style="color: white; border-bottom: 1px solid #4ade80; padding-bottom: 10px;">🛡️ Sovereign Intake: New Application</h2>
        <p><strong>Type:</strong> ${data.type === 'access' ? 'Private Access Request' : 'Private Demo'}</p>
        <p><strong>Name:</strong> ${data.fullName}</p>
        <p><strong>Firm:</strong> ${data.firm}</p>
        <p><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #60a5fa;">${data.email}</a></p>
        <p><strong>Role:</strong> ${data.role}</p>
        
        <h3 style="color: white; margin-top: 20px;">Statement of Intent / Details:</h3>
        <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-left: 3px solid #4ade80; color: #cbd5e1;">
          ${data.intent || 'No intent provided.'}
        </div>
        
        <p style="margin-top: 30px; font-size: 12px; color: rgba(255,255,255,0.4);">
          BlueArkive Automated System<br/>
          Sovereign Memory Fabric
        </p>
      </div>
    `;

    // Send the email to the outlook address
    await transporter.sendMail({
      from: '"BlueArkive Intake" <bluearkive@outlook.com>',
      to: 'bluearkive@outlook.com',
      replyTo: data.email,
      subject: `[Intake] New ${data.type === 'access' ? 'Access Request' : 'Demo Request'} from ${data.fullName}`,
      html: htmlBody,
    });

    return NextResponse.json({ success: true, message: 'Application submitted successfully.' });
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send application. Check SMTP configuration.' },
      { status: 500 }
    );
  }
}
