import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'dist');

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    background: join(root, 'src/background/service-worker.ts'),
    'content-script': join(root, 'src/content/index.ts'),
    popup: join(root, 'src/popup/popup.ts'),
    options: join(root, 'src/options/options.ts'),
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outdir,
});

await cp(join(root, 'manifest.json'), join(outdir, 'manifest.json'));
await cp(join(root, 'icons'), join(outdir, 'icons'), { recursive: true });
await cp(join(root, 'src/popup/popup.html'), join(outdir, 'popup.html'));
await cp(join(root, 'src/options/options.html'), join(outdir, 'options.html'));

console.log('extension build complete ->', outdir);
