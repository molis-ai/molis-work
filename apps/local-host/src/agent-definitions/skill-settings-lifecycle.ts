import { homeAgentDefinitions } from "./builtin-registrations.js";
import { heldInstalls } from "../plugin-holders.js";

/** A Home installation supplies the scopes without their own installation. Project installations keep their own choices. */
export function reconcileSkillSettings(home: string, scope: string, installId: string, kept: readonly string[] | null): void {
  const store = homeAgentDefinitions(home).skills;
  let scopes = [scope];
  if (scope === "home") {
    const independent = new Set(heldInstalls(home).filter(row => row.scope.kind === "project" && row.record.install_id === installId && row.record.state !== "uninstalled")
      .map(row => row.scope.kind === "project" ? row.scope.project_id : "home"));
    scopes = store.scopes(installId).filter(value => !independent.has(value));
  }
  for (const target of scopes) {
    if (kept === null) store.forget(target, installId);
    else store.keep(target, installId, kept);
  }
}
