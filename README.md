# @networked-art/context

A tiny, dependency-free browser SDK that gives interactive artwork live Networked Art patron and auction state. It works anywhere the artwork can make a cross-origin request, including marketplace `animation_url` embeds. Ethereum mainnet is implicit; no chain ID is required or encoded.

The current value is returned from `load`, passed to `watch` listeners, and published as `globalThis.NETWORKED_CONTEXT`:

```js
{
  collection: '0x…',
  tokenId: '7',
  patronCount: 12,
  lastPatron: '0x…',
  highestBidder: '0x…',
  highestBid: 125,
  bidCount: 4,
  available: true,
  source: 'api' // 'api' | 'fixed' | 'fallback' | 'stale'
}
```

`highestBid` is a whole USD amount. Addresses are lowercase. Missing addresses are `null`, and missing counts or amounts are zero.

## Plain browser usage

Pin a version in permanent artwork. For strict CSP or long-term archival reliability, vendor `index.global.js` with the artwork instead of relying on a CDN.

```html
<script src="https://cdn.jsdelivr.net/npm/@networked-art/context@0.1.0/dist/index.global.js"></script>
<script>
  NetworkedArt.load({
    collection: '0x0000000000000000000000000000000000000000',
    tokenId: '7',
  }).then((context) => {
    console.log(context.patronCount)
  })
</script>
```

The same identity can be provided by the artwork URL:

```text
?networked_collection=0x…&networked_token_id=7
```

## p5.js

```js
let context

function setup() {
  createCanvas(windowWidth, windowHeight)
  NetworkedArt.watch({}, (next) => {
    context = next
  })
}

function draw() {
  background(context?.patronCount ?? 0)
}
```

## Three.js / ES modules

```js
import { watch } from '@networked-art/context'

const stop = watch({ collection: '0x…', tokenId: '7' }, (context) => {
  mesh.scale.setScalar(1 + context.bidCount / 10)
})

// Call when the artwork is torn down.
stop()
```

`watch` refreshes every 10 seconds by default, refreshes when a hidden document becomes visible, and preserves the last good values with `source: 'stale'` if the API becomes unavailable. Set `intervalMs: 0` for a single load.

## Fallback and fixed state

Artwork should remain renderable without the API:

```js
await NetworkedArt.load({
  collection: '0x…',
  tokenId: '7',
  fallback: {
    patronCount: 0,
    lastPatron: null,
    highestBidder: null,
    highestBid: 0,
    bidCount: 0,
  },
})
```

For a deterministic snapshot, pass all five values through `fixed`, or create a complete URL with `toQuery(context)`. A fixed URL uses:

```text
networked_mode=fixed
networked_patron_count=12
networked_last_patron=0x…
networked_highest_bidder=0x…
networked_highest_bid=125
networked_bid_count=4
```

An empty fixed address means `null`. Fixed mode is atomic: if any of the five fields is missing or invalid, the SDK returns the configured fallback and emits `networked-context:error`; it never mixes fixed and live state.

## Events

Every published value emits `networked-context:change`. Resolution failures emit `networked-context:error`.

```js
addEventListener('networked-context:change', ({ detail }) => render(detail))
addEventListener('networked-context:error', ({ detail }) =>
  console.warn(detail.message),
)
```

The public API used by the SDK is `GET https://api.networked.art/context/v1/:collection/:tokenId`.
