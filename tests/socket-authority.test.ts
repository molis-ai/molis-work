import assert from "node:assert/strict";
import test from "node:test";
import { bindSocketAuthority, bindWebSocketAuthority, type AuthoritySocket } from "@molis-ai/molis-work-app-local-host";

// F1 of the 2026-11-11 code-quality review: the pty, browser and computer channels bind the control token's authority
// through the same helper (socket-authority.ts), so the three hand-written copies cannot drift apart.

function fakeSocket() {
  const listeners: Array<() => void> = [];
  return {
    closes: 0,
    close() { this.closes += 1; },
    once(event: "close", listener: () => void) {
      assert.equal(event, "close");
      listeners.push(listener);
    },
    fireClose() { for (const listener of listeners.splice(0)) listener(); },
  } satisfies AuthoritySocket & { closes: number; fireClose(): void };
}

test("a refused socket proof binds no authority; the caller answers with its own error and closes the socket", () => {
  const socket = fakeSocket();
  const authority = bindWebSocketAuthority({ headers: {} }, "control-token", "wrong-proof", socket);
  assert.equal(authority, null);
  assert.equal(socket.closes, 0);
});

test("the control token binds the same authority the page session uses, without an abort source of its own", () => {
  const socket = fakeSocket();
  const authority = bindWebSocketAuthority({ headers: {} }, "control-token", "control-token", socket);
  assert.ok(authority);
  assert.equal(authority.valid(), true);
  assert.equal(socket.closes, 0);
});

test("a revoked session closes the bound socket once; a socket that closed first leaves no abort listener behind", () => {
  const socket = fakeSocket();
  const controller = new AbortController();
  bindSocketAuthority({ signal: controller.signal, valid: () => !controller.signal.aborted }, socket);
  controller.abort();
  assert.equal(socket.closes, 1);

  const closedFirst = fakeSocket();
  const later = new AbortController();
  bindSocketAuthority({ signal: later.signal, valid: () => true }, closedFirst);
  closedFirst.fireClose();
  later.abort();
  assert.equal(closedFirst.closes, 0, "the socket's own close removed the abort listener");
});
