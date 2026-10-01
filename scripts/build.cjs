const fs = require('node:fs');
// Publish only public assets, never function sources or local configuration.
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist', { recursive: true });
for (const name of ['index.html', 'style.css', 'script.js', 'prompts.json', 'favicon.ico', 'og-image.jpg', 'prompts', 'images']) {
  fs.cpSync(name, `dist/${name}`, { recursive: true });
}
const counts = Object.fromEntries(JSON.parse(fs.readFileSync('prompts.json')).map(({ id }) => {
  const path = `prompts/${id}.json`;
  return [id, fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)).length : 0];
}));
fs.writeFileSync('dist/counts.json', JSON.stringify(counts));
