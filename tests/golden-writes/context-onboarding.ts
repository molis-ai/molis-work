import { diagnoseGoldenHttp, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** context-onboarding/context-onboarding.db */
export default async function ({ http: originalHttp }: GoldenWriteContext) {
  const http = diagnoseGoldenHttp(originalHttp);
  const id = crypto.randomUUID();
  await http("/api/onboarding/context", { body: { id } });
  await http(`/api/onboarding/context/${id}/selection`, { body: { sources: [], previewed: true } });
  readsBack(await http(`/api/onboarding/context/${id}`, { method: "GET" }), `"previewed":true`);
}
