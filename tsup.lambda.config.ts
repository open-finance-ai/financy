import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/remote/lambda.ts' },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist-lambda',
  outExtension: () => ({ js: '.mjs' }),
  noExternal: [/./],
  clean: true,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
})
