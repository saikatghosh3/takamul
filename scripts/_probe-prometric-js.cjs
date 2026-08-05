const fs = require('fs');
const b = fs.readFileSync('scripts/_prometric-locate.html', 'utf8');
const m = [...b.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(x => x[1]);
console.log('scripts:', m);
const inline = [...b.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]);
inline.forEach((x, i) => console.log('inline script', i, 'len', x.length));
// find where aIds is declared
const ai = b.indexOf('aIds');
console.log('aIds context:', b.slice(ai - 300, ai + 800));
