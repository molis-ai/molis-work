/**
 * Reading what a recording child prints (BL-1000). A pipe hands its bytes over in chunks cut anywhere, also inside a character
 * (a Chinese character is three bytes, an emoji four), so a chunk is never turned into a string on its own: the stream decodes
 * as UTF-8 and keeps a cut character's first bytes until the rest arrives.
 */
import type { Readable } from "node:stream";

/** Calls `onText` with all the text read so far, each time more arrives. */
export function accumulateText(stream: Readable | null | undefined, onText: (soFar: string) => void): void {
  if (!stream) return;
  let text = "";
  stream.setEncoding("utf8");
  stream.on("data", (part: string) => { text += part; onText(text); });
}

/** Calls `onLine` once, with the first whole line (without its newline): the child's handshake. */
export function onFirstLine(stream: Readable | null | undefined, onLine: (line: string) => void): void {
  let done = false;
  accumulateText(stream, text => {
    const end = text.indexOf("\n");
    if (done || end < 0) return;
    done = true;
    onLine(text.slice(0, end));
  });
}
