#!/usr/bin/env node
// A language server for the check before review (A4-2): it keeps each open document's text, publishes one error (code E1) per
// line containing BAD, and formats by removing trailing spaces — the whole document, or only the lines of a range. Before it
// answers the handshake it asks the client for its configuration and waits for the answer, as real servers do.
// FAKE_LSP_PULL=1 also offers pull diagnostics; FAKE_LSP_NO_FORMAT=1 offers no formatting; FAKE_LSP_FORMAT_ERROR=1 fails it.

let buffer = Buffer.alloc(0);
const docs = new Map();
let nextId = 1000, pendingInit;

const send = (message) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
};
const errors = (text) => text.split("\n").flatMap((line, index) => line.includes("BAD")
  ? [{ range: { start: { line: index, character: 0 }, end: { line: index, character: line.length } }, severity: 1, code: "E1", message: "bad line\nmore detail" }] : []);
const publish = (uri) => setTimeout(() => send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics: errors(docs.get(uri) ?? "") } }), 30);
const trimmed = (lines, from, to) => lines.flatMap((line, index) => index >= from && index <= to && /[ ]+$/.test(line)
  ? [{ range: { start: { line: index, character: line.replace(/[ ]+$/, "").length }, end: { line: index, character: line.length } }, newText: "" }] : []);

const answer = (message) => {
  const { id, method, params } = message;
  if (id !== undefined && method === undefined) {
    if (pendingInit && message.id === pendingInit.asked) { const respond = pendingInit.respond; pendingInit = undefined; respond(); }
    return;
  }
  if (method === "initialize") {
    const capabilities = { definitionProvider: true, ...(process.env.FAKE_LSP_NO_FORMAT ? {} : { documentFormattingProvider: true, documentRangeFormattingProvider: true }),
      ...(process.env.FAKE_LSP_PULL ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } } : {}) };
    const asked = nextId++;
    pendingInit = { asked, respond: () => send({ id, result: { capabilities } }) };
    send({ id: asked, method: "workspace/configuration", params: { items: [{ section: "fake" }] } });
    return;
  }
  if (method === "textDocument/didOpen") { docs.set(params.textDocument.uri, params.textDocument.text); publish(params.textDocument.uri); return; }
  if (method === "textDocument/didChange") { docs.set(params.textDocument.uri, params.contentChanges.at(-1).text); publish(params.textDocument.uri); return; }
  if (method === "textDocument/didClose") { docs.delete(params.textDocument.uri); return; }
  if (method === "textDocument/diagnostic") { send({ id, result: { kind: "full", items: errors(docs.get(params.textDocument.uri) ?? "") } }); return; }
  if (method === "textDocument/formatting" || method === "textDocument/rangeFormatting") {
    if (process.env.FAKE_LSP_FORMAT_ERROR) { send({ id, error: { code: -32603, message: "rustfmt.toml: unknown key `max_widht`" } }); return; }
    const lines = (docs.get(params.textDocument.uri) ?? "").split("\n");
    const from = params.range?.start.line ?? 0, to = params.range?.end.line ?? lines.length - 1;
    send({ id, result: trimmed(lines, from, to) });
    return;
  }
  if (method === "shutdown") { send({ id, result: null }); return; }
  if (method === "exit") process.exit(0);
  if (id !== undefined) send({ id, error: { code: -32601, message: `no method ${String(method)}` } });
};

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString("ascii"))?.[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const message = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
    buffer = buffer.subarray(start + length);
    if (message.method === "initialized") continue;
    answer(message);
  }
});
