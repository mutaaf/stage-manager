# Lessons

| What happened | Why | What changed |
|---|---|---|
| Health said `"key": "missing"` seconds after the key was uploaded | Secrets reach the Worker a moment after `wrangler secret put` returns | Expected; the next request showed it installed. Don't treat the first health read as final |
| The owner ran the install script with the placeholder filename, then with a cut-off one | The README showed `AuthKey_XXXXXXXXXX.p8` | The script names the problem ("no file at …"); give the owner the exact path, found by listing names only |
| Which App Store Connect role can read versions wasn't documented clearly | Apple's role table doesn't map endpoints | The install script proves the key against Apple before uploading it, and a 403 on beta groups is tolerated, not fatal |
| All five cron slots on the account were used | Free plan limit | No cron: Cue's hourly clock event calls `tick()` |
| CI would have failed to resolve `stagehand` | The first runtime dependency arrived, and CI ran `npm run check` without installing anything | CI runs `npm ci` against a committed package-lock.json; `npm run deploy` installs first |
