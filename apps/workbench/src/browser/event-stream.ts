interface StreamEvents {
  message(data: string, name: string): void;
  id?(id: string): void;
  retry?(delay: number): void;
}

/** The SSE framing used by both bound plugin ports and Home appearance invalidation. */
export async function readEventStream(body: ReadableStream<Uint8Array>, events: StreamEvents): Promise<void> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = "", data: string[] = [], eventName = "message";
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/u, ""); buffer = buffer.slice(end + 1);
        if (!line) {
          if (data.length) events.message(data.join("\n"), eventName);
          data = []; eventName = "message"; continue;
        }
        const colon = line.indexOf(":"), field = colon < 0 ? line : line.slice(0, colon), value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
        if (field === "data") data.push(value);
        else if (field === "event") eventName = value || "message";
        else if (field === "id" && !value.includes("\0")) events.id?.(value);
        else if (field === "retry" && /^\d+$/u.test(value)) events.retry?.(Math.min(30_000, Math.max(250, Number(value))));
      }
    }
  } finally { await reader.cancel(); }
}
