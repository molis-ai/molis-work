import type { BoundActionClient, ActionSceneBinding, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxActions, type InboxPagesInput, type InboxStatusInput } from "./actions.js";
import type { InboxPluginRouteHandler } from "./routes.js";

export interface InboxJudgmentChoice { readonly function_key: string; readonly name: string }
export interface InboxJudgmentState { readonly function_key: string | null; readonly functions: readonly InboxJudgmentChoice[]; readonly binding?: ActionSceneBinding | null; readonly capabilities?: readonly ActionView[] }
export interface InboxRouteHandlerPorts {
  actions: BoundActionClient;
  changed(): void;
  renderWorkbench?(): string;
}

/** HTTP adapts presentation and legacy parameters; validation and business work belong to actions. */
export function createInboxRouteHandlers(options: InboxRouteHandlerPorts): Record<string, InboxPluginRouteHandler> {
  const run = async <Input, Output>(definition: import("@molis-ai/molis-work-contracts/platform/actions").ActionDefinition<Input, Output>, input: Input) => {
    const body = await options.actions.invoke(definition, input);
    if (definition.operation === "command") options.changed();
    return { status: 200, body };
  };
  return {
    "inbox.list": () => run(inboxActions.list, {}),
    "inbox.entry.status": ({ params, request }) => {
      if (!params.entry_id) return { status: 404, body: { error: "Inbox Entry 不存在", code: "inbox_entry_not_found" } };
      return run(inboxActions.setStatus, { ...request.body, entry_id: params.entry_id,
        expected_revision: request.body.expected_revision == null ? null : Number(request.body.expected_revision) } as InboxStatusInput);
    },
    "inbox.pages.results": () => run(inboxActions.pagesResults, {}),
    "inbox.pages.generate": ({ request }) => run(inboxActions.generatePages, request.body as unknown as InboxPagesInput),
    "inbox.judgment.read": () => run(inboxActions.readJudgment, {}),
    "inbox.judgment.write": ({ request }) => run(inboxActions.writeJudgment, request.body as { function_key: string | null }),
    "inbox.judgment.evaluate": ({ request }) => run(inboxActions.evaluateJudgment, request.body as { entry_ids: string[] }),
    "inbox.workbench": async () => {
      if (!options.renderWorkbench) return { status: 501, body: { error: "Inbox 工作区不可用" } };
      await options.actions.invoke(inboxActions.list, {});
      return { status: 200, html: options.renderWorkbench() };
    },
  };
}
