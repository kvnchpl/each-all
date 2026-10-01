// Lossless, repeatable conversion: keep metadata and write exact decoded bytes.
const fs = require('node:fs');
const crypto = require('node:crypto');
const prompts = JSON.parse(fs.readFileSync('prompts.json'));
const counts = {};
for (const { id } of prompts) {
  const path = `prompts/${id}.json`;
  const entries = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : [];
  entries.forEach((entry, index) => {
    if (!entry.imageData) return;
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(entry.imageData);
    if (!match) throw new Error(`Unsupported image: ${id}/${index}`);
    const bytes = Buffer.from(match[2], 'base64');
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const imagePath = `images/${id}/${hash}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    fs.mkdirSync(`images/${id}`, { recursive: true });
    fs.writeFileSync(imagePath, bytes);
    entry.id = entry.id || `legacy-${id}-${index}`;
    entry.imagePath = imagePath;
    delete entry.imageData;
  });
  if (fs.existsSync(path)) fs.writeFileSync(path, JSON.stringify(entries, null, 2) + '\n');
  counts[id] = entries.length;
}
fs.writeFileSync('counts.json', JSON.stringify(counts, null, 2) + '\n');
