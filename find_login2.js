const fs = require('fs');
const code = fs.readFileSync('C:/Users/HP/AppData/Local/Temp/opencode/svp_app.js', 'utf8');

// Find the login component that has phone_number field and calls login
// Look for 'loginAs' or 'signIn' or 'login()' methods
const loginMethods = ['loginAs', 'signIn', '$auth.login', 'login(', 'sendOtp', 'sendOtpCode'];
for (const m of loginMethods) {
  let i = code.indexOf(m);
  while (i > -1 && i < code.length) {
    const start = Math.max(0, i - 100);
    const end = Math.min(code.length, i + 600);
    const ctx = code.substring(start, end);
    if (ctx.includes('phone') || ctx.includes('user') || ctx.includes('otp')) {
      console.log(`=== "${m}" at ${i} ===`);
      console.log(ctx);
      console.log('\n---\n');
    }
    const next = code.indexOf(m, i + 1);
    if (next === -1 || next - i > 10000) break;
    i = next;
  }
}
