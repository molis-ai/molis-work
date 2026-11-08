import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

const POLLS = 300, POLL_MILLISECONDS = 100;

/** A real conversation on the model settings saved just before this (the scripted model of scripts/golden/session.mjs): the rounds and the runtime's records of them. */
export default async function ({ http, tag }: GoldenWriteContext) {
  const sent = await http("/api/assistant/send", { body: { text: `金样对话 ${tag}`, request_id: crypto.randomUUID(), scope: { kind: "personal" } } });
  const route = `/api/assistant/works/${encodeURIComponent(sent.work.work_id)}`;
  // Counted and not timed: the clock stands still while a golden is generated.
  for (let poll = 0; poll < POLLS && (await http(route, { method: "GET" })).work.state === "running"; poll++) await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
  readsBack(await http(route, { method: "GET" }), "金样回答");
}
