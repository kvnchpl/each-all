const CONFIG = { maxImageDimension: 200, maxImageRenderDimension: 100, defaultImageQuality: 0.5, seedMax: 1000000 };
const $ = id => document.getElementById(id);
let prompts = [], counts = {}, currentPromptId = '', currentSeed = 0, view = 'scrapbook';
let lastSortKey = 'id', sortDirections = { id: 'ascending', popular: 'descending' };
const cache = new Map(), pending = new Map(), polling = new Set();
let loadVersion = 0, previewURL = '', retryPayload = null, formVersion = 0, sending = false;
let activeDialog = null, returnFocus = null, dragged = false;
const newSeed = () => Math.floor(Math.random() * CONFIG.seedMax);
const parseSeed = value => /^\d+$/.test(value || '') && Number(value) < CONFIG.seedMax ? Number(value) : newSeed();
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(value) { let result = 0; for (const ch of value) result = Math.imul(result, 31) + ch.charCodeAt(0) | 0; return result; }
function status(message) { $('submission-status').textContent = message; }
function showDialog(id) {
  const dialog = $(id);
  if (activeDialog === dialog) return;
  if (activeDialog) activeDialog.classList.remove('visible');
  else returnFocus = document.activeElement;
  activeDialog = dialog;
  dialog.classList.add('visible');
  for (const node of document.body.children) if (node.tagName !== 'SCRIPT') node.inert = node !== dialog;
  document.body.style.overflow = 'hidden';
  ([...dialog.querySelectorAll('button')].find(node => !node.closest('[inert]') && node.getClientRects().length) || dialog).focus();
}
function hideDialog() {
  if (activeDialog) activeDialog.classList.remove('visible');
  activeDialog = null;
  for (const node of document.body.children) node.inert = false;
  document.body.style.overflow = '';
  if (returnFocus?.isConnected) returnFocus.focus(); else $('about-button').focus();
}
function clearPreview() {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = '';
  $('image-preview').hidden = true;
  $('image-preview').removeAttribute('src');
  $('filename-preview').textContent = 'no file selected';
}
function closePrompt(updateHistory = true) {
  loadVersion++;
  currentPromptId = '';
  hideDialog();
  if (updateHistory) {
    const url = new URL(location.href); url.searchParams.delete('prompt'); url.searchParams.delete('seed');
    history.pushState({}, '', url);
  }
  if (!sending) { $('image-input').value = ''; clearPreview(); retryPayload = null; formVersion++; }
}
async function getEntries(id, fresh = false) {
  const res = await fetch(`prompts/${id}.json${fresh ? `?v=${Date.now()}` : ''}`, fresh ? { cache: 'no-store' } : {});
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('Could not load images.');
  const data = await res.json(); if (!Array.isArray(data)) throw new Error('Invalid image list.');
  return data;
}
function combinedEntries(id) {
  const entries = cache.get(id) || [];
  return [...entries, ...(pending.get(id) || []).filter(sub => !entries.some(saved => saved.id === sub.id))];
}
async function openPrompt(id, seed, useCache = false) {
  const prompt = prompts.find(p => p.id === id);
  if (!prompt) { closePrompt(false); $('home-status').textContent = 'That prompt does not exist. Choose a number below.'; return; }
  const changed = currentPromptId !== id;
  currentPromptId = id; currentSeed = parseSeed(String(seed));
  $('prompt-text').textContent = `${id}: ${prompt.prompt}`;
  if (changed && !sending) { status(''); retryPayload = null; }
  showDialog('submission-modal');
  const version = ++loadVersion;
  if (useCache && cache.has(id)) { render(); return; }
  $('submissions-container').textContent = 'loading images…';
  try {
    const entries = await getEntries(id);
    cache.set(id, entries);
    if (version === loadVersion && currentPromptId === id) render();
  } catch {
    if (version !== loadVersion) return;
    $('submissions-container').textContent = '';
    const message = document.createElement('p'); message.textContent = 'Images could not load. Your contributions are safe.';
    const retry = document.createElement('button'); retry.textContent = 'try again'; retry.className = 'interactive-tile';
    retry.onclick = () => openPrompt(id, currentSeed);
    $('submissions-container').append(message, retry);
  }
}
function render() {
  const container = $('submissions-container'); container.replaceChildren(); container.classList.toggle('list-view', view === 'list');
  let entries = combinedEntries(currentPromptId);
  if (!entries.length) { const empty = document.createElement('p'); empty.className = 'no-submissions'; empty.textContent = 'no submissions yet – be the first to add one!'; container.append(empty); return; }
  if (view === 'scrapbook') {
    const groups = new Map();
    for (const sub of entries) { if (!groups.has(sub.username)) groups.set(sub.username, []); groups.get(sub.username).push(sub); }
    entries = [...groups].map(([name, subs]) => {
      const waiting = subs.filter(sub => sub.pending);
      return waiting.at(-1) || subs[Math.floor(rng(currentSeed + hash(name))() * subs.length)];
    });
  }
  if (view === 'list') {
    const shuffle = rng(currentSeed);
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
  }
  const random = rng(currentSeed);
  for (const sub of entries) {
    const wrapper = document.createElement('div'); wrapper.className = 'submission-wrapper';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'image-button';
    button.setAttribute('aria-label', `${sub.username}${sub.caption ? ': ' + sub.caption : ''}${sub.pending ? ' (publishing)' : ''}`);
    button.setAttribute('aria-expanded', String(view === 'list'));
    const img = document.createElement('img'); img.src = sub.imagePath || sub.imageData; img.alt = sub.caption || `Contribution by ${sub.username}`; img.draggable = false;
    img.loading = view === 'list' ? 'lazy' : 'eager';
    const caption = document.createElement('div'); caption.className = 'caption';
    caption.textContent = `${sub.username}${sub.caption ? ': ' + sub.caption : ''}${sub.pending ? ' · publishing…' : ''}`;
    button.append(img); wrapper.append(button, caption); container.append(wrapper);
    if (view === 'scrapbook') {
      wrapper.style.left = `${Math.floor(random() * Math.max(0, container.clientWidth - 100))}px`;
      wrapper.style.top = `${Math.floor(random() * Math.max(0, container.clientHeight - 100))}px`;
      wrapper.style.zIndex = Math.floor(random() * 100);
      caption.classList.add(parseFloat(wrapper.style.left) > container.clientWidth / 2 ? 'caption-right' : 'caption-left');
      button.onclick = event => {
        event.stopPropagation();
        if (dragged) { dragged = false; return; }
        const show = !wrapper.classList.contains('caption-open'); hideCaptions();
        wrapper.classList.toggle('caption-open', show); button.setAttribute('aria-expanded', String(show));
      };
      makeDraggable(wrapper, button);
    }
    if (sub.pending) wrapper.classList.add('is-pending');
  }
}
function hideCaptions() {
  document.querySelectorAll('.caption-open').forEach(node => { node.classList.remove('caption-open'); node.querySelector('button').setAttribute('aria-expanded', 'false'); });
}
function makeDraggable(wrapper, button) {
  let start = null;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragged = false;
    start = { x: event.clientX, y: event.clientY, left: wrapper.offsetLeft, top: wrapper.offsetTop };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 5) dragged = true;
    if (!dragged) return;
    wrapper.style.zIndex = 101;
    const container = $('submissions-container');
    wrapper.style.left = `${Math.max(0, Math.min(container.clientWidth - wrapper.offsetWidth, start.left + dx))}px`;
    wrapper.style.top = `${Math.max(0, Math.min(container.clientHeight - wrapper.offsetHeight, start.top + dy))}px`;
  });
  button.addEventListener('pointerup', () => { start = null; });
  button.addEventListener('pointercancel', () => { start = null; dragged = false; });
}
function renderTiles() {
  const sorted = [...prompts].sort((a, b) => {
    const delta = lastSortKey === 'popular' ? (counts[a.id] || 0) - (counts[b.id] || 0) : a.id.localeCompare(b.id);
    return (sortDirections[lastSortKey] === 'ascending' ? delta : -delta) || a.id.localeCompare(b.id);
  });
  const restoreId = returnFocus?.matches?.('#prompt-grid a') ? returnFocus.textContent : null;
  $('prompt-grid').replaceChildren();
  for (const prompt of sorted) {
    const tile = document.createElement('a'); tile.className = 'interactive-tile'; tile.textContent = prompt.id;
    tile.href = `?prompt=${prompt.id}&seed=${newSeed()}`; tile.setAttribute('aria-label', `${prompt.id}: ${prompt.prompt}`);
    tile.onclick = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); history.pushState({}, '', tile.href); openPrompt(prompt.id, new URL(tile.href).searchParams.get('seed'));
    };
    $('prompt-grid').append(tile);
    if (restoreId === prompt.id) returnFocus = tile;
  }
  for (const key of ['id', 'popular']) {
    const button = $(`sort-${key}-button`); button.setAttribute('aria-pressed', String(lastSortKey === key));
    button.textContent = (key === 'id' ? 'ID' : 'Popular') + (lastSortKey === key ? (sortDirections[key] === 'ascending' ? ' ↑' : ' ↓') : '');
  }
}
async function compress(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be read. Please choose another file.'); }
  const params = new URLSearchParams(location.search);
  const dimension = Math.min(1000, Math.max(1, Number(params.get('maxDim')) || 200));
  const quality = params.has('quality') ? Math.min(1, Math.max(0, Number(params.get('quality')) || 0.5)) : 0.5;
  const scale = Math.min(dimension / bitmap.width, dimension / bitmap.height, 1);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob || blob.size > 200 * 1024) throw new Error('This image is still too large. Try a smaller image.');
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(blob); });
}
async function submit(event) {
  event.preventDefault(); if (sending) return;
  const id = currentPromptId, version = formVersion;
  if (retryPayload?.promptId !== id) retryPayload = null;
  sending = true; for (const input of $('submission-form').querySelectorAll('input')) input.disabled = true; $('submit-button').disabled = true; $('submit-button').textContent = 'uploading…';
  $('submission-form').setAttribute('aria-busy', 'true'); status('Preparing your image…');
  try {
    const username = $('username-input').value.trim();
    if (!username) throw new Error('Please enter a username.');
    if (!retryPayload) retryPayload = { promptId: id, username, caption: $('caption-input').value, seed: currentSeed, submissionId: crypto.randomUUID(), imageData: await compress($('image-input').files[0]) };
    const payload = retryPayload;
    if (currentPromptId === id) status('Uploading your image…');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000);
    let res;
    try { res = await fetch('/.netlify/functions/submitImage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }); } finally { clearTimeout(timeout); }
    let result;
    try { result = await res.json(); } catch { throw new Error('Could not save your image. Please try again; your form has been kept.'); }
    if (!res.ok || !result.success || !result.submission) throw new Error(result.error || 'Could not save your image. Please try again.');
    const local = { ...result.submission, imagePath: undefined, imageData: payload.imageData, pending: true };
    pending.set(id, [...(pending.get(id) || []).filter(sub => sub.id !== local.id), local]);
    counts[id] = result.count; renderTiles();
    if (currentPromptId === id) { render(); status('Thanks for sharing! Your image is saved and appears here while it publishes for everyone.'); }
    if (version === formVersion) { $('image-input').value = ''; $('caption-input').value = ''; clearPreview(); retryPayload = null; }
    pollPublished(id);
  } catch (error) {
    if (currentPromptId === id) status(error.name === 'AbortError' ? 'The upload timed out. Try again; the same submission will not be saved twice.' : error.message || 'Could not upload. Please try again.');
  } finally {
    sending = false; for (const input of $('submission-form').querySelectorAll('input')) input.disabled = false; $('submit-button').disabled = false; $('submit-button').textContent = 'submit'; $('submission-form').setAttribute('aria-busy', 'false');
  }
}
async function pollPublished(id) {
  if (polling.has(id)) return;
  polling.add(id);
  try {
    for (let attempt = 0; attempt < 18 && (pending.get(id) || []).length; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      try {
        const entries = await getEntries(id, true);
        const waiting = (pending.get(id) || []).filter(sub => !entries.some(saved => saved.id === sub.id));
        pending.set(id, waiting); cache.set(id, entries);
        if (currentPromptId === id) { render(); if (!waiting.length) status('Your image is now published. Thanks for sharing!'); }
      } catch { /* Keep the saved local preview until the deployment is available. */ }
    }
    if ((pending.get(id) || []).length && currentPromptId === id) status('Your image is saved. Publishing is taking a little longer; you can check back later.');
  } finally { polling.delete(id); }
}
function syncURL() {
  const url = new URL(location.href), id = url.searchParams.get('prompt');
  if (id) openPrompt(id, url.searchParams.get('seed'), true); else closePrompt(false);
}
document.addEventListener('DOMContentLoaded', async () => {
  const homeStatus = document.createElement('p'); homeStatus.id = 'home-status'; homeStatus.setAttribute('role', 'status'); $('prompt-grid').before(homeStatus);
  let username;
  try { username = localStorage.getItem('eachAllUsername'); } catch {}
  $('username-input').value = username || 'user_' + Math.random().toString(36).slice(2, 10);
  try { localStorage.setItem('eachAllUsername', $('username-input').value); } catch {}
  $('username-input').addEventListener('input', () => { try { localStorage.setItem('eachAllUsername', $('username-input').value); } catch {} });
  $('submission-form').addEventListener('input', () => { retryPayload = null; formVersion++; });
  $('submission-form').addEventListener('submit', submit);
  $('image-input').addEventListener('change', () => {
    clearPreview(); retryPayload = null; formVersion++; status('');
    const file = $('image-input').files[0]; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { status('Choose a JPG, PNG, or WebP smaller than 20 MB.'); $('image-input').value = ''; return; }
    previewURL = URL.createObjectURL(file); $('image-preview').src = previewURL; $('image-preview').hidden = false; $('filename-preview').textContent = file.name;
  });
  $('return-button').onclick = () => closePrompt();
  $('randomize-button').onclick = () => { currentSeed = newSeed(); const url = new URL(location.href); url.searchParams.set('seed', currentSeed); history.pushState({}, '', url); render(); };
  $('view-button').onclick = () => { view = view === 'list' ? 'scrapbook' : 'list'; $('view-button').textContent = view === 'list' ? 'scrapbook view' : 'list view'; $('view-button').setAttribute('aria-pressed', String(view === 'list')); render(); };
  $('toggle-header').onclick = () => { const hidden = $('modal-header').classList.toggle('minimized'); $('modal-header').inert = hidden; $('toggle-header').textContent = hidden ? '↓' : '↑'; $('toggle-header').setAttribute('aria-expanded', String(!hidden)); $('toggle-header').setAttribute('aria-label', hidden ? 'Show submission controls' : 'Hide submission controls'); };
  for (const key of ['id', 'popular']) $(`sort-${key}-button`).onclick = () => {
    sortDirections[key] = lastSortKey === key ? (sortDirections[key] === 'ascending' ? 'descending' : 'ascending') : (key === 'id' ? 'ascending' : 'descending'); lastSortKey = key; renderTiles();
  };
  $('about-button').onclick = () => showDialog('about-modal'); $('about-close').onclick = hideDialog;
  $('about-modal').onclick = event => { if (event.target === $('about-modal')) hideDialog(); };
  document.addEventListener('click', hideCaptions);
  document.addEventListener('keydown', event => {
    if (!activeDialog) return;
    if (event.key === 'Escape') { event.preventDefault(); if (activeDialog.id === 'submission-modal') closePrompt(); else hideDialog(); }
    if (event.key === 'Tab') {
      const nodes = [...activeDialog.querySelectorAll('button, a[href], input, [tabindex="0"]')].filter(node => !node.disabled && !node.closest('[inert]') && node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); activeDialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === activeDialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('popstate', syncURL);
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (innerWidth > 768 && $('modal-header').classList.contains('minimized')) { $('modal-header').classList.remove('minimized'); $('modal-header').inert = false; $('toggle-header').textContent = '↑'; $('toggle-header').setAttribute('aria-expanded', 'true'); $('toggle-header').setAttribute('aria-label', 'Hide submission controls'); } if (currentPromptId && cache.has(currentPromptId)) render(); }, 150); });
  homeStatus.textContent = 'loading prompts…';
  try {
    const res = await fetch('prompts.json'); if (!res.ok) throw new Error(); prompts = await res.json(); renderTiles(); homeStatus.textContent = '';
    const url = new URL(location.href);
    if (url.searchParams.has('prompt')) { const seed = parseSeed(url.searchParams.get('seed')); url.searchParams.set('seed', seed); history.replaceState({}, '', url); await openPrompt(url.searchParams.get('prompt'), seed); }
    else { if (url.searchParams.has('seed')) { url.searchParams.delete('seed'); history.replaceState({}, '', url); } showDialog('about-modal'); }
  } catch { homeStatus.textContent = 'Could not load prompts. Please refresh to try again.'; }
  try { const res = await fetch('counts.json'); if (!res.ok) throw new Error(); counts = { ...await res.json(), ...Object.fromEntries([...pending.keys()].map(id => [id, counts[id]])) }; if (lastSortKey === 'popular') renderTiles(); }
  catch { homeStatus.textContent = 'Submission counts could not load. Refresh to try popularity sorting again.'; $('sort-popular-button').disabled = true; }
});
