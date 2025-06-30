import nodemailer from 'nodemailer';

async function testGmailSetup() {
  if (!process.env.GMAIL_APP_PASSWORD) {
    console.log('❌ GMAIL_APP_PASSWORD not found in environment variables');
    console.log('📝 You need to generate a Gmail App Password:');
    console.log('1. Go to Google Account settings');
    console.log('2. Enable 2-Factor Authentication');
    console.log('3. Generate an App Password for Mail');
    console.log('4. Add GMAIL_APP_PASSWORD to your environment');
    return;
  }

  console.log('✅ GMAIL_APP_PASSWORD found');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'ascenciocleaning@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  try {
    console.log('📧 Attempting to send test email...');
    
    await transporter.sendMail({
      to: 'ascenciocleaning@gmail.com',
      from: 'ascenciocleaning@gmail.com',
      subject: 'Gmail SMTP Test Email',
      text: 'This is a test email to verify Gmail SMTP configuration.',
      html: '<p><strong>Success!</strong> Gmail SMTP is working correctly.</p>'
    });
    
    console.log('✅ Test email sent successfully via Gmail SMTP!');
  } catch (error: any) {
    console.log('❌ Email send failed:');
    console.log('Error:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔍 Authentication failed - this usually means:');
      console.log('1. Gmail App Password is incorrect');
      console.log('2. 2-Factor Authentication not enabled on Gmail');
      console.log('3. App Password not generated properly');
    }
  }
}

// Run the test
testGmailSetup().catch(console.error);