const { validate, prepareImage, readJSON, saveSubmission, notification, InputError } = require('../lib/submissions.cjs');
const response = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { ...response(405, { error: 'Use POST to submit an image.' }), headers: { 'Content-Type': 'application/json', Allow: 'POST' } };
  if (!event.body || Buffer.byteLength(event.body) > 300 * 1024 || event.isBase64Encoded) return response(413, { error: 'The submission is too large or has an unsupported encoding.' });
  let body;
  try { body = JSON.parse(event.body); } catch { return response(400, { error: 'Malformed JSON.' }); }
  const env = process.env;
  if (!env.GITHUB_TOKEN || !env.GITHUB_USER || !env.REPO_NAME) return response(500, { error: 'Submissions are temporarily unavailable.' });
  try {
    const { Octokit } = await import('@octokit/rest');
    const api = new Octokit({ auth: env.GITHUB_TOKEN, request: { timeout: 10000 } });
    const repo = { owner: env.GITHUB_USER, repo: env.REPO_NAME };
    const branch = env.GITHUB_BRANCH || (await api.repos.get(repo)).data.default_branch;
    const prompts = await readJSON(api, repo, 'prompts.json', branch);
    const input = validate(body, prompts.map(p => p.id));
    const sharp = require('sharp');
    const bytes = await prepareImage(input.bytes, sharp);
    const saved = await saveSubmission(api, repo, branch, input, bytes);
    // Notify only after a successful commit; email failure never rejects a saved image.
    if (!saved.duplicate && (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL)) {
      console.error(!env.RESEND_API_KEY ? 'RESEND_API_KEY is missing.' : 'NOTIFY_EMAIL is missing.');
    }
    if (!saved.duplicate && env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
      try {
        const { Resend } = await import('resend');
        const result = await new Resend(env.RESEND_API_KEY).emails.send(notification(saved.entry, bytes, env));
        if (result.error) console.error('Submission notification failed:', result.error.name);
        else console.log('Submission notification sent:', result.data?.id);
      } catch { console.error('Submission notification failed.'); }
    }
    return response(200, { success: true, submission: saved.entry, count: saved.count });
  } catch (error) {
    if (error instanceof InputError) return response(400, { error: error.message });
    console.error('Submission save failed:', error.status || error.name);
    return response(503, { error: 'Could not save your image just yet. Please try again; your form has been kept.' });
  }
};
