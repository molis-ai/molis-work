import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/** Shared stdio transport for the desktop launcher and embedded action servers. */
export async function serveMcpStdio(options: {
  handleMessage(message: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  input?: Readable;
  output?: Writable;
}): Promise<void> {
  const output = options.output ?? process.stdout;
  const lines = createInterface({ input: options.input ?? process.stdin, crlfDelay: Infinity });
  const write = async (message: Record<string, unknown>) => {
    await new Promise<void>((resolve, reject) => output.write(JSON.stringify(message) + "\n", error => error ? reject(error) : resolve()));
  };
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let message: unknown;
      try { message = JSON.parse(line); }
      catch { await write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); continue; }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        await write({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }); continue;
      }
      const response = await options.handleMessage(message as Record<string, unknown>);
      if (response && Object.hasOwn(message, "id")) await write(response);
    }
  } finally { lines.close(); }
}
