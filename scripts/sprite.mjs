// Builds public/icons.svg (a <symbol> sprite) from lucide-static icons.
// Usage: node scripts/sprite.mjs <path-to-lucide-static/icons>
import { readFileSync, writeFileSync } from 'node:fs';
const ICONS = ['heart', 'thumbs-down', 'message-circle', 'send', 'bookmark', 'clock', 'house', 'library', 'chart-column',
  'circle-user-round', 'mic', 'x', 'plus', 'external-link', 'volume-x', 'volume-2', 'sparkles', 'sprout', 'copy', 'play', 'link', 'pause'];
const dir = process.argv[2];
const symbols = ICONS.map((n) => {
  const svg = readFileSync(`${dir}/${n}.svg`, 'utf8');
  const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s+/g, ' ').trim();
  return `<symbol id="${n}" viewBox="0 0 24 24">${body}</symbol>`;
});
writeFileSync('public/icons.svg', `<!-- Lucide icons (ISC license) -->\n<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`);
console.log(`${ICONS.length} icons`);
