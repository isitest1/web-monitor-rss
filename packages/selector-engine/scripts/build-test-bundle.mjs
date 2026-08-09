// Bundles the selector engine into a single browser-loadable script so
// Playwright e2e tests can inject it into a real page via addScriptTag and
// exercise it against actual DOM elements (page.evaluate cannot serialize
// closures over imported modules, so a plain function reference is not
// enough here).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(packageRoot, 'src/index.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'SelectorEngine',
  platform: 'browser',
  outfile: join(packageRoot, '.tmp/selector-engine.bundle.js'),
});

console.log('built selector-engine test bundle');
