# Stage Manager: working notes

Read README.md first. AGENTS.md has the rules.

| Nuance | What to do |
|---|---|
| Worker code can't run `node:crypto` | `src/asc.mjs` signs the JWT with WebCrypto. ECDSA output is already r‖s, which is what ES256 wants. |
| `cloudflare:workers` can't be imported in Node tests | The logic lives in `src/tick.mjs`; `worker.mjs` is a thin wrapper. |
| KV free tier is 1,000 writes a day | State is written only when it changes; `last-run` is one write an hour. |
| Never print the key | The install script reads the .p8 only inside Node and pipes it to `wrangler secret put`. |
| Deploy before putting secrets | `wrangler secret put` needs the Worker to exist. |
| Logging | Each tick and request writes one `{service, event, ms, ok}` line via [stagehand](https://github.com/mutaaf/stagehand) (GitHub dependency): `npm ci` first. |

## Definition of done

- `npm test` passes (CI runs `npm run check` on every PR; main is protected).
- Still read-only against Apple: no POST, PATCH or DELETE to App Store Connect.
- `npm run deploy`, then `/stage/api/health` shows the last hourly run ok.
- A new way this broke goes in `docs/LESSONS.md`, and in a test if a test can catch it.
