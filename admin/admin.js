import { getClient, unwrap, BUCKET, element, albumCard, showAlbum } from '../journey-client.js';

const $ = id => document.getElementById(id);
let client, current = null, photos = [], dirty = false, busy = false, reviewed = false;
let albumList = [];
const message = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
const report = error => message(`Could not finish. ${error.message || 'Check your connection and try again.'} Your current work is still here; please retry.`, true);
function controls() {
  $('fields').disabled = busy || !!current?.published;
  for (const id of ['save', 'preview', 'publish', 'unpublish', 'albums', 'new', 'logout']) $(id).disabled = busy;
  $('save').hidden = $('publish').hidden = !!current?.published;
  $('unpublish').hidden = !current?.published;
  $('publish').disabled = busy || dirty || !current || !photos.length || !reviewed;
  $('state').textContent = current?.published ? 'Published · visible to everyone' : 'Draft · only parents can see';
}
async function run(action) {
  if (busy) return;
  busy = true; controls();
  try { await action(); } catch (error) { report(error); }
  finally { busy = false; controls(); }
}
function changed() { dirty = true; reviewed = false; controls(); }
function metadata() {
  return { title: $('title').value.trim(), event_date: $('date').value, location: $('location').value.trim(), result: $('result').value.trim() };
}
function valid() {
  if (!$('editor').reportValidity()) return false;
  const data = metadata();
  if (!data.title || !data.location || !data.result) { message('Please complete every tournament field.', true); return false; }
  return true;
}
function releasePhotos() { photos.forEach(photo => { if (photo.local) URL.revokeObjectURL(photo.url); }); }
function reset() {
  releasePhotos(); photos = []; current = null; dirty = false; reviewed = false;
  $('editor').reset(); $('albums').value = ''; $('editor-heading').textContent = 'New tournament'; renderPhotos(); controls();
}
async function refreshList() {
  albumList = unwrap(await client.from('journey_albums').select('id,title,event_date,location,result,published').order('event_date', { ascending: false }));
  $('albums').replaceChildren(new Option('New tournament', ''));
  albumList.forEach(album => $('albums').add(new Option(`${album.published ? 'Published' : 'Draft'} · ${album.title}`, album.id)));
  $('albums').value = current?.id || '';
}
async function openAlbum(id) {
  const album = unwrap(await client.from('journey_albums').select('id,title,event_date,location,result,published').eq('id', id).single());
  const records = unwrap(await client.from('journey_photos').select('path,position').eq('album_id', id).order('position'));
  const signed = records.length ? unwrap(await client.storage.from(BUCKET).createSignedUrls(records.map(p => p.path), 3600)) : [];
  if (signed.some(p => p.error || !p.signedUrl)) throw new Error('Some photos could not load. Please try opening the album again.');
  releasePhotos(); current = album;
  photos = records.map((p, i) => ({ ...p, url: signed[i].signedUrl, uploaded: true, recorded: true }));
  $('title').value = album.title; $('date').value = album.event_date; $('location').value = album.location; $('result').value = album.result;
  $('photos').value = ''; $('editor-heading').textContent = album.title;
  dirty = false; reviewed = false; renderPhotos(); controls();
  message(album.published ? 'This album is live. Return it to draft before changing it.' : 'Draft opened. Add photos, save, and preview when ready.');
}
function renderPhotos() {
  $('photo-grid').replaceChildren();
  photos.forEach((photo, index) => {
    const tile = element('figure', 'photo-tile');
    const img = element('img'); img.src = photo.url; img.alt = `Selected tournament photo ${index + 1}`;
    tile.append(img, element('figcaption', '', index === 0 ? 'Cover photo' : `Photo ${index + 1}`));
    if (!current?.published) {
      const remove = element('button', 'secondary', 'Remove photo'); remove.type = 'button';
      remove.onclick = () => run(async () => {
        if (photo.recorded) unwrap(await client.from('journey_photos').delete().eq('path', photo.path));
        if (photo.uploaded) {
          const { error } = await client.storage.from(BUCKET).remove([photo.path]);
          if (error) { photo.recorded = false; throw new Error('Photo was removed from the album, but file cleanup failed. Retry Remove photo.'); }
        }
        if (photo.local) URL.revokeObjectURL(photo.url);
        photos.splice(index, 1); changed(); renderPhotos();
      });
      tile.append(remove);
    }
    $('photo-grid').append(tile);
  });
}
export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use JPEG, PNG or WebP photos. Export HEIC as JPEG first.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Each original photo must be 20 MB or smaller.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('This photo could not be prepared. Try a smaller image.');
    return { blob, url: URL.createObjectURL(blob), local: true, uploaded: false, recorded: false };
  } finally { bitmap.close(); }
}
$('photos').onchange = () => run(async () => {
  const files = [...$('photos').files];
  $('photos').value = '';
  if (photos.length + files.length > 20) throw new Error('Each album can contain up to 20 photos.');
  const failures = [];
  for (let i = 0; i < files.length; i++) {
    message(`Preparing photo ${i + 1} of ${files.length}…`);
    try { photos.push(await preparePhoto(files[i])); changed(); renderPhotos(); }
    catch (error) { failures.push(`${files[i].name}: ${error.message}`); }
  }
  message(failures.length ? failures.join(' ') : `${photos.length} photos ready. Save your draft to keep them.`, !!failures.length);
});
async function saveDraft() {
  if (!current) {
    // Keep a stable id so retry after a lost response cannot create a second album.
    current = { id: crypto.randomUUID(), published: false, creating: true };
  }
  if (current.creating) {
    const { error } = await client.from('journey_albums').insert({ id: current.id, ...metadata() });
    if (error && error.code !== '23505') throw error;
    current.creating = false;
  }
  const saved = unwrap(await client.from('journey_albums').update(metadata()).eq('id', current.id).eq('published', false).select().single());
  current = saved;
  $('editor-heading').textContent = current.title;
  // Positions are append-only, so removing a photo never collides with an existing one.
  let nextPosition = Math.max(-1, ...photos.filter(p => p.position !== undefined).map(p => p.position)) + 1;
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    if (photo.recorded) continue;
    photo.path ||= `${current.id}/${crypto.randomUUID()}.jpg`;
    photo.position ??= nextPosition++;
    message(`Saving photo ${i + 1} of ${photos.length}… Keep this page open.`);
    if (!photo.uploaded) {
      const { error } = await client.storage.from(BUCKET).upload(photo.path, photo.blob, { contentType: 'image/jpeg', cacheControl: '60', upsert: false });
      if (error && String(error.statusCode) !== '409') throw error;
      photo.uploaded = true;
    }
    const { error } = await client.from('journey_photos').insert({ album_id: current.id, path: photo.path, position: photo.position });
    if (error) {
      // Resolve an ambiguous successful insert before retrying, without duplicate records.
      const existing = unwrap(await client.from('journey_photos').select('path').eq('path', photo.path).maybeSingle());
      if (!existing) throw error;
    }
    photo.recorded = true;
  }
  dirty = false; reviewed = false;
  await refreshList();
  message('Draft saved privately. Preview your album, then publish when ready.');
}
$('editor').onsubmit = e => { e.preventDefault(); if (valid()) run(saveDraft); };
$('fields').addEventListener('input', changed);
$('preview').onclick = () => run(async () => {
  if (!valid()) return;
  if (!photos.length) throw new Error('Add at least one photo to preview the album.');
  const saved = photos.filter(p => !p.local);
  if (saved.length) {
    const urls = unwrap(await client.storage.from(BUCKET).createSignedUrls(saved.map(p => p.path), 3600));
    if (urls.some(p => p.error || !p.signedUrl)) throw new Error('Could not load the preview photos.');
    saved.forEach((p, i) => { p.url = urls[i].signedUrl; });
  }
  const data = metadata(), urls = photos.map(p => p.url);
  $('preview-card').replaceChildren(albumCard(data, urls, () => showAlbum(data.title, urls)));
  $('preview-dialog').showModal(); reviewed = !dirty && !!current;
});
$('close-preview').onclick = () => $('preview-dialog').close();
$('publish').onclick = () => run(async () => {
  if (dirty || !reviewed || !current || !photos.length) throw new Error('Save and preview this album first.');
  unwrap(await client.rpc('set_journey_published', { album: current.id, visible: true }));
  current.published = true; renderPhotos();
  message('Published! Your album is now visible in Blue’s Journey.');
  await refreshList();
});
$('unpublish').onclick = () => run(async () => {
  unwrap(await client.rpc('set_journey_published', { album: current.id, visible: false }));
  current.published = false; reviewed = false; renderPhotos();
  message('Returned to private draft. Previously opened photo links may remain available for up to one hour.');
  await refreshList();
});
const mayLeave = () => !dirty || confirm('Leave this album? Changes that have not been saved will be lost.');
$('new').onclick = () => { if (mayLeave()) { reset(); message('Ready for a new tournament.'); } };
$('albums').onchange = () => {
  const id = $('albums').value;
  if (!mayLeave()) { $('albums').value = current?.id || ''; return; }
  if (id) run(() => openAlbum(id)); else reset();
};
$('logout').onclick = () => {
  if (!mayLeave()) return;
  run(async () => { unwrap(await client.auth.signOut({ scope: 'local' })); reset(); $('workspace').hidden = true; $('login').hidden = false; $('code-form').hidden = true; message('Signed out.'); });
};
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
let requestedEmail;
$('email-form').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  try {
    requestedEmail = $('email').value.trim();
    unwrap(await client.auth.signInWithOtp({ email: requestedEmail, options: { shouldCreateUser: false } }));
    $('code-form').hidden = false; $('code').focus(); message('Check your email for the sign-in code. You can request a new code if it expires.');
  } catch { message('Unable to send a code. Check your invited email address or try again shortly.', true); }
  finally { button.disabled = false; }
};
$('code-form').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  try {
    unwrap(await client.auth.verifyOtp({ email: requestedEmail, token: $('code').value.trim(), type: 'email' }));
    await enter();
  } catch { message('Sign-in failed. Check your code, request a new one, or contact the site owner for access.', true); }
  finally { button.disabled = false; }
};
async function enter() {
  const allowed = unwrap(await client.rpc('is_journey_editor'));
  if (!allowed) { await client.auth.signOut({ scope: 'local' }); throw new Error('This account is not invited to manage Blue’s Journey.'); }
  await refreshList(); $('login').hidden = true; $('workspace').hidden = false;
  $('code').value = ''; message('Welcome. Choose an album or create a new tournament.'); controls();
}
async function start() {
  client = await getClient();
  if (!client) { message('The parents’ panel is ready, but sign-in has not been activated yet. Please contact the site owner.'); return; }
  $('login').hidden = false;
  const { session } = unwrap(await client.auth.getSession());
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { $('workspace').hidden = true; $('login').hidden = false; }
  });
  if (session) await enter(); else message('Sign in with your invited email to manage Blue’s Journey.');
}
start().catch(error => message(`Unable to open the panel. ${error.message || 'Please refresh and try again.'}`, true));
