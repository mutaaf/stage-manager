#!/bin/sh
# Give Stage Manager its App Store Connect key. Run it yourself:  ./scripts/put-apple-key.sh ~/Downloads/AuthKey_XXXXXXXXXX.p8
# 1. Proves the key can read your apps' review states (a real, read-only call to Apple).
# 2. Uploads it as an encrypted Worker secret. Nothing is printed, written to the repo, or logged.
# The issuer ID is the same for every key on the team, so it comes from ~/.config/lobby/asc.env unless ASC_ISSUER_ID is set.
set -eu
P8=${1:?usage: put-apple-key.sh /path/to/AuthKey_KEYID.p8}
[ -f "$P8" ] || { echo "no file at $P8"; exit 1; }
KID=${ASC_KEY_ID:-$(basename "$P8" | sed -n 's/^AuthKey_\([A-Z0-9]*\)\.p8$/\1/p')}
[ -n "$KID" ] || { echo "can't read the key ID from the filename; run with ASC_KEY_ID=... in front"; exit 1; }
ISS=${ASC_ISSUER_ID:-$(sed -n 's/^[[:space:]]*\(export[[:space:]]*\)\{0,1\}ASC_ISSUER_ID=//p' "$HOME/.config/lobby/asc.env" 2>/dev/null | tr -d "\"'" | head -1)}
[ -n "$ISS" ] || { echo "no issuer ID: run with ASC_ISSUER_ID=... in front (App Store Connect → Users and Access → Integrations)"; exit 1; }
cd "$(dirname "$0")/.."

echo "checking key $KID against App Store Connect…"
ASC_KEY_ID="$KID" ASC_ISSUER_ID="$ISS" node --input-type=module -e '
import { readFileSync } from "node:fs";
import { token, client, states } from "./src/asc.mjs";
const env = { ASC_KEY: readFileSync(process.argv[1], "utf8"), ASC_KEY_ID: process.env.ASC_KEY_ID, ASC_ISSUER_ID: process.env.ASC_ISSUER_ID };
try {
  const s = await states(client(await token(env)));
  console.log(`ok: it can read ${Object.keys(s).length} app(s): ${Object.values(s).map((x) => `${x.app} ${x.version} ${x.state}`).join(", ")}`);
} catch (e) {
  console.error(`Apple said no: ${e.message}`);
  if (e.status === 401) console.error("401 means the key ID, issuer ID or file don'"'"'t match. Check the key ID in the filename.");
  if (e.status === 403) console.error("403 means the key'"'"'s role can'"'"'t read app versions. Make a new key with the next role up and run this again.");
  process.exit(1);
}' "$P8"

echo "uploading as encrypted secrets…"
npx --yes wrangler@4 secret put ASC_KEY < "$P8" >/dev/null
printf %s "$KID" | npx --yes wrangler@4 secret put ASC_KEY_ID >/dev/null
printf %s "$ISS" | npx --yes wrangler@4 secret put ASC_ISSUER_ID >/dev/null
curl -sf https://mutaafaziz.com/stage/api/health; echo
echo "done. Stage Manager reads App Store Connect every hour from here on. You can delete $P8 from Downloads."
