const fs = require('fs');
const code = fs.readFileSync('C:/Users/HP/AppData/Local/Temp/opencode/svp_app.js', 'utf8');

const patterns = [
  'user:{phone_number',
  'user:{phone',
  'phone_number,recaptcha',
  'phone_number, recaptcha',
  'phone_number:this',
  'phone_number:e.',
  'phoneNumber',
  'phone_number:'
];

for (const p of patterns) {
  let i = code.indexOf(p);
  if (i > -1) {
    console.log(`Pattern "${p}" at ${i}:`);
    console.log(code.substring(Math.max(0, i - 300), i + 400));
    console.log('\n---\n');
  }
}

// Find the login form component - look for otpLogin or similar
let idx = code.indexOf('otpLogin');
if (idx > -1) {
  console.log('=== otpLogin ===');
  console.log(code.substring(Math.max(0, idx - 500), idx + 1000));
}

// Look for submit function near login
idx = code.indexOf('async submit');
while (idx > -1) {
  const ctx = code.substring(idx, idx + 1000);
  if (ctx.includes('phone') || ctx.includes('otp') || ctx.includes('login')) {
    console.log('\n=== async submit at ' + idx + ' ===');
    console.log(ctx);
  }
  idx = code.indexOf('async submit', idx + 1);
  if (idx > 2000000) break;
}
