// Builds minutes.json from the PDFs in the minutes folder.
// File names look like:  2026-09-01.pdf   or   2026-09-01_Annual-Parish-Meeting.pdf
// Usage: node scripts/build-index.mjs [minutesDir] [outputFile]
import { readdirSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] || 'minutes';
const out = process.argv[3] || 'minutes.json';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nice = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${months[m - 1]} ${y}`;
};

const list = [];
for (const file of readdirSync(dir)) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:_(.+))?\.pdf$/i.exec(file);
  if (!match) continue; // ignore anything that doesn't follow the naming pattern
  const [, date, rest] = match;
  const title = rest ? rest.replace(/-/g, ' ').trim() : `Minutes of meeting – ${nice(date)}`;
  list.push({ date, title, file });
}
list.sort((a, b) => b.date.localeCompare(a.date) || a.file.localeCompare(b.file));
writeFileSync(out, JSON.stringify(list, null, 2));
console.log(`Wrote ${list.length} minute(s) to ${out}`);
