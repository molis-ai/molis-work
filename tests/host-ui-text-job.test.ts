import assert from "node:assert/strict";
import test from "node:test";
import { rememberUiLocale, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { jobProbe } from "./fixtures/plugin-jobs.js";

test("FSS-69 kept jobs read their Home language while their initiating page is still active", { timeout: 30_000 }, async context => {
  const probe = jobProbe("localejob");
  const f = await serveHomeRuntime(context, { pluginFixtures: { home: [probe.definition] } });
  const action = f.host.homeActionClient();
  for (const [homeLocale, pageLocale, expected] of [["en", "zh", "Save"], ["zh", "en", "保存"]] as const) {
    rememberUiLocale(f.home, homeLocale);
    const entered = Promise.withResolvers<string>();
    // The active page waits for the job to start. A job that simply inherits its asynchronous page will see the opposite language.
    probe.behavior.afterKeep = async () => { assert.equal(await entered.promise, expected); };
    probe.behavior.work = async () => { entered.resolve(t.text("workbench.env.save")); };
    await runWithLocale(pageLocale, () => action.invoke({ ...person(probe.permissions), locale: pageLocale }, probe.keep, { id: homeLocale }));
    await probe.kept.at(-1)!.done;
  }
});
