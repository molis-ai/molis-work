#!/usr/bin/env node
// A language server for tests: JSON-RPC over stdio with Content-Length framing. It knows one file, `src/a.ts`, whose
// `greet` function it points at; it records the handshake in the file named by FAKE_LSP_LOG so a test can see that it ran
// and that it was asked to shut down.

import { appendFileSync } from "node:fs";

const log = process.env.FAKE_LSP_LOG;
const note = (line) => { if (log) appendFileSync(log, line + "\n"); };
let buffer = Buffer.alloc(0);
let initialized = false;

const send = (message) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
};

const location = (line, character) => ({ uri: "file:///work/src/a.ts", range: { start: { line, character }, end: { line, character: character + 5 } } });

const answer = (message) => {
  const { id, method, params } = message;
  note(method ?? "notification");
  if (method === "initialize") {
    send({ id, result: { capabilities: { definitionProvider: true, referencesProvider: true, documentSymbolProvider: true }, serverInfo: { name: "fake" } } });
    return;
  }
  if (method === "initialized") return;
  if (method === "textDocument/didOpen") { note(`opened:${params.textDocument.uri}`); return; }
  if (method === "textDocument/definition") {
    if (!initialized) { send({ id, error: { code: -32002, message: "not initialized" } }); return; }
    send({ id, result: [location(2, 9)] });
    return;
  }
  if (method === "textDocument/references") {
    send({ id, result: [location(8, 4), location(12, 2)] });
    return;
  }
  if (method === "textDocument/documentSymbol") {
    send({ id, result: [{ name: "greet", kind: 12, range: { start: { line: 2, character: 0 }, end: { line: 4, character: 0 } }, selectionRange: { start: { line: 2, character: 9 }, end: { line: 2, character: 14 } } }] });
    return;
  }
  if (method === "shutdown") { send({ id, result: null }); return; }
  if (method === "exit") { note("exited"); process.exit(0); }
  if (id !== undefined) send({ id, error: { code: -32601, message: `no method ${String(method)}` } });
};

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const length = /Content-Length: (\d+)/i.exec(header)?.[1];
    const start = headerEnd + 4;
    if (length === undefined) { buffer = buffer.subarray(start); continue; }
    const size = Number(length);
    if (buffer.length < start + size) return;
    const body = buffer.subarray(start, start + size).toString("utf8");
    buffer = buffer.subarray(start + size);
    const message = JSON.parse(body);
    if (message.method === "initialized") { initialized = true; note("initialized"); continue; }
    if (message.method === "exit") { note("exited"); process.exit(0); }
    answer(message);
  }
});
note("started");
