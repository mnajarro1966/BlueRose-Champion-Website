-- Run once in a dedicated Supabase project's SQL Editor as the project owner.
begin;
create table public.journey_editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.journey_editors enable row level security;
revoke all on public.journey_editors from anon, authenticated;

create function public.is_journey_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.journey_editors where user_id = (select auth.uid()));
$$;
revoke all on function public.is_journey_editor() from public;
grant execute on function public.is_journey_editor() to anon, authenticated;

create table public.journey_albums (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  event_date date not null,
  location text not null check (length(trim(location)) between 1 and 200),
  result text not null check (length(trim(result)) between 1 and 300),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.journey_photos (
  path text primary key,
  album_id uuid not null references public.journey_albums(id) on delete cascade,
  position integer not null check (position >= 0),
  unique(album_id, position),
  check (path ~ ('^' || album_id::text || '/[0-9a-f-]{36}\.jpg$'))
);
alter table public.journey_albums enable row level security;
alter table public.journey_photos enable row level security;
revoke all on public.journey_albums, public.journey_photos from anon, authenticated;
grant select on public.journey_albums, public.journey_photos to anon, authenticated;
grant insert(id,title,event_date,location,result), update(title,event_date,location,result) on public.journey_albums to authenticated;
grant insert, delete on public.journey_photos to authenticated;

create policy "Read published albums or editor drafts" on public.journey_albums for select to anon, authenticated
using (published or public.is_journey_editor());
create policy "Editors create drafts" on public.journey_albums for insert to authenticated
with check (public.is_journey_editor() and not published);
create policy "Editors edit drafts" on public.journey_albums for update to authenticated
using (public.is_journey_editor() and not published) with check (public.is_journey_editor() and not published);
create policy "Read visible photo records" on public.journey_photos for select to anon, authenticated
using (exists(select 1 from public.journey_albums a where a.id = album_id));
create policy "Editors attach draft photos" on public.journey_photos for insert to authenticated
with check (public.is_journey_editor() and exists(select 1 from public.journey_albums a where a.id = album_id and not a.published));
create policy "Editors remove draft photos" on public.journey_photos for delete to authenticated
using (public.is_journey_editor() and exists(select 1 from public.journey_albums a where a.id = album_id and not a.published));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('journey-photos','journey-photos',false,8388608,array['image/jpeg']);

create policy "Read only published or authorized photos" on storage.objects for select to anon, authenticated
using (bucket_id = 'journey-photos' and (public.is_journey_editor() or exists (
  select 1 from public.journey_photos p join public.journey_albums a on a.id=p.album_id
  where p.path=name and a.published
)));
create policy "Editors upload into draft albums" on storage.objects for insert to authenticated
with check (bucket_id='journey-photos' and public.is_journey_editor()
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and exists(select 1 from public.journey_albums a where a.id::text=split_part(name,'/',1) and not a.published));
create policy "Editors remove draft objects" on storage.objects for delete to authenticated
using (bucket_id='journey-photos' and public.is_journey_editor()
  and exists(select 1 from public.journey_albums a where a.id::text=split_part(name,'/',1) and not a.published)
  and not exists(select 1 from public.journey_photos p where p.path=name));

-- Serialize photo changes and publication; validate the actual stored object.
create function public.check_journey_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid; is_live boolean;
begin
  if TG_OP='DELETE' then target := OLD.album_id; else target := NEW.album_id; end if;
  select published into is_live from public.journey_albums where id=target for update;
  if is_live then raise exception 'Return the album to draft before editing photos'; end if;
  if TG_OP='INSERT' then
    if (select count(*) from public.journey_photos where album_id=target) >= 20 then
      raise exception 'An album can have at most 20 photos';
    end if;
    if not exists(select 1 from storage.objects where bucket_id='journey-photos' and name=NEW.path) then
      raise exception 'Upload the photo before adding it to the album';
    end if;
    return NEW;
  end if;
  return OLD;
end;
$$;
revoke all on function public.check_journey_photo() from public, anon, authenticated;
create trigger journey_photo_check before insert or delete on public.journey_photos
for each row execute function public.check_journey_photo();

create function public.set_journey_published(album uuid, visible boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_journey_editor() then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.journey_albums where id=album for update;
  if not found then raise exception 'Album not found'; end if;
  if visible then
    if not exists(select 1 from public.journey_photos where album_id=album) then raise exception 'Add at least one photo before publishing'; end if;
    if exists(select 1 from public.journey_photos p where p.album_id=album and not exists(
      select 1 from storage.objects o where o.bucket_id='journey-photos' and o.name=p.path
    )) then raise exception 'Some photos have not finished uploading'; end if;
  end if;
  update public.journey_albums set published=visible where id=album;
end;
$$;
revoke all on function public.set_journey_published(uuid,boolean) from public, anon;
grant execute on function public.set_journey_published(uuid,boolean) to authenticated;
commit;
