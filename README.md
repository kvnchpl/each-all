# EACH ALL

A collective image-sharing project: contributors respond to open-ended prompts with images and optional captions. The default board scatters one image per username; list view shows every contribution.

Live site: https://each-all.netlify.app

## Storage and publishing

- `prompts.json` defines the available prompts.
- `prompts/<id>.json` contains submission metadata: ID, username, caption, timestamp, layout seed, and relative `imagePath`.
- `images/<id>/` holds image files. Existing images were extracted losslessly; new uploads are decoded and re-encoded as JPEGs without embedded metadata.
- `counts.json` contains submission totals, so popularity sorting never downloads image boards.

The Netlify submission function uses GitHub's Git database API to commit an image, its prompt metadata, and updated counts together. Non-forced branch updates retry conflicts against the latest commit, preserving concurrent submissions. UUID submission identifiers prevent duplicate saves when retrying an uncertain upload. Notifications are sent through Resend only after saving, using the uploaded image bytes as the attachment; email delivery failure does not reject a saved contribution.

Netlify must deploy the same repository and branch that the function writes to. Each submission triggers the connected deployment. The submitting visitor sees a local preview marked “publishing” immediately after saving; the page checks every 10 seconds for up to three minutes for the published entry. Until then, everyone else sees the previous deployment. The local pending preview lasts for that page session.

## Development

```sh
npm install
npm install --prefix netlify/functions
npm test
npm run build
```

Serve `dist/` with a static server for browsing, or use Netlify Dev to run the submission endpoint locally. `npm test` covers validation, concurrent commits, retries, notification escaping, HTTP error responses, and migrated asset/count integrity. Netlify's build command creates `dist/` containing only public files, leaving function sources and local configuration outside the published directory. Counts are also regenerated during each build.

The repeatable `npm run migrate:images` command extracts any legacy base64 image entries into files, preserves all contributor metadata, and regenerates the checked-in counts file. The frontend can also read legacy `imageData` entries during transition.

## Netlify environment

Required: `GITHUB_TOKEN`, `GITHUB_USER`, `REPO_NAME`. The token needs repository Contents read/write access. Optional `GITHUB_BRANCH` selects the publishing branch; otherwise the repository's default branch is used.

For notifications: `RESEND_API_KEY`, `NOTIFY_EMAIL`, and optionally `FROM_EMAIL` and `SITE_URL`. Use a verified Resend sender. No credentials belong in client code.

Uploads accept JPG, PNG, or WebP up to 20 MB in the browser, normally shrink to 200 pixels, and reach the server as JPEGs. The server independently enforces a 300 KB request limit, a 200 KB image limit, a maximum 1000 × 1000 resolution, existing prompt IDs, usernames up to 80 characters, and captions up to 500 characters. URL overrides `quality` and `maxDim` remain supported within those limits.

Created by [Kevin Cunanan Chappelle](https://kvnchpl.com).
