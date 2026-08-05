const fs = require('fs');
const b = fs.readFileSync(require('path').join(__dirname, '..', '.svp-local-bundle.js'), 'utf8');
const urls = [...new Set([...b.matchAll(/["'`](https?:\/\/[^"'`\s]{5,120})["'`]/g)].map(x => x[1]).filter(u => /pacc|svp|api|prometric/i.test(u)))];
console.log('urls:', urls.slice(0, 40));
const env = [...new Set([...b.matchAll(/[A-Z_]{4,}_URL|[A-Z_]{4,}_API|VITE_[A-Z_]+/g)].map(x => x[0]))];
console.log('env:', env.slice(0, 40));
// find axios/fetch base and api endpoints
const apiRefs = [...new Set([...b.matchAll(/["'`]([a-zA-Z0-9_/-]*(?:reservation|centerBranch|branch|appointment|slot)[a-zA-Z0-9_/-]*)["'`]/g)].map(x => x[1]))];
console.log('endpoints:', apiRefs.slice(0, 60));
