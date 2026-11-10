import { test } from 'node:test';
import assert from 'node:assert/strict';
import { token, states, client, EDITABLE } from '../src/asc.mjs';
import { diff, eventId } from '../src/watch.mjs';
import { tick } from '../src/tick.mjs';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const keyEnv = { ASC_KEY: PEM, ASC_KEY_ID: 'KID123', ASC_ISSUER_ID: 'iss-1' };

test('the JWT is ES256, verifiable, and lives 20 minutes', async () => {
  const jwt = await token(keyEnv, 1000);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KID123', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { iss: 'iss-1', iat: 1000, exp: 2200, aud: 'appstoreconnect-v1' });
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`));
  assert.ok(ok);
});

const apple = (versions) => async (url) => {
  const u = new URL(url);
  if (u.pathname.endsWith('/betaGroups')) return u.pathname.includes('/2/') ? new Response('', { status: 403 }) : Response.json({ data: [{ attributes: { isInternalGroup: true, publicLinkEnabled: false } }, { attributes: { isInternalGroup: false, publicLinkEnabled: true, publicLink: 'https://testflight.apple.com/join/abc' } }] });
  if (u.pathname === '/v1/apps') return Response.json({ data: [{ id: '1', attributes: { name: 'Moon Club', bundleId: 'com.x.moon' } }, { id: '2', attributes: { name: 'Draft', bundleId: 'com.x.draft' } }] });
  const id = u.pathname.split('/')[3];
  return Response.json({ data: versions[id] ?? [] });
};
const v = (versionString, appStoreState) => ({ attributes: { versionString, appStoreState } });

test('an editable version wins, the live version and public TestFlight link are reported, and a 403 on beta groups is tolerated', async () => {
  const got = await states(client('jwt', apple({ 1: [v('0.16.0', 'READY_FOR_SALE'), v('0.17.0', 'PREPARE_FOR_SUBMISSION')], 2: [v('1.0', 'WAITING_FOR_REVIEW')] })));
  assert.deepEqual(got['com.x.moon'], { app: 'Moon Club', id: '1', version: '0.17.0', state: 'PREPARE_FOR_SUBMISSION', liveVersion: '0.16.0', testflight: 'https://testflight.apple.com/join/abc' });
  // a role that can't read beta groups still gets versions
  assert.deepEqual(got['com.x.draft'], { app: 'Draft', id: '2', version: '1.0', state: 'WAITING_FOR_REVIEW', liveVersion: null, testflight: null });
  assert.ok(EDITABLE.has('REJECTED'));
});

test('a refused call names the path but never the token', async () => {
  const get = client('secret.jwt.value', async () => new Response('no', { status: 403 }));
  await assert.rejects(get('/v1/apps?limit=200'), (e) => e.status === 403 && /\/v1\/apps → 403/.test(e.message) && !e.message.includes('secret'));
});

test('diff reports moves only, with the same event id Lobby uses', () => {
  const last = { a: { app: 'Moon Club', version: '0.15.0', state: 'WAITING_FOR_REVIEW' }, b: { app: 'Kin', version: '1.0', state: 'IN_REVIEW' } };
  const now = { a: { app: 'Moon Club', version: '0.15.0', state: 'READY_FOR_SALE' }, b: last.b, c: { app: 'New', version: '1', state: 'PREPARE_FOR_SUBMISSION' } };
  const d = diff(last, now);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].data, { app: 'Moon Club', version: '0.15.0', from: 'WAITING_FOR_REVIEW', to: 'READY_FOR_SALE' });
  assert.equal(d[0].id, 'review:Moon_Club:0.15.0_READY_FOR_SALE');
  assert.equal(eventId('Moon Club', '0.15.0', 'READY_FOR_SALE'), 'review:Moon_Club:0.15.0_READY_FOR_SALE');
});

const kv = (init = {}) => { const m = new Map(Object.entries(init).map(([k, x]) => [k, JSON.stringify(x)])); return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, x) => { m.set(k, x); } }; };

test('tick without a key does nothing and says so', async () => {
  const env = { KV: kv(), CUE: { publish: () => assert.fail('must not publish') } };
  assert.deepEqual(await tick(env), { ok: false, why: 'no Apple key yet' });
  assert.match(env.KV.m.get('last-run'), /no Apple key yet/);
});

test('tick publishes a move, and remembers only after Cue accepts', async () => {
  const last = { 'com.x.moon': { app: 'Moon Club', version: '0.15.0', state: 'WAITING_FOR_REVIEW' } };
  const sent = [];
  const env = { ...keyEnv, KV: kv({ 'review-state': last }), CUE: { publish: async (e) => (sent.push(e), { ok: true }) } };
  const r = await tick(env, apple({ 1: [v('0.15.0', 'READY_FOR_SALE')] }));
  assert.deepEqual(r, { ok: true, apps: 1, published: 1 });
  assert.equal(sent[0].data.to, 'READY_FOR_SALE');
  assert.match(env.KV.m.get('review-state'), /READY_FOR_SALE/);

  const refusing = { ...keyEnv, KV: kv({ 'review-state': last }), CUE: { publish: async () => ({ ok: false, error: 'budget' }) } };
  await assert.rejects(tick(refusing, apple({ 1: [v('0.15.0', 'READY_FOR_SALE')] })), /cue refused/);
  assert.match(refusing.KV.m.get('review-state'), /WAITING_FOR_REVIEW/);
});

test('an Apple failure is recorded and thrown so Cue retries and alerts', async () => {
  const env = { ...keyEnv, KV: kv(), CUE: { publish: async () => ({ ok: true }) } };
  await assert.rejects(tick(env, async () => new Response('', { status: 401 })), /401/);
  assert.match(env.KV.m.get('last-run'), /"ok":false/);
});
