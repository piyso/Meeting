const nodemailer = require('nodemailer')

async function test() {
  console.log('Testing Outlook SMTP...')
  const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
      user: 'bluearkive@outlook.com',
      pass: 'vwmgehpgyycqezhy',
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false,
    },
  })

  try {
    await transporter.verify()
    console.log('SUCCESS: SMTP Authentication worked!')
  } catch (error) {
    console.error('FAILED: SMTP Authentication failed.')
    console.error(error.message)
  }
}

test()
