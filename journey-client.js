import { journeyConfig } from './journey-config.js';

export const BUCKET = 'journey-photos';
export function isConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(journeyConfig.supabaseUrl)
    && /^(sb_publishable_|eyJ)/.test(journeyConfig.supabasePublishableKey);
}
let client;
export async function getClient() {
  if (!isConfigured()) return null;
  if (!client) {
    await import('./vendor/supabase.js');
    const { createClient } = globalThis.supabase;
    client = createClient(journeyConfig.supabaseUrl, journeyConfig.supabasePublishableKey, {
      auth: { persistSession: true, storage: sessionStorage, detectSessionInUrl: false }
    });
  }
  return client;
}
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
export function albumCard(album, urls, onOpen) {
  const card = element('article', 'tournament-album');
  const cover = element('div', 'album-cover');
  if (urls.length) {
    const img = element('img', 'journey-cover-image');
    img.src = urls[0]; img.alt = album.title; img.loading = 'lazy';
    cover.append(img);
  }
  cover.append(element('span', 'album-photo-count', `${urls.length} photos`));
  const info = element('div', 'album-info');
  info.append(element('div', 'album-date', formatDate(album.event_date)), element('h3', '', album.title),
    element('p', 'album-location', album.location), element('p', 'album-result', album.result));
  const button = element('button', 'album-open', 'VIEW ALBUM');
  button.type = 'button'; button.disabled = !urls.length;
  button.addEventListener('click', onOpen);
  info.append(button); card.append(cover, info);
  return card;
}
export function showAlbum(title, urls) {
  if (!urls.length) return;
  const dialog = element('dialog', 'journey-dialog');
  dialog.setAttribute('aria-label', title);
  const close = element('button', '', 'Close ×');
  const img = element('img');
  const controls = element('div', 'journey-photo-controls');
  const previous = element('button', '', '← Previous');
  const count = element('span');
  count.setAttribute('aria-live', 'polite');
  const next = element('button', '', 'Next →');
  let index = 0;
  const show = () => { img.src = urls[index]; img.alt = `${title}, photo ${index + 1}`; count.textContent = `${index + 1} / ${urls.length}`; };
  previous.onclick = () => { index = (index + urls.length - 1) % urls.length; show(); };
  next.onclick = () => { index = (index + 1) % urls.length; show(); };
  close.onclick = () => dialog.close();
  dialog.onkeydown = e => { if (e.key === 'ArrowLeft') previous.click(); if (e.key === 'ArrowRight') next.click(); };
  const focused = document.activeElement;
  dialog.onclose = () => { dialog.remove(); focused?.focus(); };
  controls.append(previous, count, next); dialog.append(close, img, controls);
  document.body.append(dialog); show(); dialog.showModal();
}
