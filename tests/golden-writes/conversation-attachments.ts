import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** A one-pixel PNG: the attachment's bytes go to blobs/ by their hash, its row to the library. */
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=";

/** conversation-attachments/conversation-attachments.db and blobs/, through the assistant's attachment entry (S-conversation-attachments). */
export default async function ({ http, tag }: GoldenWriteContext) {
  const name = `golden-${tag}.png`;
  readsBack(await http("/api/assistant/attachments", { body: { name, data: PIXEL } }), name);
}
