import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url),
  out = resolve(import.meta.dirname, '../public/map');
await mkdir(out, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(
    require.resolve('maplibre-gl/dist/' + name),
    resolve(out, name),
  );
}
const world = require('world-atlas/countries-110m.json');
await writeFile(
  resolve(out, 'countries.geojson'),
  JSON.stringify(
    require('topojson-client').feature(world, world.objects.countries),
  ),
);
await copyFile(
  require.resolve('world-atlas/LICENSE'),
  resolve(out, 'atlas-license.txt'),
);
