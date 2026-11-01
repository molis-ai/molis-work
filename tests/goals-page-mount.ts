import { createWorkbenchUiHost } from "@molis-ai/molis-work-app-workbench";
import { createGoalsRendererFactories } from "@molis-ai/molis-work-plugin-goals/page";

const host = createWorkbenchUiHost();

/** Goals' contributions as renderers, mounted on the workbench's host the way the page mounts them. */
export const goalsRenderers = createGoalsRendererFactories((contribution_id, surface, model) => host.mountDeclared({ contribution_id, surface, model }).html);
