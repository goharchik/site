// Сборка: node viewer/build.mjs  →  viewer/index.html (один файл, без интернета)
// Нужны пакеты: npm i esbuild three
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const res = await build({
  entryPoints: [join(here, 'src/app.js')],
  bundle: true, minify: true, format: 'esm', target: 'es2020', write: false, legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(join(here, 'src/template.html'), 'utf8')
  .replace('<!--APP-->', () => `<script type="module">${js}</script>`);
writeFileSync(join(here, 'index.html'), html);
console.log(`viewer/index.html: ${(html.length / 1024).toFixed(0)} КБ`);
