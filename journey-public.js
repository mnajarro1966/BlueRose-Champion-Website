import { getClient, unwrap, BUCKET, albumCard, showAlbum } from './journey-client.js';

async function loadPublished() {
  const grid = document.querySelector('#competition-albums .tournament-album-grid');
  if (!grid) return;
  const client = await getClient();
  if (!client) return; // Existing milestone cards remain available before activation.
  const albums = unwrap(await client.from('journey_albums').select('id,title,event_date,location,result,journey_photos(path,position)').eq('published', true).order('event_date', { ascending: false }));
  for (const album of albums) {
    const paths = album.journey_photos.sort((a, b) => a.position - b.position).map(photo => photo.path);
    if (!paths.length) continue;
    const signed = unwrap(await client.storage.from(BUCKET).createSignedUrls(paths, 3600));
    const urls = signed.filter(item => !item.error && item.signedUrl).map(item => item.signedUrl);
    if (urls.length !== paths.length) throw new Error('Some album photos are unavailable.');
    grid.append(albumCard(album, urls, async () => {
      try {
        // Refresh on every open, including tabs left open beyond URL expiry.
        const fresh = unwrap(await client.storage.from(BUCKET).createSignedUrls(paths, 3600));
        if (fresh.some(item => item.error || !item.signedUrl)) throw new Error('Photo unavailable');
        showAlbum(album.title, fresh.map(item => item.signedUrl));
      } catch { alert('This album is temporarily unavailable. Please try again.'); }
    }));
  }
}
loadPublished().catch(() => {
  const section = document.querySelector('#competition-albums');
  if (!section) return;
  const message = document.createElement('p');
  message.className = 'journey-load-note';
  message.textContent = 'New albums are temporarily unavailable. Please refresh to try again.';
  section.append(message);
});
