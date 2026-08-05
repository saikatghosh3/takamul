const fs = require('fs');
const t = fs.readFileSync('.svp-bundles/app.db37e884.js', 'utf-8');
const i = t.indexOf('68015:function');
console.log(t.substring(i, i + 800).replace(/\n/g, ' '));
