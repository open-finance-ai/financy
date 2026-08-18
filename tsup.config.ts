import { defineConfig } from 'tsup'

// Two builds, because the executables and the library need different output.
// tsup applies `banner` to every entry in a config, so a single config would
// stamp `#!/usr/bin/env node` onto the library too.
//
// Neither sets `clean`: tsup runs these concurrently, so a clean belonging to
// one can race the other's output and silently drop it from the package. The
// `prebuild` script clears dist once, before either starts.
export default defineConfig([
  {
    entry: ['src/bin.ts', 'src/remote/start.ts'],
    format: ['esm'],
    target: 'node20',
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { lib: 'src/lib.ts' },
    format: ['esm'],
    target: 'node20',
    dts: true,
    clean: false,
  },
])
