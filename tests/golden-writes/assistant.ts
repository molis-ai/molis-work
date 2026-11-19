import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** assistant/assistant.db, through the settings entry the budget page uses. */
export default async function ({ http, tag }: GoldenWriteContext) {
  const daily_tokens = tag === "seed" ? 120000 : 130000;
  const { values } = await http("/api/assistant/preferences", { method: "GET" }) as import("@molis-ai/molis-work-contracts/platform/settings").SettingsValues;
  const current = values.find(value => value.key === "assistant.daily_tokens")!;
  await http("/api/assistant/preferences", { body: { key: current.key, layer: "personal", change: { set: daily_tokens },
    expected_revision: current.revision, request_id: "golden-budget-" + tag } });
  readsBack(await http("/api/assistant/usage", { method: "GET" }), String(daily_tokens));
}
