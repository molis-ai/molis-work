import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

let appReads = 0;
const codes: unknown[] = [];
for (const root of [undefined, null, "", "relative-runtime", "~/runtime"]) {
  try {
    const options = { ...(root === undefined ? {} : { storageRoot: root }), get app() { appReads++; throw new Error("SDK initialization must not begin"); },
      modelConfiguration: async () => { throw new Error("This fixture cannot call a model"); } };
    const adapter = await Reflect.apply(createPrologueNodeAdapter, undefined, [options]);
    await adapter.close(); codes.push("unexpectedly-started");
  } catch (error) { codes.push(error instanceof Error && "code" in error ? error.code : "no-code"); }
}
process.send?.({ codes, appReads }, () => process.disconnect());
