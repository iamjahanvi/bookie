// Shelves without accounts.
// Each shelf has a public id (anyone with it can look) and a secret edit key (only its owner's devices hold it).
// Stored in Vercel's free Redis (Upstash). Only a hash of the edit key is kept on the server.
import crypto from 'node:crypto';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ID_RE = /^[a-z0-9]{8,24}$/, BOOK_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BOOK = 600 * 1024, MAX_BOOKS = 3000;

async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  const out = await r.json();
  if (!r.ok || !Array.isArray(out)) throw new Error('store error');
  const bad = out.find(x => x && x.error); if (bad) throw new Error(bad.error);
  return out.map(x => x.result);
}
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = (n, abc) => { const b = crypto.randomBytes(n); let s = ''; for (const v of b) s += abc[v % abc.length]; return s; };
const resolve = id => (id === 'home' ? (process.env.HOME_SHELF_ID || '') : String(id || ''));
const sameKey = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(501).json({ error: 'Storage is not set up' });
  try {
    if (req.method === 'GET') {
      const id = resolve(req.query.id);
      if (!ID_RE.test(id)) return res.status(404).json({ error: 'No such shelf' });
      const [meta, flat] = await redis([['GET', `shelf:${id}:meta`], ['HGETALL', `shelf:${id}:books`]]);
      if (!meta) return res.status(404).json({ error: 'No such shelf' });
      const m = JSON.parse(meta), books = [];
      for (let i = 0; i < (flat || []).length; i += 2) { try { books.push(JSON.parse(flat[i + 1])); } catch {} }
      return res.status(200).json({ id, name: m.name || '', updated: m.updated || 0, books });
    }

    if (req.method === 'POST') {          // make a new shelf
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const hour = Math.floor(Date.now() / 3.6e6);
      const [count] = await redis([['INCR', `rl:${sha(ip)}:${hour}`], ['EXPIRE', `rl:${sha(ip)}:${hour}`, 3700]]);
      if (count > 12) return res.status(429).json({ error: 'Too many new shelves from here — try later.' });
      const id = token(10, 'abcdefghijkmnpqrstuvwxyz23456789'), key = token(32, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789');
      const meta = JSON.stringify({ editHash: sha(key), created: Date.now(), updated: Date.now(), name: '' });
      const [ok] = await redis([['SET', `shelf:${id}:meta`, meta, 'NX']]);
      if (ok !== 'OK') return res.status(500).json({ error: 'Try again' });
      const books = (Array.isArray(req.body?.books) ? req.body.books : []).slice(0, 500)
        .filter(b => b && BOOK_RE.test(String(b.id)) && JSON.stringify(b).length <= MAX_BOOK);
      if (books.length) await redis([['HSET', `shelf:${id}:books`, ...books.flatMap(b => [String(b.id), JSON.stringify(b)])]]);
      return res.status(200).json({ id, key });
    }

    if (req.method === 'PUT') {           // change books on a shelf you hold the key for
      const id = resolve(req.query.id), key = String(req.headers['x-edit-key'] || '');
      if (!ID_RE.test(id) || !key) return res.status(403).json({ error: 'Not allowed' });
      const [meta, count] = await redis([['GET', `shelf:${id}:meta`], ['HLEN', `shelf:${id}:books`]]);
      if (!meta) return res.status(404).json({ error: 'No such shelf' });
      const m = JSON.parse(meta);
      if (!sameKey(sha(key), m.editHash)) return res.status(403).json({ error: 'Not allowed' });
      const put = (Array.isArray(req.body?.put) ? req.body.put : []).filter(b => b && BOOK_RE.test(String(b.id)));
      const del = (Array.isArray(req.body?.del) ? req.body.del : []).map(String).filter(s => BOOK_RE.test(s));
      if (put.some(b => JSON.stringify(b).length > MAX_BOOK)) return res.status(413).json({ error: 'That book is too large to save.' });
      if (count + put.length > MAX_BOOKS) return res.status(413).json({ error: 'This shelf is full.' });
      const cmds = [];
      if (put.length) cmds.push(['HSET', `shelf:${id}:books`, ...put.flatMap(b => [String(b.id), JSON.stringify(b)])]);
      if (del.length) cmds.push(['HDEL', `shelf:${id}:books`, ...del]);
      if (typeof req.body?.name === 'string') m.name = req.body.name.slice(0, 60);
      m.updated = Date.now(); cmds.push(['SET', `shelf:${id}:meta`, JSON.stringify(m)]);
      await redis(cmds);
      return res.status(200).json({ ok: true, updated: m.updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Couldn’t reach the shelf store' });
  }
}
