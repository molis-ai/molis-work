import assert from "node:assert/strict";
import test from "node:test";
import { installHostUiText, registeredBuiltinText, runWithLocale, runWithRegisteredText } from "@molis-ai/molis-work-app-local-host";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { createGoalsRendererFactories } from "@molis-ai/molis-work-plugin-goals/page";

installHostUiText();
const text = registeredBuiltinText(goalsManifest);
assert.ok(text);
const host = createWorkbenchUiHost();

export const withGoalLocale = <T>(tag: string, draw: () => T): T => runWithLocale(tag, () => runWithRegisteredText(text, draw));
export const testGoalUi = (name: string, run: () => void | Promise<void>) => test(name, () => withGoalLocale("zh", run));


/** Goals' contributions as renderers, mounted on the workbench's host the way the page mounts them. */
export const goalsRenderers = createGoalsRendererFactories((contribution_id, surface, model) => host.mountDeclared({ contribution_id, surface, model }).html);
