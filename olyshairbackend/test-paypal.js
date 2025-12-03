// test-paypal.js - UPDATED VERSION
const fetch = require('node-fetch');

async function testCredentials() {
  const clientId = 'Afdo7xRdDvUKhixkahcnYo27-SmAYrZQgvuZSPATxitvw__sm4A5ZWHtresK_n-UrywV8pCBmuqpRGqg';
  const clientSecret = 'ELW8ne222O410kV0zgFnavOgdfCOmEGQqb1gKyTJRywyxudL6Dp6_ru-IK8URl8n8wAg5rMat_hPr0qp';
  
  console.log('🔐 Testing PayPal Credentials:');
  console.log('Client ID:', clientId.substring(0, 20) + '...');
  console.log('Client Secret:', clientSecret.substring(0, 20) + '...');
  
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    console.log('🌐 Calling PayPal API...');
    
    // Try BOTH endpoints to see which works
    const urls = [
      'https://api-m.paypal.com/v1/oauth2/token',  // Production
      'https://api-m.sandbox.paypal.com/v1/oauth2/token'  // Sandbox
    ];
    
    for (const url of urls) {
      console.log(`\n🔄 Trying: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      
      const data = await response.json();
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        console.log(`✅ SUCCESS! Working on: ${url.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION'}`);
        console.log('Access Token:', data.access_token.substring(0, 50) + '...');
        console.log('Expires in:', data.expires_in, 'seconds');
        return;
      } else {
        console.log(`❌ Failed: ${data.error_description || data.error}`);
      }
    }
    
    console.log('\n💥 All attempts failed. Your credentials might be invalid.');
    
  } catch (error) {
    console.log('❌ Network/Other error:', error.message);
  }
}

testCredentials();