import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { UI_REQUEST_CLIENT_SCRIPT, createUiRequest, type UiFetchInit, type UiRequestPorts } from "@molis-ai/molis-work-ui-host";

// S-03, the browser side (docs/system/SECURITY-INVARIANTS.md): the Host only accepts a change that carries the control token,
// and the page puts that token on every change it sends. A page request helper that would send it to another site, because
// of an address a plugin or a stored value gave it, would hand the token over. The refusal is in the helper, before any
// request exists: the page's fetch is never called.

const ORIGIN = "http://127.0.0.1:4173";

function helper() {
  const sent: Array<{ input: string; init: UiFetchInit }> = [];
  const ports: UiRequestPorts = {
    fetch: async (input, init) => { sent.push({ input, init }); return new Response("{}", { status: 200 }); },
    origin: ORIGIN,
    token: () => "secret-control-token",
    newKey: () => "one-time-key-0001",
    translate: text => text,
  };
  return { sent, request: createUiRequest(ports) };
}

const FOREIGN = [
  ["another site", "https://evil.example/api/projects"],
  ["another site over plain http", "http://evil.example/api/projects"],
  ["a protocol-relative address", "//evil.example/api/projects"],
  ["a backslash that browsers read as a slash", "/\\evil.example/api/projects"],
  ["the same host on another port", "http://127.0.0.1:9999/api/projects"],
  ["the same host over https", "https://127.0.0.1:4173/api/projects"],
  ["another loopback name", "http://localhost:4173/api/projects"],
  ["a name that starts like this host", `${ORIGIN}.evil.example/api/projects`],
  ["credentials in front of this host", `${ORIGIN.replace("http://", "http://user:pass@")}@evil.example/api/projects`],
  ["this host written as a user name of another", "http://127.0.0.1:4173@evil.example/api/projects"],
  ["a data address", "data:text/plain,hello"],
  ["a script address", "javascript:alert(1)"],
  ["an address that is no address", "http://"],
] as const;

test("S-03 the page request helper never sends the control token to another origin", async () => {
  for (const [what, address] of FOREIGN) {
    for (const init of [{}, { body: { a: 1 } }, { method: "DELETE" as const }, { body: { a: 1 }, headers: { "x-molis-work-fragment": "1" } }, { as: "response" as const, body: {} }]) {
      const { sent, request } = helper();
      const failure = await request(address, init).then(() => null, error => error as { code: string; status: number });
      assert.ok(failure, `${what}: the request must be refused, not sent`);
      assert.equal(failure.code, "ui_host.cross_origin", what);
      assert.equal(failure.status, 0, what);
      assert.equal(sent.length, 0, `${what}: the page's fetch was called, and the control token would have gone with it`);
    }
  }
});

test("S-03 the refusal also holds for a request owned by a view's scope", async () => {
  const { request } = helper();
  let used = 0;
  const scope = { fetch: async () => { used++; return new Response("{}"); }, assertCurrent: () => {} };
  for (const [what, address] of FOREIGN) {
    const failure = await request(address, { body: {}, scope }).then(() => null, error => error as { code: string });
    assert.equal(failure?.code, "ui_host.cross_origin", what);
  }
  assert.equal(used, 0, "a scope's fetch carries the same page credentials, so it is not reached either");
});

test("S-03 the same-origin addresses are not refused: the refusal is about the origin, not about every address", async () => {
  for (const address of ["/api/projects", "api/projects", "./api/projects", `${ORIGIN}/api/projects`, "/api/projects?next=https://evil.example", "/api/projects#https://evil.example"]) {
    const { sent, request } = helper();
    await request(address, { body: {} });
    assert.equal(sent.length, 1, address);
    assert.ok(sent[0]!.input.startsWith(`${ORIGIN}/`), `${address} goes to this origin, as ${sent[0]!.input}`);
    assert.equal(new URL(sent[0]!.input).origin, ORIGIN);
    assert.equal(sent[0]!.init.headers["x-molis-work-control-token"], "secret-control-token");
  }
});

test("S-03 the address that was checked is the address that is sent", async () => {
  // A relative address is resolved against this origin before it is checked, and the resolved address is what goes out, so
  // a page whose own base address differs from its origin cannot send the token somewhere else.
  const { sent, request } = helper();
  await request("../../api/projects/./x/../y", { body: {} });
  assert.equal(sent[0]!.input, `${ORIGIN}/api/projects/y`);
});

test("S-03 a read never carries the token, whatever the caller asks for", async () => {
  const { sent, request } = helper();
  await request("/api/projects", { headers: { "X-Molis-Work-Control-Token": "asked-for", "x-molis-work-idempotency-key": "asked-for" } });
  assert.deepEqual(Object.keys(sent[0]!.init.headers), [], "a read has no token to hand over");
});

test("S-03 the page program wires the same helper to the page's own origin", async () => {
  const sent: string[] = [];
  const sandbox = vm.createContext({
    URL, setTimeout, clearTimeout,
    location: { origin: ORIGIN },
    crypto: { randomUUID: () => "one-time-key-0001" },
    navigator: {},
    document: { documentElement: { dataset: {} }, querySelector: () => ({ content: "secret-control-token" }), createElement: () => ({}), addEventListener: () => {} },
    fetch: async (input: string) => { sent.push(input); return new Response("{}"); },
  });
  vm.runInContext(UI_REQUEST_CLIENT_SCRIPT, sandbox);
  const outcome = await (vm.runInContext(`molisWorkRequest("https://evil.example/api/x", { body: {} }).then(() => "sent", error => error.code)`, sandbox) as Promise<string>);
  assert.equal(outcome, "ui_host.cross_origin");
  assert.deepEqual(sent, []);
});
