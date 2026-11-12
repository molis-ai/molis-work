import { readFileSync } from "node:fs";
import type { ChromePage } from "@molis-ai/molis-work-test-kit/browser";

/** The browser factory used by Coding's mount, with the same SDK and formatters. */
export function codingTranscriptBundle() {
  return readFileSync(new URL("../../plugins/native/coding/dist/transcript-bundle.js", import.meta.url), "utf8").trim();
}

export async function mountCodingTranscript(page: ChromePage) {
  await page.evaluate(`globalThis.codingTranscript = (${codingTranscriptBundle()})({ readText: globalThis.t.text, turns: document.body,
    lifetime: { listen: (target, event, listener) => target.addEventListener(event, listener) } }); true`);
}
