-- Bookie database setup. Paste all of this into Supabase → SQL Editor → Run.

-- One row per book; the book (with its saved lines) lives in `data`.
create table if not exists public.books (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists books_user_id_idx on public.books (user_id);

-- Each reader sees and changes only their own shelf.
alter table public.books enable row level security;
drop policy if exists "read own books"   on public.books;
drop policy if exists "add own books"    on public.books;
drop policy if exists "edit own books"   on public.books;
drop policy if exists "delete own books" on public.books;
create policy "read own books"   on public.books for select using (auth.uid() = user_id);
create policy "add own books"    on public.books for insert with check (auth.uid() = user_id);
create policy "edit own books"   on public.books for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own books" on public.books for delete using (auth.uid() = user_id);

-- Live sync between your phone and laptop.
do $$ begin
  alter publication supabase_realtime add table public.books;
exception when duplicate_object then null; end $$;

-- Photos (your own cover photos and page photos).
-- Public-read with unguessable file names; only you can upload or delete in your folder.
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;
drop policy if exists "upload own media" on storage.objects;
drop policy if exists "delete own media" on storage.objects;
create policy "upload own media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
