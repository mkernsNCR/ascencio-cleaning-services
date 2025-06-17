import { MailService } from '@sendgrid/mail';

async function testSendGridSetup() {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('❌ SENDGRID_API_KEY not found in environment variables');
    return;
  }

  console.log('✅ SENDGRID_API_KEY found');
  console.log('🔧 API Key format:', process.env.SENDGRID_API_KEY.substring(0, 8) + '...');

  const mailService = new MailService();
  mailService.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    const testEmail = {
      to: 'ascenciocleaning@gmail.com',
      from: 'ascenciocleaning@gmail.com',
      subject: 'SendGrid Test Email',
      text: 'This is a test email to verify SendGrid configuration.',
      html: '<p>This is a test email to verify SendGrid configuration.</p>'
    };

    console.log('📧 Attempting to send test email...');
    await mailService.send(testEmail);
    console.log('✅ Test email sent successfully!');
  } catch (error: any) {
    console.log('❌ Email send failed:');
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);
    
    if (error.response?.body?.errors) {
      console.log('SendGrid errors:', error.response.body.errors);
    }

    // Common error explanations
    if (error.code === 403) {
      console.log('\n🔍 403 Forbidden usually means:');
      console.log('1. API key lacks Mail Send permissions');
      console.log('2. Sender email (ascenciocleaning@gmail.com) not verified in SendGrid');
      console.log('3. API key is invalid or expired');
    }
  }
}

// Run the test
testSendGridSetup().catch(console.error);