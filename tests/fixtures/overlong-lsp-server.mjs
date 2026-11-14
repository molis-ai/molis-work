#!/usr/bin/env node
// A broken language server: it answers the first frame with a body length no Host accepts, to prove the client bounds the frame instead
// of waiting for (or buffering) a body that will never fit.
let buffer = Buffer.alloc(0);
process.stdin.on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.indexOf("\r\n\r\n") < 0) return;
  process.stdout.write("Content-Length: 999999999\r\n\r\n");
  setTimeout(() => process.exit(0), 50);
});
