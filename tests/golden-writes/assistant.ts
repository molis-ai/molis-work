import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** assistant/assistant.db, through the settings entry the budget page uses. */
export default async function ({ http, tag }: GoldenWriteContext) {
  const daily_tokens = tag === "seed" ? 120000 : 130000;
  await http("/api/assistant/budget", { body: { daily_tokens } });
  readsBack(await http("/api/assistant/usage", { method: "GET" }), String(daily_tokens));
}
