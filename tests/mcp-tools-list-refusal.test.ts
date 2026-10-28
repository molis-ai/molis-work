import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test, { type TestContext } from "node:test";
import { LocalMcpServer, createMcpResidentStarter, type EnsureMcpResidentHost } from "@molis-ai/molis-work-app-local-host";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

/** The one opaque refusal body the resident answers when a Host/Origin/token check fails (S-02, S-03). */
const REFUSED = { error: "本地控制请求校验失败", code: "host.request_refused" };
const RUNTIME = { runtime_id: "t051", stable_work_context_id: "t051", host_declares_stable: true };

interface Reply {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
}

interface Cleanup {
  push(close: () => Promise<void> | void): void;
}

/** Teardown never hides the test's own failure: every step runs, even when an earlier one throws. */
function cleanup(t: TestContext): Cleanup {
  const closes: (() => Promise<void> | void)[] = [];
  t.after(async () => {
    for (const close of closes.reverse()) {
      try {
        await close();
      } catch {
        /* Teardown is best-effort; the assertion failure stays the reported one. */
      }
    }
  });
  return {
    push(close) {
      closes.push(close);
    },
  };
}

async function tempHome(dispose: Cleanup): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "mcp-tools-list-"));
  await mkdir(join(home, "config"));
  await writeFile(join(home, "config/web-control-token"), randomBytes(32).toString("base64url"));
  dispose.push(() => rm(home, { recursive: true, force: true }));
  return home;
}

interface Stub {
  readonly origin: string;
  readonly requests: readonly { method: string | undefined; url: string | undefined; headers: IncomingMessage["headers"] }[];
  /** Drops connections the stub deliberately leaves hanging, before the server under test is closed. */
  drain(): void;
}

async function stub(dispose: Cleanup, respond: (request: IncomingMessage, response: ServerResponse) => void): Promise<Stub> {
  const requests: { method: string | undefined; url: string | undefined; headers: IncomingMessage["headers"] }[] = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    respond(request, response);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  dispose.push(async () => {
    const closed = new Promise<void>(resolve => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
  });
  return { origin: `http://127.0.0.1:${address.port}`, requests, drain: () => server.closeAllConnections() };
}

function mcp(dispose: Cleanup, home: string, origin: string, ensure?: EnsureMcpResidentHost): LocalMcpServer {
  const server = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", null,
    { homeDirectory: home, runtimeContext: RUNTIME }, undefined, origin, ensure);
  dispose.push(() => server.close());
  return server;
}

function refusal(reply: Reply | null, code: string): void {
  assert.ok(reply, "the discovery failure answered instead of rejecting the request");
  assert.equal(reply.jsonrpc, "2.0");
  assert.equal(reply.id, 7);
  assert.equal(reply.result, undefined, "a refusal carries no result");
  assert.ok(reply.error, "a refusal carries a JSON-RPC error");
  assert.equal(reply.error.code, -32603);
  assert.equal(typeof reply.error.message, "string");
  const detail = JSON.parse(reply.error.message) as { code?: unknown };
  assert.equal(detail.code, code, "the answer keeps the original action code inside its message");
}

/** Buffers the stdio output into whole lines before any request is written, so one chunk is never one message. */
function lines(output: PassThrough): { next(): Promise<string> } {
  let buffer = "";
  const queued: string[] = [];
  const waiters: ((line: string) => void)[] = [];
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else queued.push(line);
      index = buffer.indexOf("\n");
    }
  });
  return {
    next() {
      const line = queued.shift();
      if (line !== undefined) return Promise.resolve(line);
      return new Promise<string>(resolve => waiters.push(resolve));
    },
  };
}

/** The stdio server may end while a reply is awaited: that is a failure, not a timeout. */
async function readLine(reader: { next(): Promise<string> }, serving: Promise<void>): Promise<Reply> {
  const line = await Promise.race([
    reader.next(),
    serving.then(() => {
      throw new Error("stdio ended before the reply arrived");
    }),
  ]);
  return JSON.parse(line) as Reply;
}

test("RAC-1470: a control-token refusal answers tools/list with one JSON-RPC error", { timeout: 30_000 }, async t => {
  const dispose = cleanup(t);
  const home = await tempHome(dispose);
  const resident = await stub(dispose, (_request, response) => {
    const body = JSON.stringify(REFUSED);
    response.writeHead(403, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    response.end(body);
  });
  const server = mcp(dispose, home, resident.origin);
  const reply = await server.handleMessage({ jsonrpc: "2.0", id: 7, method: "tools/list" }) as Reply | null;
  refusal(reply, "host.request_refused");
  assert.ok(resident.requests.some(request => request.method === "POST"), "the resident was asked and refused the forwarded context");
});

test("RAC-1470: a listener that cannot prove this Home answers tools/list with the transport error", { timeout: 30_000 }, async t => {
  const dispose = cleanup(t);
  const home = await tempHome(dispose);
  const resident = await stub(dispose, (request, response) => {
    assert.equal(request.method, "GET");
    const url = new URL(request.url ?? "", "http://localhost");
    assert.equal(url.pathname, "/health");
    assert.match(url.searchParams.get("challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
    const body = JSON.stringify({ status: "ok", desktop_tui: true });
    response.writeHead(200, { "content-length": Buffer.byteLength(body) });
    response.end(body);
  });
  const starter = createMcpResidentStarter();
  dispose.push(() => starter.close());
  const server = mcp(dispose, home, resident.origin, starter.ensure);
  const reply = await server.handleMessage({ jsonrpc: "2.0", id: 7, method: "tools/list" }) as Reply | null;
  refusal(reply, "actions.transport_invalid");
  assert.equal(resident.requests.length, 1, "only the read-only health probe reached the other listener");
  assert.equal(resident.requests[0]?.headers["x-molis-work-control-token"], undefined, "the probe sent no credentials");
});

test("RAC-1471: a refused discovery keeps the stdio server answering the next request", { timeout: 30_000 }, async t => {
  const dispose = cleanup(t);
  const home = await tempHome(dispose);
  const resident = await stub(dispose, (_request, response) => {
    const body = JSON.stringify(REFUSED);
    response.writeHead(403, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    response.end(body);
  });
  const server = mcp(dispose, home, resident.origin);
  const input = new PassThrough(), output = new PassThrough();
  const reader = lines(output);
  const serving = serveMcpStdio({ input, output, handleMessage: (message, signal) => server.handleMessage(message, signal) });
  let settled = false;
  void serving.then(() => {
    settled = true;
  }, () => {
    settled = true;
  });
  dispose.push(async () => {
    if (!input.writableEnded) input.end();
    await serving.catch(() => undefined);
    output.destroy();
  });

  // Write both requests first: the refusal must not stop the already queued ping from being answered.
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }) + "\n");
  const first = await readLine(reader, serving);
  assert.equal(first.id, 1, "the refused discovery answered first");
  assert.equal(first.error?.code, -32603);
  assert.equal(first.result, undefined);
  const second = await readLine(reader, serving);
  assert.equal(second.id, 2);
  assert.deepEqual(second.result, {});
  assert.equal(settled, false, "the process stayed open for the next request");
  assert.equal(input.writableEnded, false, "nothing closed the input on our behalf");

  input.end();
  await serving;
  assert.equal(settled, true);
});

test("RAC-1472: a cancelled discovery rejects with the cancellation and answers nothing", { timeout: 30_000 }, async t => {
  const dispose = cleanup(t);
  const home = await tempHome(dispose);
  let entered!: () => void;
  const reached = new Promise<void>(resolve => {
    entered = resolve;
  });
  const resident = await stub(dispose, () => {
    entered();
  });
  const server = mcp(dispose, home, resident.origin);
  dispose.push(() => resident.drain());
  const controller = new AbortController();
  const reason = new Error("MCP request cancelled");
  const pending = server.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, controller.signal);
  // Observe the request from the start, so an early rejection is neither unhandled nor waited on forever.
  const settled = pending.then(() => "resolved", () => "rejected");
  try {
    await Promise.race([
      reached,
      settled.then(state => {
        throw new Error(`the request settled before the resident saw it: ${state}`);
      }),
    ]);
  } finally {
    if (!controller.signal.aborted) controller.abort(reason);
    await pending.catch(() => undefined);
  }
  const error = await pending.then(() => assert.fail("the cancelled request resolved"), (failure: unknown) => failure);
  assert.equal(error, reason, "the cancellation keeps the original reason object");
  assert.equal(resident.requests.length, 1, "the cancelled request was not retried");
});
