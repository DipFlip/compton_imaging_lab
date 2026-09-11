import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
for (const file of ['app.js', 'acquisition.js', 'physics.js', 'transport.js', 'worker.js', 'sweep-worker.js', 'room-view.js', 'style.css', 'assets']) {
  await cp(new URL(file, root), new URL(file, out), {recursive: true});
}
const html = await readFile(new URL('index.html', root), 'utf8');
await writeFile(new URL('index.html', out), html.replaceAll('./node_modules/three/', './vendor/three/'));
for (const file of ['build', 'examples/jsm', 'LICENSE']) {
  const target = new URL(`vendor/three/${file}`, out);
  await mkdir(new URL('./', target), {recursive: true});
  await cp(new URL(`node_modules/three/${file}`, root), target, {recursive: true});
}
console.log('Built standalone static app in dist/');
