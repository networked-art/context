import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const path = new URL('../dist/index.global.js', import.meta.url)
const size = gzipSync(await readFile(path)).byteLength

if (size > 3 * 1024) {
  throw new Error(
    `Global build is ${size} bytes gzipped; the limit is 3072 bytes`,
  )
}

console.log(`@networked-art/context global build: ${size} bytes gzipped`)
