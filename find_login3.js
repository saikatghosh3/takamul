const fs = require('fs');
const code = fs.readFileSync('C:/Users/HP/AppData/Local/Temp/opencode/svp_app.js', 'utf8');

// Search for the component that renders the login form
// It should have phone_number variable and submitOtp or submitSms
const patterns = [
  'submitOtpCode',
  'submitLogin',
  'handleLogin',
  'handleOtp',
  'loginData',
  'phone_number:',
  'this.phone_number',
  'this.phoneNumber',
  'this.formData.phone',
  'user: {',
  'user:{'
];

for (const p of patterns) {
  let i = code.indexOf(p);
  while (i > -1) {
    const start = Math.max(0, i - 200);
    const end = Math.min(code.length, i + 600);
    const ctx = code.substring(start, end);
    if (ctx.includes('phone') && (ctx.includes('otp') || ctx.includes('submit') || ctx.includes('login') || ctx.includes('data'))) {
      console.log(`=== "${p}" at ${i} ===`);
      console.log(ctx);
      console.log('\n---\n');
    }
    const next = code.indexOf(p, i + 1);
    if (next === -1 || next - i > 20000) break;
    i = next;
  }
}
