use wasm_bindgen::prelude::*;
use worker::{js_sys::Promise, wasm_bindgen_futures::JsFuture};

#[wasm_bindgen(inline_js = r#"
const proofType = 'molis-sync-read+jwt';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const keys = new Map();
const proofs = new Map();

function decode(segment) {
  if (!segment || !/^[a-zA-Z0-9_-]+$/.test(segment)) throw new Error('Invalid proof encoding');
  return Uint8Array.from(atob(segment.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

async function publicKey(origin, kid) {
  const now = Date.now();
  const previous = keys.get(origin);
  if (previous?.expires > now && previous.byId.has(kid)) return previous.byId.get(kid);
  const response = await fetch(origin + '/.well-known/molis-sync-jwks.json', {redirect: 'manual'});
  if (!response.ok) throw new Error('Auth signing keys unavailable');
  const jwks = await response.json();
  if (!Array.isArray(jwks.keys) || jwks.keys.length > 8) throw new Error('Invalid Auth signing keys');
  const byId = new Map();
  for (const jwk of jwks.keys) {
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || jwk.alg !== 'EdDSA' || jwk.use !== 'sig'
        || typeof jwk.kid !== 'string' || byId.has(jwk.kid) || 'd' in jwk) throw new Error('Invalid Auth signing key');
    const key = await crypto.subtle.importKey('jwk', jwk, {name: 'Ed25519'}, false, ['verify']);
    byId.set(jwk.kid, key);
  }
  keys.set(origin, {byId, expires: now + 60_000});
  return byId.get(kid);
}

async function verify(origin, application, tokenHash, proof) {
  let header, payload, signature, message;
  try {
    const [protectedHeader, encoded, signed, ...trailing] = proof.split('.');
    if (trailing.length) return null;
    header = JSON.parse(decoder.decode(decode(protectedHeader)));
    payload = JSON.parse(decoder.decode(decode(encoded)));
    signature = decode(signed);
    message = encoder.encode(protectedHeader + '.' + encoded);
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (header?.alg !== 'EdDSA' || header.typ !== proofType
      || typeof header.kid !== 'string' || !header.kid || header.kid.length > 80 || signature.length !== 64
      || payload?.iss !== origin || payload.aud !== application || payload.scope !== 'molis-sync:read'
      || payload.token_sha256 !== tokenHash || typeof payload.sub !== 'string' || !payload.sub
      || encoder.encode(payload.sub).length > 500 || payload.sub.trim() !== payload.sub
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || payload.iat > now + 2 || payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > 30) return null;
  const key = await publicKey(origin, header.kid);
  if (!key || !await crypto.subtle.verify('Ed25519', key, signature, message)) return null;
  return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
}

export async function syncReadIdentity(origin, application, authorization, tokenHash) {
  const cacheKey = JSON.stringify([origin, application, tokenHash]);
  const cached = proofs.get(cacheKey);
  if (cached?.expires > Math.floor(Date.now() / 1000)) {
    return (await verify(origin, application, tokenHash, cached.proof))?.sub ?? null;
  }
  proofs.delete(cacheKey);
  const response = await fetch(origin + '/api/v2/auth/sync-read-proof', {
    redirect: 'manual', headers: {Authorization: authorization},
  });
  if (response.status >= 500) throw new Error('Auth proof issuance unavailable');
  if (!response.ok) return null;
  const proof = (await response.json())?.data?.proof;
  if (typeof proof !== 'string' || proof.length > 4096) return null;
  const claims = await verify(origin, application, tokenHash, proof);
  if (!claims) return null;
  if (proofs.size >= 1024) proofs.delete(proofs.keys().next().value);
  proofs.set(cacheKey, {proof, expires: claims.exp});
  return claims.sub;
}
"#)]
extern "C" {
    #[wasm_bindgen(js_name = syncReadIdentity)]
    fn sync_read_identity_promise(
        origin: &str,
        application: &str,
        authorization: &str,
        token_hash: &str,
    ) -> Promise;
}

pub(crate) async fn sync_read_identity(
    origin: &str,
    application: &str,
    authorization: &str,
    token_hash: &str,
) -> std::result::Result<JsValue, JsValue> {
    JsFuture::from(sync_read_identity_promise(
        origin,
        application,
        authorization,
        token_hash,
    ))
    .await
}
