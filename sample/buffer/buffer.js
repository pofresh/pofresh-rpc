const m = Buffer.from('hello');
console.log('old length %d', m.length);
const p = JSON.stringify(m);
const q = JSON.parse(p);
console.log(p);
console.log('stringify length %d', Buffer.from(p).length);
console.log(q);
const buf = Buffer.from(q.data);
console.log(buf.toString())