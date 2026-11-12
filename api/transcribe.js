// Reads a photo of a book page with Claude and returns its sentences.
// Only signed-in Bookie users can call it (checked against Supabase),
// optionally limited further with ALLOWED_EMAILS.
export const config = { maxDuration: 60 };

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

async function currentUser(token) {
  if (!token || !process.env.SUPABASE_URL) return null;
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return r.ok ? r.json() : null;
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'Photo reading isn’t set up on this site.' });

  const user = await currentUser((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
  const allow = (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(String(user.email).toLowerCase())) return res.status(403).json({ error: 'Photo reading isn’t enabled for this account.' });

  const { image, title = '', author = '' } = req.body || {};
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(image || ''));
  if (!m) return res.status(400).json({ error: 'That doesn’t look like a photo.' });

  const prompt = `This is a photo of a page from the book "${String(title).slice(0, 200)}"${author ? ` by ${String(author).slice(0, 200)}` : ''}.
Transcribe the printed text faithfully, in reading order, split into sentences. Rejoin words hyphenated across line breaks and skip running headers and footers.
Also note which sentences the reader has marked — underlined, highlighted, bracketed, starred or otherwise marked by hand.
Reply with only JSON, no other text:
{"page": "the printed page number as a string, or null", "sentences": ["..."], "marked": [indexes of marked sentences]}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: prompt },
        ] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error('Anthropic error', r.status, j?.error);
      return res.status(502).json({ error: r.status === 429 ? 'Too many photos at once — try again in a minute.' : 'Couldn’t read that page — try again.' });
    }
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const out = parseJSON(text);
    if (!out || !Array.isArray(out.sentences)) return res.status(502).json({ error: 'Couldn’t make out the text — try a sharper photo.' });
    res.status(200).json({ page: out.page ?? null, sentences: out.sentences.map(String), marked: Array.isArray(out.marked) ? out.marked : [] });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Couldn’t read that page — try again.' });
  }
}
