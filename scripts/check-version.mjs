// Vérifie que package.json et extension/manifest.json annoncent la même version (npm run check:version).
import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).version;
const pkg = read('package.json');
const manifest = read('extension/manifest.json');
if (pkg !== manifest) {
  console.error(`Versions différentes : package.json ${pkg}, extension/manifest.json ${manifest}`);
  process.exit(1);
}
console.log(`Version ${pkg} : package.json et manifest.json à jour.`);
