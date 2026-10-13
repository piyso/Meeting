/* eslint-disable @typescript-eslint/no-require-imports */
const nodemailer = require('nodemailer')

// The password is read from the environment and never written here:
//   OUTLOOK_APP_PASSWORD=... node test-smtp.js
const password = process.env.OUTLOOK_APP_PASSWORD

async function test() {
  if (!password) {
    console.error('Set OUTLOOK_APP_PASSWORD before running this test.')
    process.exitCode = 1
    return
  }
  console.log('Testing Outlook SMTP...')
  const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
      user: 'bluearkive@outlook.com',
      pass: password,
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
