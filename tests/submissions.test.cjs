const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../netlify/functions/node_modules/sharp');
const { validate, prepareImage, saveSubmission, notification, InputError } = require('../netlify/lib/submissions.cjs');
const { handler } = require('../netlify/functions/submitImage');
const repo = { owner: 'test', repo: 'each-all' };
const ids = ['001', '002'];
const sample = { username: ' test ', promptId: '001', caption: 'hi', seed: 123, submissionId: '11111111-1111-4111-8111-111111111111', imageData: 'data:image/jpeg;base64,/9j/2Q==' };
function github({ conflicts = 0, permanentFailure = false } = {}) {
  let head = 'initial', serial = 0, updates = 0;
  const commits = new Map([['initial', { files: { 'prompts.json': JSON.stringify(ids.map(id => ({ id }))), 'counts.json': '{}' } }]]);
  const trees = new Map();
  const api = {
    repos: { getContent: async ({ path, ref }) => {
      const content = commits.get(ref).files[path];
      if (content === undefined) throw Object.assign(new Error('Not found'), { status: 404 });
      return { data: { type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64') } };
    } },
    git: {
      createBlob: async () => ({ data: { sha: 'image' } }),
      getRef: async () => ({ data: { object: { sha: head } } }),
      getCommit: async ({ commit_sha }) => ({ data: { tree: { sha: commit_sha } } }),
      createTree: async ({ base_tree, tree }) => {
        const sha = 'tree-' + ++serial, files = { ...commits.get(base_tree).files };
        for (const entry of tree) files[entry.path] = entry.content || entry.sha;
        trees.set(sha, files); return { data: { sha } };
      },
      createCommit: async ({ tree, parents }) => {
        const sha = 'commit-' + ++serial; commits.set(sha, { files: trees.get(tree), parent: parents[0] }); return { data: { sha } };
      },
      updateRef: async ({ sha, force }) => {
        assert.equal(force, false); updates++;
        if (permanentFailure || conflicts-- > 0) {
          // An unrelated writer changes the other prompt and count while we save.
          const files = { ...commits.get(head).files, 'counts.json': JSON.stringify({ '002': 1 }), 'prompts/002.json': '[{"id":"other"}]' };
          head = 'external-' + ++serial; commits.set(head, { files });
          throw Object.assign(new Error('Conflict'), { status: 422 });
        }
        if (commits.get(sha).parent !== head) throw Object.assign(new Error('Stale parent'), { status: 422 });
        head = sha;
      }
    }
  };
  return { api, files: () => commits.get(head).files, updates: () => updates };
}
test('validates path, text, seed, base64, identifier, and size before writing', () => {
  assert.equal(validate(sample, ids).username, 'test');
  for (const changes of [ { promptId: '../secrets' }, { username: ' ' }, { username: 'x'.repeat(81) }, { caption: [] }, { caption: 'x'.repeat(501) }, { seed: '123' }, { seed: -1 }, { seed: 1000000 }, { submissionId: '../bad' }, { imageData: 'data:image/svg+xml;base64,AAAA' }, { imageData: 'data:image/jpeg;base64,AAAA' }, { imageData: 'data:image/jpeg;base64,' + Buffer.alloc(205 * 1024, 255).toString('base64') } ]) {
    assert.throws(() => validate({ ...sample, ...changes }, ids), InputError);
  }
});
test('saves image, metadata and counts atomically, preserving a concurrent change', async () => {
  const mock = github({ conflicts: 1 }), input = validate(sample, ids);
  const result = await saveSubmission(mock.api, repo, 'main', input, input.bytes);
  assert.equal(mock.updates(), 2);
  const files = mock.files();
  assert.deepEqual(JSON.parse(files['counts.json']), { '001': 1, '002': 1 });
  assert.equal(JSON.parse(files['prompts/001.json'])[0].id, input.id);
  assert.equal(files[result.entry.imagePath], 'image');
  assert.equal(files['prompts/002.json'], '[{"id":"other"}]');
});
test('parallel submissions survive without dropping either image or count', async () => {
  const mock = github(), one = validate(sample, ids), two = validate({ ...sample, submissionId: '22222222-2222-4222-8222-222222222222' }, ids);
  await Promise.all([saveSubmission(mock.api, repo, 'main', one, one.bytes), saveSubmission(mock.api, repo, 'main', two, two.bytes)]);
  assert.equal(JSON.parse(mock.files()['prompts/001.json']).length, 2);
  assert.equal(JSON.parse(mock.files()['counts.json'])['001'], 2);
});
test('a retried request does not duplicate a saved submission', async () => {
  const mock = github(), input = validate(sample, ids);
  await saveSubmission(mock.api, repo, 'main', input, input.bytes);
  const result = await saveSubmission(mock.api, repo, 'main', input, input.bytes);
  assert.equal(result.duplicate, true); assert.equal(result.count, 1); assert.equal(mock.updates(), 1);
});
test('persistent conflicts stop after five attempts and never overwrite head', async () => {
  const mock = github({ permanentFailure: true }), input = validate(sample, ids);
  await assert.rejects(saveSubmission(mock.api, repo, 'main', input, input.bytes));
  assert.equal(mock.updates(), 5); assert.equal(mock.files()['prompts/001.json'], undefined);
});
test('email escapes contributor text and attaches bytes without a deployed URL', () => {
  const entry = { id: 'test', imagePath: 'images/001/test.jpg', username: '<script>x</script>', caption: '"<&', seed: 1 };
  const email = notification(entry, Buffer.from('image'), { NOTIFY_EMAIL: 'example@example.com' });
  assert.ok(!email.html.includes('<script>')); assert.ok(email.html.includes('&lt;script&gt;'));
  assert.ok(email.html.includes('&quot;&lt;&amp;')); assert.equal(email.attachments[0].content, Buffer.from('image').toString('base64'));
});
test('HTTP rejections always return readable JSON without needing credentials', async () => {
  for (const [event, expected] of [[{ httpMethod: 'GET' }, 405], [{ httpMethod: 'POST', body: '{' }, 400], [{ httpMethod: 'POST', body: 'x'.repeat(310 * 1024) }, 413]]) {
    const res = await handler(event); assert.equal(res.statusCode, expected); assert.equal(typeof JSON.parse(res.body).error, 'string');
  }
});
test('every migrated asset decodes and public counts match metadata', async () => {
  const counts = JSON.parse(fs.readFileSync('counts.json'));
  for (const { id } of JSON.parse(fs.readFileSync('prompts.json'))) {
    const entries = JSON.parse(fs.readFileSync(`prompts/${id}.json`)); assert.equal(counts[id], entries.length);
    for (const entry of entries) {
      assert.equal(entry.imageData, undefined); assert.ok(entry.id); assert.ok(entry.imagePath.startsWith(`images/${id}/`));
      const metadata = await sharp(fs.readFileSync(path.join(process.cwd(), entry.imagePath))).metadata();
      assert.ok(metadata.width > 0 && metadata.height > 0);
    }
  }
});

test('fully decodes images, rejects damaged or oversized images, and strips metadata', async () => {
  const original = await sharp({ create: { width: 50, height: 40, channels: 3, background: 'blue' } }).withMetadata().jpeg().toBuffer();
  const cleaned = await prepareImage(original, sharp);
  const metadata = await sharp(cleaned).metadata();
  assert.equal(metadata.width, 50); assert.equal(metadata.height, 40); assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  await assert.rejects(prepareImage(Buffer.from([255, 216, 255, 217]), sharp), InputError);
  const oversized = await sharp({ create: { width: 1001, height: 20, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  await assert.rejects(prepareImage(oversized, sharp), InputError);
  const disguisedPNG = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'blue' } }).png().toBuffer();
  await assert.rejects(prepareImage(disguisedPNG, sharp), InputError);
});
