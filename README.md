# Stage Manager

Release tracking for every app on the team, running in the cloud instead of on one Mac. Phase 4 of the
portfolio's event architecture ([Cue](https://github.com/mutaaf/cue), docs/ARCHITECTURE.md).

Every hour Cue's clock calls `tick()` over a service binding. Stage Manager reads each app's newest iOS
version from App Store Connect and publishes `app.review.changed` to Cue when a state moves. Cue then
emails the alert.

```
Cue clock (hourly) ──tick()──▶ Stage Manager ──GET (read-only)──▶ App Store Connect
                                     │
                                     └──publish app.review.changed──▶ Cue ──▶ alert email
```

## Rules

- **Read-only.** It never submits, edits or uploads. Lobby keeps doing uploads from the Mac with its own key.
- **Its own key.** A separate App Store Connect team key with the lowest role that can read app versions.
  Revoke it in App Store Connect and nothing else breaks.
- **The key lives only in Cloudflare's encrypted secrets.** It's never in this repo, a log or an error message.
- **No cron.** The account's five cron slots are used, so the clock comes from Cue as an event.
- **Same event ids as Lobby's local watcher**, so while both run, Cue logs each change once.

## Install the key

```sh
./scripts/put-apple-key.sh ~/Downloads/AuthKey_XXXXXXXXXX.p8
```

It first proves the key can read your apps, then uploads it. `GET /stage/api/health` shows whether the key is
installed and how the last hourly run went.

## Develop

`npm test` (Node 22, no install). `npm run deploy` tests, deploys and checks health.
