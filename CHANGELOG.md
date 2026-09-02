# @networked-art/context

## 0.1.1

### Patch Changes

- [`0b20f71`](https://github.com/networked-art/context/commit/0b20f715ef6af314e32b5b54cfdb8715c40135f3) Thanks [@jwahdatehagh](https://github.com/jwahdatehagh)! - Keep `watch` on a single polling chain across visibility changes.
  
  Waking a hidden document called `refresh` without cancelling the poll that was
  already scheduled, so every hide/show cycle left an extra chain running for the
  life of the artwork and the request rate climbed with each tab switch. Because
  each chain aborts the in-flight request of the others, artwork also saw
  `source: 'stale'` and `available: false` alternating with live values while the
  API was perfectly healthy.
