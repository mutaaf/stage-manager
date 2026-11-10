# Stage Manager: working notes

Read README.md first. AGENTS.md has the rules.

| Nuance | What to do |
|---|---|
| Worker code can't run `node:crypto` | `src/asc.mjs` signs the JWT with WebCrypto. ECDSA output is already r‖s, which is what ES256 wants. |
| `cloudflare:workers` can't be imported in Node tests | The logic lives in `src/tick.mjs`; `worker.mjs` is a thin wrapper. |
| KV free tier is 1,000 writes a day | State is written only when it changes; `last-run` is one write an hour. |
| Never print the key | The install script reads the .p8 only inside Node and pipes it to `wrangler secret put`. |
| Deploy before putting secrets | `wrangler secret put` needs the Worker to exist. |
