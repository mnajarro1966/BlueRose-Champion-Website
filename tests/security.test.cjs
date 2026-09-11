const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('PostgreSQL grants and RLS protect drafts, storage, membership and publication', async () => {
  const db = new PGlite();
  const parent = '11111111-1111-4111-8111-111111111111';
  const stranger = '22222222-2222-4222-8222-222222222222';
  const album = '33333333-3333-4333-8333-333333333333';
  const photo = `${album}/44444444-4444-4444-8444-444444444444.jpg`;
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    insert into auth.users values ('${parent}'),('${stranger}');
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/001_journey.sql'), 'utf8'));
  await db.exec(`insert into public.journey_editors values ('${parent}')`);
  const as = async (role, uid = '') => {
    await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${uid}',false)`);
  };
  const denied = async sql => assert.rejects(db.exec(sql));
  const count = async table => (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;
  const insert = `insert into journey_albums(id,title,event_date,location,result) values ('${album}','Nationals','2026-09-01','Las Vegas','Gold')`;
  await as('anon'); await denied(insert);
  await denied(`select set_journey_published('${album}',true)`);
  await as('authenticated', stranger); await denied(insert);
  await denied(`insert into journey_editors values ('${stranger}')`);
  await denied(`select set_journey_published('${album}',true)`);
  await as('authenticated', parent); await db.exec(insert);
  await denied(`update journey_albums set published=true where id='${album}'`);
  await denied(`select set_journey_published('${album}',true)`);
  await denied(`insert into journey_photos values ('${photo}','${album}',0)`);
  await db.exec(`insert into storage.objects(bucket_id,name) values ('journey-photos','${photo}')`);
  await db.exec(`insert into journey_photos values ('${photo}','${album}',0)`);
  await denied(`insert into storage.objects(bucket_id,name) values ('other-bucket','${photo}')`);
  await as('anon'); assert.equal(await count('journey_albums'),0); assert.equal(await count('journey_photos'),0); assert.equal(await count('storage.objects'),0);
  await as('authenticated',stranger); assert.equal(await count('journey_albums'),0); assert.equal(await count('storage.objects'),0);
  await denied(`insert into storage.objects(bucket_id,name) values ('journey-photos','${album}/55555555-5555-4555-8555-555555555555.jpg')`);
  await as('authenticated',parent); await db.exec(`select set_journey_published('${album}',true)`);
  await as('anon'); assert.equal(await count('journey_albums'),1); assert.equal(await count('journey_photos'),1); assert.equal(await count('storage.objects'),1);
  await as('authenticated',parent);
  await db.exec(`delete from journey_photos where path='${photo}'; delete from storage.objects where name='${photo}'; update journey_albums set title='Should not change' where id='${album}'`);
  assert.equal(await count('journey_photos'),1); assert.equal(await count('storage.objects'),1);
  assert.equal((await db.query('select title from journey_albums')).rows[0].title,'Nationals');
  await db.exec(`select set_journey_published('${album}',false)`);
  await as('anon'); assert.equal(await count('storage.objects'),0);
  await as('authenticated',parent);
  await db.exec(`delete from journey_photos where path='${photo}'; delete from storage.objects where name='${photo}'`);
  assert.equal(await count('journey_photos'),0); assert.equal(await count('storage.objects'),0);
  for (let i=0;i<21;i++) {
    const file=`${album}/${String(i).padStart(8,'0')}-4444-4444-8444-444444444444.jpg`;
    await db.exec(`insert into storage.objects(bucket_id,name) values ('journey-photos','${file}')`);
    const attach=`insert into journey_photos values ('${file}','${album}',${i})`;
    if (i<20) await db.exec(attach); else await denied(attach);
  }
  assert.equal(await count('journey_photos'),20);
  await db.exec('reset role'); await db.exec(`delete from journey_editors where user_id='${parent}'`);
  await as('authenticated',parent); assert.equal(await count('journey_albums'),0);
  await denied(`select set_journey_published('${album}',true)`);
  await db.close();
});
