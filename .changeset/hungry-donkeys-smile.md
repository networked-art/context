---
'@networked-art/context': patch
---

Keep `watch` on a single polling chain across visibility changes.

Waking a hidden document called `refresh` without cancelling the poll that was
already scheduled, so every hide/show cycle left an extra chain running for the
life of the artwork and the request rate climbed with each tab switch. Because
each chain aborts the in-flight request of the others, artwork also saw
`source: 'stale'` and `available: false` alternating with live values while the
API was perfectly healthy.
