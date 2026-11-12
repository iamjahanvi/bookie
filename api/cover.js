// Same-origin proxy for cover images, so the page can read their colours
// (spine colour) and draw them onto share cards. Only known cover hosts.
const ALLOWED = [
  'covers.openlibrary.org',
  'books.google.com',
  'books.googleusercontent.com',
];
const MAX_BYTES = 6 * 1024 * 1024;

export default async function handler(req, res) {
  let url;
  try { url = new URL(String(req.query.u || '')); } catch { return res.status(400).end('Bad url'); }
  const host = url.hostname;
  const supabaseHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;
  const ok = url.protocol === 'https:' && (ALLOWED.includes(host) || host === supabaseHost);
  if (!ok) return res.status(403).end('Host not allowed');

  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Bookie reading log (cover proxy)' }, redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return res.status(502).end('Not an image');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).end('Too large');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    res.status(200).send(buf);
  } catch {
    res.status(502).end('Fetch failed');
  }
}
