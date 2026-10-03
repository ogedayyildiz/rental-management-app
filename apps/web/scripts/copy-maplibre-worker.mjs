// MapLibre GL 6 runs tile parsing in a module worker that it loads from a URL
// next to its own bundle. Next.js does not emit those files, so we serve them
// from public/ and point MapLibre at them (see src/components/machine-map.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json")) + "/dist";
const out = join(import.meta.dirname, "..", "public", "maplibre");

mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, file), join(out, file));
}
