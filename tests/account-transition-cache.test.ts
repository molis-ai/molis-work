// WUA-32 V2U-07: the page-session scope has one parser, and a page without it fails closed instead of
// silently leaving its account browser caches (and its old page) in place during switch or logout.
import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_CACHE_SCOPE_MISSING, accountCacheOwner, pageSessionScope } from "@molis-ai/molis-work-app-workbench";

test("WUA-32 page-session scope extraction is one shared function", () => {
  assert.equal(pageSessionScope("proof-value.scope-value"), "scope-value");
  assert.equal(pageSessionScope("no-separator"), null);
  assert.equal(pageSessionScope(""), null);
  assert.equal(pageSessionScope(null), null);
  assert.equal(pageSessionScope(undefined), null);
});

test("WUA-32 a page without the Host page-session scope fails closed instead of keeping account caches", async () => {
  const owner = accountCacheOwner(null, () => ({ clear: async () => {}, hasDrafts: async () => false }));
  await assert.rejects(owner.hasDrafts(), new RegExp(ACCOUNT_CACHE_SCOPE_MISSING, "u"));
  await assert.rejects(owner.clear(), new RegExp(ACCOUNT_CACHE_SCOPE_MISSING, "u"),
    "a page that cannot prove its account partition must refuse account preparation and revocation");
});

test("WUA-32 a page with the Host scope installs exactly that partition", () => {
  let installed: string | null = null;
  const owner = accountCacheOwner("host-scope", scope => { installed = scope; return { clear: async () => {}, hasDrafts: async () => false }; });
  assert.equal(installed, "host-scope");
  assert.equal(typeof owner.clear, "function");
});
