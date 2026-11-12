# Bookie

A bookshelf for what you read and the lines you keep.

- **Wooden shelves**: Reading now, Finished and Next read. They run edge to edge and scroll sideways.
- **Real covers**: search Open Library, with Google Books as a fallback, then choose the exact edition you own or upload your own photo. The spine colour is taken from the cover.
- **Lines**: type them in, or photograph the page. Claude copies out the text and picks the sentences you underlined.
- **Share cards**: 1080×1350 quote cards in three styles that open your phone's share sheet.
- **Year in reading**: books finished, pages read, lines kept and average rating.
- Synced across devices with Supabase, with email sign-in. You can add it to your home screen like an app.

There's no build step. It's plain HTML, CSS and JS, plus three small Vercel functions in `/api`.

## Setup (about 10 minutes)

### 1. Supabase
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste in all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Go to **Authentication → URL Configuration** and set **Site URL** to your Vercel URL, e.g. `https://bookie-xyz.vercel.app`. Add the same URL under **Redirect URLs**.
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.

### 2. Anthropic (photo reading)
Create an API key at [console.anthropic.com](https://console.anthropic.com). Each page photo costs a fraction of a cent.

### 3. Vercel
1. **Add New → Project**, then import `iamjahanvi/bookie`. The framework preset is **Other**, with no build command.
2. Add these environment variables:

| Name | Value |
|---|---|
| `SUPABASE_URL` | your Project URL |
| `SUPABASE_ANON_KEY` | your anon public key |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `ALLOWED_EMAILS` | *(optional)* your email address, so only you can use photo reading |

3. Click **Deploy**, then put the deployed URL into Supabase's Site URL (step 1.3).

To sign in, open the site, enter your email and tap the link in the email **on the same device**.

## Local preview
- `npx vercel dev` runs everything locally using your env vars. Use `vercel env pull` to fetch them.
- Opening `/?demo` with any static server runs the app without a database, saving to the browser only.

## Files
```
index.html  styles.css  app.js     the app
api/config.js                       gives the browser the public Supabase settings
api/cover.js                        same-origin cover proxy (spine colours + share cards)
api/transcribe.js                   page photo → sentences, via Claude
supabase/schema.sql                 tables, row-level security, storage bucket
```
