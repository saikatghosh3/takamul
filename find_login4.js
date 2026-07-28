const fs = require('fs');
const code = fs.readFileSync('C:/Users/HP/AppData/Local/Temp/opencode/svp_app.js', 'utf8');

// Find where the login form data is assembled and sent
// The vue-auth plugin's login sends a POST to /sessions/otp with data
// Search for the login form component
let idx = code.indexOf('verifOtp');
if (idx === -1) idx = code.indexOf('verifyOtp');
if (idx === -1) idx = code.indexOf('otpVerif');
console.log('verifyOtp at:', idx);

// Look for the login form Vue component  
const loginFormPatterns = ['LoginForm', 'login-form', 'LoginStep', 'OtpForm', 'OtpStep', 'PhoneStep'];
for (const p of loginFormPatterns) {
  let i = code.indexOf(p);
  if (i > -1) {
    console.log(`"${p}" at ${i}`);
    console.log(code.substring(i, Math.min(code.length, i + 500)));
    console.log('\n---\n');
  }
}

// Search for the POST request body near '/sessions/otp' (the SVP loginData URL)
idx = code.indexOf('"/sessions/otp"');
if (idx === -1) idx = code.indexOf("'/sessions/otp'");
if (idx === -1) idx = code.indexOf('/sessions/otp');
console.log('\n/sessions/otp at:', idx);

// Now find the actual request interceptor or the data being sent
// The vue-auth plugin sends data as {user: {phone_number, country_code, recaptcha_token}}
// Let's search for country_code near phone_number
let ci = code.indexOf('country_code');
let count = 0;
while (ci > -1 && count < 10) {
  const ctx = code.substring(Math.max(0, ci - 200), ci + 200);
  if (ctx.includes('phone_number') || ctx.includes('recaptcha')) {
    console.log(`\ncountry_code at ${ci}:`);
    console.log(ctx);
  }
  ci = code.indexOf('country_code', ci + 1);
  count++;
}
