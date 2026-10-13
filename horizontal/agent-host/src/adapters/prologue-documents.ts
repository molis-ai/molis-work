import type { ExactRef, Runtime } from "@prologue/sdk";

/** This port returns text, so neither the source bytes nor its derived resource have a consumer. */
export async function parsePrologueDocument(runtime: Runtime, input: { bytes: Uint8Array; name: string }) {
  const stage = runtime.resources.stage({ mediaKind: "binary", byteLength: input.bytes.byteLength, label: input.name.slice(0, 120) || "attachment" });
  let derived: ExactRef<"resource"> | undefined;
  try {
    stage.write(input.bytes);
    await stage.publishDurable();
    const parsed = await runtime.parseResource({ ref: stage.ref });
    derived = parsed.ref;
    return { text: parsed.text, truncated: parsed.truncated, ...(parsed.pages !== undefined ? { pages: parsed.pages } : {}) };
  } finally {
    // Try both even when releasing the derived bytes fails. The SDK also cancels unfinished durable publication.
    try { if (derived) await runtime.resources.revoke(derived); }
    finally { await runtime.resources.revoke(stage.ref); }
  }
}
