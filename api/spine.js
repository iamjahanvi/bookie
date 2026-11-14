// Designs a book's spine from its real front cover, with Claude.
// Returns colours and a layout the shelf then draws. One small call per book; the result is saved with the book.
export const config = { maxDuration: 30 };

const MODEL = process.env.ANTHROPIC_SPINE_MODEL || 'claude-haiku-5-5';
const HOSTS = ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com'];
const STYLES = ['classic', 'cond', 'block', 'quiet', 'heavy', 'stack'];
const hex = v => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : null);

async function signedIn(req) {
  if (!process.env.SUPABASE_URL) return true;                       // no accounts set up: same-site check below is the gate
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'Not set up' });
  // only this site's own pages may call it
  const origin = req.headers.origin || '', host = req.headers.host || '';
  let sameSite = false; try { sameSite = new URL(origin).host === host; } catch {}
  if (!sameSite) return res.status(403).json({ error: 'Forbidden' });
  if (!(await signedIn(req))) return res.status(401).json({ error: 'Sign in' });

  const { cover, title = '', author = '' } = req.body || {};
  let url; try { url = new URL(String(cover)); } catch { return res.status(400).json({ error: 'Bad cover' }); }
  const supa = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;
  if (url.protocol !== 'https:' || !(HOSTS.includes(url.hostname) || url.hostname === supa)) return res.status(400).json({ error: 'Cover host not allowed' });

  try {
    const img = await fetch(url, { redirect: 'follow' });
    const type = (img.headers.get('content-type') || '').split(';')[0];
    if (!img.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return res.status(422).json({ error: 'No image' });
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return res.status(422).json({ error: 'Image too large' });

    const prompt = `This is the front cover of the book "${String(title).slice(0, 160)}"${author ? ` by ${String(author).slice(0, 120)}` : ''}.
Design the spine a publisher would print for this exact edition, so it clearly belongs with this cover.
Reply with only JSON, no other text:
{"bg": "#rrggbb spine background, taken from the cover (usually its dominant or edge colour)",
 "ink": "#rrggbb colour of the title lettering on the spine, taken from the cover's own title colour where it reads clearly on bg",
 "accent": "#rrggbb a second colour from the cover for bands, rules or the author block",
 "style": one of ${JSON.stringify(STYLES)} where
   "classic" = serif title with thin bands at head and tail (literary hardbacks, classics),
   "cond" = tall condensed sans capitals (modern non-fiction, thrillers),
   "block" = a solid colour block at the top carrying the author, bold sans title below (design-led paperbacks),
   "quiet" = small italic serif, lots of empty space (poetry, minimalist literary),
   "heavy" = very bold sans capitals (big commercial titles),
   "stack" = title set horizontally in stacked lines (only suits thick books)}
Choose ink so it has strong contrast against bg.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } },
        { type: 'text', text: prompt },
      ] }] }),
    });
    const j = await r.json();
    if (!r.ok) { console.error('Anthropic error', r.status, j?.error); return res.status(r.status === 429 ? 429 : 502).json({ error: 'Design failed' }); }
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const a = text.indexOf('{'), b = text.lastIndexOf('}'); let out = null;
    try { out = JSON.parse(text.slice(a, b + 1)); } catch {}
    const bg = hex(out?.bg), ink = hex(out?.ink), accent = hex(out?.accent);
    if (!bg || !ink) return res.status(422).json({ error: 'No design' });
    res.status(200).json({ bg, ink, accent: accent || ink, style: STYLES.includes(out.style) ? out.style : 'classic' });
  } catch (e) {
    console.error(e); res.status(502).json({ error: 'Design failed' });
  }
}
