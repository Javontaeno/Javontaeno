// Bundles src/ into one self-contained index.html (three.js inlined), so the game
// runs from GitHub Pages, any static host, or straight off disk via file://.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

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
