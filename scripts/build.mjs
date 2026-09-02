import { rm } from 'node:fs/promises'
import { build } from 'esbuild'

await rm(new URL('../dist/index.js', import.meta.url), { force: true })
await rm(new URL('../dist/index.global.js', import.meta.url), { force: true })

const shared = {
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname],
  bundle: true,
  minify: true,
  platform: 'browser',
  target: ['es2020'],
  legalComments: 'none',
}

await Promise.all([
  build({
    ...shared,
    format: 'esm',
    outfile: new URL('../dist/index.js', import.meta.url).pathname,
  }),
  build({
    ...shared,
    format: 'iife',
    globalName: 'NetworkedArt',
    outfile: new URL('../dist/index.global.js', import.meta.url).pathname,
  }),
])
