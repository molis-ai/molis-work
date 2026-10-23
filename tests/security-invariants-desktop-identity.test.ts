import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// SYS-14 S-14: the production HTTP server proves this Home's identity over the exact bytes.
// Rust web_identity tests verify refusals and use one real socket before sending a native payload.
test("SYS-14 health answers fresh challenges without disclosing the control token", async t => {
  const f = await serveHomeRuntime(t);
  await f.project("Identity probe");
  const proofs = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const challenge = randomBytes(32).toString("base64url");
    const response = await fetch(`${f.origin}/health?challenge=${challenge}`);
    assert.equal(response.status, 200);
    const body = await response.text(), proof = response.headers.get("x-molis-work-proof");
    assert.equal(proof, createHmac("sha256", f.token).update(challenge + "\n").update(body).digest("base64url"));
    assert.equal(Buffer.byteLength(body), Number(response.headers.get("content-length")));
    assert.equal(body.includes(f.token), false);
    assert.equal(JSON.parse(body).status, "ok");
    assert.equal(JSON.parse(body).desktop_tui, true);
    proofs.push(proof);
  }
  assert.notEqual(proofs[0], proofs[1], "a previous response cannot answer the next challenge");
  const plain = await fetch(`${f.origin}/health`);
  assert.equal(plain.status, 200); assert.equal(plain.headers.get("x-molis-work-proof"), null);
  const invalid = await fetch(`${f.origin}/health?challenge=not-a-nonce`);
  assert.equal(invalid.status, 400); assert.equal(invalid.headers.get("x-molis-work-proof"), null);
});
