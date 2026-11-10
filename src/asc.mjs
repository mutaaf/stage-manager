// App Store Connect from a Worker: an ES256 JWT signed with WebCrypto, and a read of every app's newest
// iOS version. Read-only. Never submits, never edits, never logs the key.
const API = 'https://api.appstoreconnect.apple.com';
// Same rule as Lobby (lobby/src/asc.mjs): an editable version wins, otherwise the newest.
export const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY']);

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const part = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
const der = (pem) => Uint8Array.from(atob(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));

export const hasKey = (env) => Boolean(env.ASC_KEY && env.ASC_KEY_ID && env.ASC_ISSUER_ID);

export async function token(env, now = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('pkcs8', der(env.ASC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = part({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' });
  const body = part({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  // WebCrypto's ECDSA signature is already r||s, which is what a JWT wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

export function client(jwt, f = fetch) {
  return async (path) => {
    const r = await f(API + path, { headers: { authorization: `Bearer ${jwt}` } });
    if (!r.ok) throw Object.assign(new Error(`GET ${path.split('?')[0]} → ${r.status}`), { status: r.status });
    return r.json();
  };
}

export const LIVE = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION']);

/**
 * { bundleId: { app, id, version, state, liveVersion, testflight } } for every app on the team.
 * version/state: the version being worked on (an editable one wins, else the newest), as Lobby reads it.
 * liveVersion: what's on the App Store now, if anything. testflight: an open public beta link, if any.
 * Beta groups are best-effort: a key whose role can't read them still reports versions.
 */
export async function states(get) {
  const apps = (await get('/v1/apps?limit=200&fields[apps]=name,bundleId')).data;
  const out = {};
  for (const a of apps) {
    const vs = (await get(`/v1/apps/${a.id}/appStoreVersions?filter[platform]=IOS&limit=10&fields[appStoreVersions]=versionString,appStoreState`)).data;
    const v = vs.find((x) => EDITABLE.has(x.attributes.appStoreState)) ?? vs[0];
    if (!v?.attributes.appStoreState) continue;
    const live = vs.find((x) => LIVE.has(x.attributes.appStoreState));
    let testflight = null;
    try {
      const gs = (await get(`/v1/apps/${a.id}/betaGroups?limit=50&fields[betaGroups]=isInternalGroup,publicLinkEnabled,publicLink`)).data;
      testflight = gs.find((g) => !g.attributes.isInternalGroup && g.attributes.publicLinkEnabled && g.attributes.publicLink)?.attributes.publicLink ?? null;
    } catch (e) { if (e.status !== 403) throw e; }
    out[a.attributes.bundleId] = { app: a.attributes.name, id: a.id, version: v.attributes.versionString, state: v.attributes.appStoreState, liveVersion: live?.attributes.versionString ?? null, testflight };
  }
  return out;
}
