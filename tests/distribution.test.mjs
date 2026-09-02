import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

test('ESM distribution exports the public SDK', async () => {
  const sdk = await import('../dist/index.js')
  assert.equal(typeof sdk.load, 'function')
  assert.equal(typeof sdk.watch, 'function')
  assert.equal(typeof sdk.toQuery, 'function')
})

test('IIFE distribution exposes the NetworkedArt browser namespace', async () => {
  const source = await readFile(
    new URL('../dist/index.global.js', import.meta.url),
    'utf8',
  )
  const sandbox = {
    URLSearchParams,
    AbortController,
    CustomEvent,
    setTimeout,
    clearTimeout,
  }
  vm.runInNewContext(source, sandbox)
  assert.equal(typeof sandbox.NetworkedArt.load, 'function')
  assert.equal(typeof sandbox.NetworkedArt.watch, 'function')
  assert.equal(typeof sandbox.NetworkedArt.toQuery, 'function')
})

test('TypeScript declarations are included', async () => {
  const declarations = await readFile(
    new URL('../dist/index.d.ts', import.meta.url),
    'utf8',
  )
  assert.match(declarations, /NETWORKED_CONTEXT/)
  assert.match(declarations, /declare function load/)
  assert.match(declarations, /declare function watch/)
  assert.match(declarations, /declare function toQuery/)
})
