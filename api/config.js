// Public, browser-safe settings. The anon key is designed to be public;
// row-level security in Supabase keeps each reader's shelf private.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    transcribe: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
