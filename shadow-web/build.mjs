// Bundles src/ into one self-contained index.html (three.js inlined), so the game
// runs from GitHub Pages, any static host, or straight off disk via file://.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dev = process.argv.includes('--dev');

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = readFileSync('src/index.html', 'utf8');
const html = template.replace('<!--BUNDLE-->', () => `<script>${js}</script>`);
writeFileSync('index.html', html);
console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB${dev ? ', dev' : ''})`);

// Personal build: also embed any rigged models in the git-ignored private/ folder (see src/custom.js).
// It writes index.personal.html, which is git-ignored too, so these models never reach the public repo.
if (existsSync('private')) {
  const models = readdirSync('private').filter((f) => f.endsWith('.glb'));
  if (models.length) {
    const data = models.map((f) => ({ name: f, data: readFileSync(join('private', f)).toString('base64') }));
    const inject = `<script>window.__SW_MODELS=${JSON.stringify(data)};</script>`;
    const personal = template.replace('<!--BUNDLE-->', () => `${inject}<script>${js}</script>`);
    writeFileSync('index.personal.html', personal);
    console.log(`index.personal.html written (${(personal.length / 1024 / 1024).toFixed(1)} MB, ${models.join(', ')})`);
  }
}
