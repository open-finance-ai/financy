import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/bin.ts', 'src/remote/start.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
