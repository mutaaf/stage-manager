# Agents

- Read-only against Apple. No POST, PATCH or DELETE to App Store Connect from this Worker, ever.
- Never read, print, copy or move the .p8 key. The owner installs it with `scripts/put-apple-key.sh`.
- Events go through Cue's contracts. A new event type is a Cue PR first.
- `npm test` must pass. CI runs `npm run check` on every PR.
