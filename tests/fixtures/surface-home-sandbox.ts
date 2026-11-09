import { defineSubjectContextAction, subjectContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePresentationOverviewAction, definePresentationValuesAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { PluginComponentNode, PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import { signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxActionId, sandboxPackageBuildId, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { newPublisher, packageContract, packageFiles, payloadOf } from "./sandbox-package.js";

export function presentingPackage(scope: "project" | "home", delegated: readonly ActionDefinition[], editorDialog = false) {
  const publisher = newPublisher(), contract = packageContract(), build = sandboxPackageBuildId(contract.pluginId, publisher.identity);
  const kind = "sandbox-home-note", subject = { kind, id: "1" };
  const start = (id: string) => ({ capability_id: sandboxActionId(build, id), version: 1 });
  const add = contract.operations.find(item => item.id === "notes.add")!;
  // Both real writers read the old list before appending; both effects are part of their approval.
  add.effects = { storage: ["read", "write"], ...(delegated[0] ? { capabilities: [delegated[0].capability_id] } : {}) };
  const alternate = delegated[1];
  if (alternate) {
    contract.operations.push({ ...add, id: "notes.alternate", effects: { storage: ["read", "write"], capabilities: [alternate.capability_id] } });
    contract.pages[0]!.regions[0]!.operationIds.push("notes.alternate");
  }
  const overview = definePresentationOverviewAction(sandboxActionId(build, "notes.overview"), 1, "Notes overview", [], scope);
  const output = { summary: { literal: "Add your first note" }, subjects: [], start: [start("notes.add")] };
  contract.operations.push({ id: "notes.overview", kind: "query", read_protocol: { kind: "presentation_overview" },
    input: overview.action.input_schema, output: overview.action.output_schema!, errors: [], effects: editorDialog ? { storage: ["read"] } : {}, examples: [{ input: {}, output }] });
  if (editorDialog) {
    const context = defineSubjectContextAction(sandboxActionId(build, "notes.context"), 1, kind, "Note context", [], scope);
    const values = definePresentationValuesAction(sandboxActionId(build, "notes.values"), 1, [kind], "Note fields", [], scope);
    contract.operations.push(
      { id: "notes.context", kind: "query", read_protocol: { kind: "subject_context", subject_kind: kind }, input: context.action.input_schema,
        output: context.action.output_schema!, errors: [], effects: { storage: ["read"] }, examples: [{ input: { subject_id: subject.id },
          output: subjectContext({ subject, revision: "1", title: "A note", content: "A note", open: { surface: "workbench", id: subject.id } }) }] },
      { id: "notes.values", kind: "query", read_protocol: { kind: "presentation_values", subject_kinds: [kind] }, input: values.action.input_schema,
        output: values.action.output_schema!, errors: [], effects: { storage: ["read"] }, examples: [{ input: { subjects: [subject], fields: ["title"] },
          output: { items: [{ subject, revision: "1", state: "ok", values: { title: "A note" } }] } }] },
    );
  }
  contract.presentation = { objects: editorDialog ? [{ kind, fields: [{ key: "title", role: "title" }], forms: { row: { fields: ["title"] } } }] : [], overview: { capability_id: overview.capability_id, version: overview.version,
    start: [{ ...start("notes.add"), open: { view_id: "app", panel: "editor" } },
      ...(alternate ? [{ ...start("notes.alternate"), open: { view_id: "app", panel: "alternate-editor" } }] : [])] } };
  const { files, manifest } = packageFiles(publisher.identity);
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  files[SANDBOX_PACKAGE_FILES.entrypoint] += `
operations["notes.overview"] = async () => (${JSON.stringify(output)});
const appendNote = operations["notes.add"];
`;
  if (editorDialog) files[SANDBOX_PACKAGE_FILES.entrypoint] += `
const noteKind = ${JSON.stringify(kind)};
const noteRecords = sdk => operations["notes.list"]({}, sdk);
operations["notes.overview"] = async (_input, sdk) => ({
  ...${JSON.stringify(output)}, subjects: (await noteRecords(sdk)).slice(-5).map(note => ({ kind: noteKind, id: note.id })),
});
operations["notes.context"] = async ({ subject_id }, sdk) => {
  const note = (await noteRecords(sdk)).find(note => note.id === subject_id);
  if (!note) throw Error("Note not found");
  return { subject: { kind: noteKind, id: note.id }, revision: note.id, title: note.text, content: note.text, truncated: false,
    open: { surface: "workbench", id: note.id } };
};
operations["notes.values"] = async ({ subjects, fields }, sdk) => {
  const notes = await noteRecords(sdk);
  return { items: subjects.map(subject => {
    const note = notes.find(note => note.id === subject.id);
    return note ? { subject, revision: note.id, state: "ok", values: fields.includes("title") ? { title: note.text } : {} }
      : { subject, revision: "0", state: "deleted" };
  }) };
};
`;
  delegated.forEach((definition, index) => {
    const operation = index === 0 ? "notes.add" : "notes.alternate";
    files[SANDBOX_PACKAGE_FILES.entrypoint] += `
operations[${JSON.stringify(operation)}] = async (input, sdk) => {
  await sdk.capability.call(${JSON.stringify(definition.capability_id)}, null);
  return appendNote(input, sdk);
};`;
  });
  if (alternate || editorDialog) {
    const plans = JSON.parse(files[SANDBOX_PACKAGE_FILES.interface]!) as { parts: PluginComponentPlan[]; nodes: PluginComponentNode[] };
    const addForm = <T extends PluginComponentPlan>(plan: T): T => ({ ...plan, id: "alternate-editor", submit: { ...plan.submit!, operationId: "notes.alternate" } });
    if (alternate) {
      plans.parts.push(addForm(plans.parts.find(part => part.id === "editor")!));
      plans.nodes.push(addForm(plans.nodes.find(node => node.id === "editor")!));
    }
    if (editorDialog) plans.nodes.find(node => node.id === "editor")!.kind = "dialog";
    files[SANDBOX_PACKAGE_FILES.interface] = JSON.stringify(plans);
  }
  const derived = sandboxPluginManifest({ contract, pluginId: manifest.plugin_id, name: manifest.name, version: manifest.version, publisher: manifest.publisher,
    ...(scope === "home" ? { runtime: { scope } } : {}) });
  return signPluginPackage({ payload: payloadOf(derived, files), signature: null, publisher_key: null }, publisher.signer);
}
