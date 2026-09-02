---
'@networked-art/context': patch
---

Pin the README's CDN example to a release that has the `watch` fix. The example
told artists to embed `0.1.0` in artwork meant to last, which spawns a polling
chain per tab switch and reports stale context against a healthy API.
