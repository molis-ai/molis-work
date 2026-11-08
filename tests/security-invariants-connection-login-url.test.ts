// SECURITY-INVARIANTS S-plugin-connection-card: the login address the connection card opens (the shell's card and the Assistant's,
// specs/assistant-service-connections/spec.md §13.5) is https, or plain http on this computer by the one loopback spelling
// (`@molis-ai/molis-work-contracts/platform/loopback`), and never carries a user name or password: `http://localhost:@evil.example/`
// is evil.example. The Assistant's card writes the same function into its script; tests/assistant-island-script.test.ts runs that copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isConnectionLoginUrl } from "@molis-ai/molis-work-app-workbench";
import { LOGIN_URLS_OPENED, LOGIN_URLS_REFUSED, loginOpens } from "./fixtures/connection-login-urls.js";

test("S-plugin-connection-card B1 the card opens only an https login or one on this computer, never one with a user name in it", () => {
  assert.equal(new URL("http://localhost:@evil.example/cb").hostname, "evil.example", "the address that looks local is not");
  for (const url of LOGIN_URLS_OPENED) assert.equal(isConnectionLoginUrl(url), true, url);
  for (const url of LOGIN_URLS_REFUSED) assert.equal(isConnectionLoginUrl(url), false, url);
});

test("S-plugin-connection-card B1 the shell's card checks the login address before it opens the browser or the window it reserved", () => {
  const source = readFileSync(new URL("../apps/workbench/src/browser/plugin-frame/connection-need.ts", import.meta.url), "utf8");
  const { opens, unchecked } = loginOpens(source);
  assert.equal(opens, 2, "the card opens the login in the system browser or in the window it reserved");
  assert.deepEqual(unchecked, [], "each open comes after isConnectionLoginUrl");
});
