const { randomUUID } = require('node:crypto');
const MAX_IMAGE_BYTES = 200 * 1024;
class InputError extends Error {}
function validate(body, promptIds) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid submission.');
  const { username, promptId, imageData, caption = '', seed, submissionId } = body;
  if (typeof username !== 'string' || !username.trim() || username.length > 80) throw new InputError('Use a username of 1–80 characters.');
  if (typeof caption !== 'string' || caption.length > 500) throw new InputError('Captions can contain up to 500 characters.');
  if (typeof promptId !== 'string' || !promptIds.includes(promptId)) throw new InputError('Choose an existing prompt.');
  if (!Number.isInteger(seed) || seed < 0 || seed >= 1000000) throw new InputError('Invalid layout seed.');
  if (submissionId !== undefined && (typeof submissionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId))) throw new InputError('Invalid submission identifier.');
  const match = typeof imageData === 'string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageData);
  if (!match) throw new InputError('Upload a valid JPEG image.');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES || bytes.length < 4 || bytes.toString('base64') !== match[1] || bytes[0] !== 255 || bytes[1] !== 216) throw new InputError('The image is invalid or exceeds 200 KB.');
  return { username: username.trim(), promptId, caption: caption.trim(), seed, id: submissionId || randomUUID(), bytes };
}
async function prepareImage(bytes, sharp) {
  try {
    const image = sharp(bytes, { limitInputPixels: 1000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== 'jpeg' || metadata.width > 1000 || metadata.height > 1000) throw new Error('Invalid image');
    const result = await image.rotate().jpeg({ quality: 80 }).toBuffer();
    if (result.length > MAX_IMAGE_BYTES) throw new Error('Image too large');
    return result;
  } catch { throw new InputError('The image could not be read. Choose a JPEG, PNG, or WebP and try again.'); }
}
async function readJSON(api, repo, path, ref, fallback) {
  try {
    const { data } = await api.repos.getContent({ ...repo, path, ref });
    if (Array.isArray(data) || data.type !== 'file' || data.encoding !== 'base64') throw new Error('Invalid repository data');
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  } catch (error) {
    if (error.status === 404 && fallback !== undefined) return fallback;
    throw error;
  }
}
// All public files change together; non-forced ref updates prevent lost concurrent writes.
async function saveSubmission(api, repo, branch, input, imageBytes) {
  const imagePath = `images/${input.promptId}/${input.id}.jpg`;
  const entry = { id: input.id, username: input.username, caption: input.caption, seed: input.seed, timestamp: new Date().toISOString(), imagePath };
  const { data: imageBlob } = await api.git.createBlob({ ...repo, content: imageBytes.toString('base64'), encoding: 'base64' });
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: ref } = await api.git.getRef({ ...repo, ref: `heads/${branch}` });
    const head = ref.object.sha;
    const { data: commit } = await api.git.getCommit({ ...repo, commit_sha: head });
    const [prompts, submissions, counts] = await Promise.all([
      readJSON(api, repo, 'prompts.json', head),
      readJSON(api, repo, `prompts/${input.promptId}.json`, head, []),
      readJSON(api, repo, 'counts.json', head, {})
    ]);
    if (!prompts.some(p => p.id === input.promptId)) throw new InputError('This prompt is no longer available.');
    if (!Array.isArray(submissions) || !counts || typeof counts !== 'object' || Array.isArray(counts)) throw new Error('Invalid submission data');
    const existing = submissions.find(sub => sub.id === input.id);
    if (existing) return { entry: existing, count: submissions.length, duplicate: true };
    submissions.push(entry);
    counts[input.promptId] = submissions.length;
    const { data: tree } = await api.git.createTree({ ...repo, base_tree: commit.tree.sha, tree: [
      { path: imagePath, mode: '100644', type: 'blob', sha: imageBlob.sha },
      { path: `prompts/${input.promptId}.json`, mode: '100644', type: 'blob', content: JSON.stringify(submissions, null, 2) + '\n' },
      { path: 'counts.json', mode: '100644', type: 'blob', content: JSON.stringify(counts, null, 2) + '\n' }
    ] });
    const { data: nextCommit } = await api.git.createCommit({ ...repo, message: `Add image to prompt ${input.promptId}`, tree: tree.sha, parents: [head] });
    try {
      await api.git.updateRef({ ...repo, ref: `heads/${branch}`, sha: nextCommit.sha, force: false });
      return { entry, count: submissions.length, duplicate: false };
    } catch (error) {
      if (![409, 422].includes(error.status) || attempt === 4) throw error;
    }
  }
}
const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function notification(entry, bytes, env) {
  const url = new URL(env.SITE_URL || 'https://each-all.netlify.app');
  url.searchParams.set('prompt', entry.imagePath.split('/')[1]);
  url.searchParams.set('seed', entry.seed);
  return {
    from: env.FROM_EMAIL || 'no-reply@resend.dev', to: env.NOTIFY_EMAIL,
    subject: `EACH ALL: new submission to prompt ${entry.imagePath.split('/')[1]}`,
    html: `<p><strong>${escapeHTML(entry.username)}</strong> submitted an image to <a href="${escapeHTML(url.href)}">EACH ALL</a>.</p>${entry.caption ? `<p>caption: ${escapeHTML(entry.caption)}</p>` : ''}<p>submitted on: ${escapeHTML(entry.timestamp)}</p>`,
    attachments: [{ filename: `${entry.id}.jpg`, content: bytes.toString('base64') }]
  };
}
module.exports = { validate, prepareImage, readJSON, saveSubmission, notification, InputError };
