// Public, browser-safe settings. The anon key is designed to be public;
// row-level security in Supabase keeps each reader's shelf private.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    transcribe: Boolean(process.env.ANTHROPIC_API_KEY),
    spine: Boolean(process.env.ANTHROPIC_API_KEY),
    store: Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    homeShelf: process.env.HOME_SHELF_ID || '',
  });
}
