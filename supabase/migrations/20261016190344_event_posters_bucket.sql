# Creates the public bucket used by worker/supabase-storage.ts
insert into storage.buckets (id, name, public)
values ('event-posters', 'event-posters', true)
on conflict (id) do nothing;
