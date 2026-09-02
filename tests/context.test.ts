import assert from 'node:assert/strict'
import test from 'node:test'
import {
  load,
  toQuery,
  watch,
  type ContextValues,
  type NetworkedContext,
} from '../src/index.js'

const COLLECTION = '0x00000000000000000000000000000000000000a1'
const PATRON = '0x00000000000000000000000000000000000000a2'
const BIDDER = '0x00000000000000000000000000000000000000a3'
const VALUES: ContextValues = {
  patronCount: 12,
  lastPatron: PATRON,
  highestBidder: BIDDER,
  highestBid: 125,
  bidCount: 4,
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setLocation(search: string) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search },
  })
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'location', descriptor)
    else delete (globalThis as { location?: unknown }).location
  }
}

test('loads API context from explicit mainnet identity and publishes it globally', async () => {
  let requestedUrl = ''
  let credentials: RequestCredentials | undefined
  const context = await load({
    collection: COLLECTION.toUpperCase(),
    tokenId: '007',
    apiBaseUrl: 'https://context.test/',
    fetch: (async (input, init) => {
      requestedUrl = String(input)
      credentials = init?.credentials
      return response(VALUES)
    }) as typeof fetch,
  })

  assert.equal(requestedUrl, `https://context.test/context/v1/${COLLECTION}/7`)
  assert.equal(credentials, 'omit')
  assert.deepEqual(context, {
    collection: COLLECTION,
    tokenId: '7',
    ...VALUES,
    available: true,
    source: 'api',
  })
  assert.equal(globalThis.NETWORKED_CONTEXT, context)
  assert.ok(Object.isFrozen(context))
})

test('explicit fixed context wins without fetching', async () => {
  let fetched = false
  const context = await load({
    collection: COLLECTION,
    tokenId: 7,
    fixed: VALUES,
    fetch: (async () => {
      fetched = true
      return response({})
    }) as typeof fetch,
  })

  assert.equal(fetched, false)
  assert.equal(context.source, 'fixed')
  assert.equal(context.available, true)
  assert.equal(context.highestBid, 125)
})

test('loads a complete fixed URL snapshot and treats empty addresses as null', async () => {
  const restore = setLocation(
    `?networked_collection=${COLLECTION}&networked_token_id=7&networked_mode=fixed` +
      '&networked_patron_count=3&networked_last_patron=' +
      '&networked_highest_bidder=&networked_highest_bid=9&networked_bid_count=2',
  )

  try {
    const context = await load()
    assert.deepEqual(context, {
      collection: COLLECTION,
      tokenId: '7',
      patronCount: 3,
      lastPatron: null,
      highestBidder: null,
      highestBid: 9,
      bidCount: 2,
      available: true,
      source: 'fixed',
    })
  } finally {
    restore()
  }
})

test('an incomplete fixed snapshot fails atomically instead of mixing API data', async () => {
  const restore = setLocation(`?networked_mode=fixed&networked_patron_count=3`)
  let fetched = false
  let error = ''

  try {
    const context = await load({
      collection: COLLECTION,
      tokenId: 7,
      fallback: { highestBid: 2 },
      fetch: (async () => {
        fetched = true
        return response(VALUES)
      }) as typeof fetch,
      onError: (value) => {
        error = value.message
      },
    })

    assert.equal(fetched, false)
    assert.equal(context.source, 'fallback')
    assert.equal(context.available, false)
    assert.equal(context.patronCount, 0)
    assert.equal(context.highestBid, 2)
    assert.match(error, /Missing/)
  } finally {
    restore()
  }
})

test('serializes identity-only and complete fixed query strings without a chain id', () => {
  const context: NetworkedContext = {
    collection: COLLECTION,
    tokenId: '7',
    ...VALUES,
    available: true,
    source: 'api',
  }

  const fixed = new URLSearchParams(toQuery(context).slice(1))
  assert.equal(fixed.get('networked_mode'), 'fixed')
  assert.equal(fixed.get('networked_patron_count'), '12')
  assert.equal(fixed.get('networked_last_patron'), PATRON)
  assert.equal(fixed.get('networked_highest_bidder'), BIDDER)
  assert.equal(fixed.get('networked_highest_bid'), '125')
  assert.equal(fixed.get('networked_bid_count'), '4')
  assert.equal(
    [...fixed.keys()].some((key) => key.includes('chain')),
    false,
  )

  const identity = new URLSearchParams(
    toQuery(context, { fixed: false }).slice(1),
  )
  assert.deepEqual(
    [...identity.keys()],
    ['networked_collection', 'networked_token_id'],
  )
})

test('watch marks the last good API context stale during an outage', async () => {
  let calls = 0
  let stop = () => {}

  const stale = new Promise<NetworkedContext>((resolve) => {
    stop = watch(
      {
        collection: COLLECTION,
        tokenId: 7,
        intervalMs: 250,
        fetch: (async () => {
          calls += 1
          if (calls === 1) return response(VALUES)
          throw new Error('offline')
        }) as typeof fetch,
      },
      (context) => {
        if (context.source === 'stale') resolve(context)
      },
    )
  })

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const context = await Promise.race([
      stale,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('watch timeout')),
          2_000,
        )
      }),
    ])
    assert.equal(context.available, false)
    assert.equal(context.highestBid, 125)
    assert.equal(context.bidCount, 4)
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
    stop()
  }
})
