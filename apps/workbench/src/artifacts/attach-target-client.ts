/**
 * 「作为输入」 in a 成果 version's detail (specs/artifact-positioning A4b, PEQ-04): choose a target declared through
 * `placement_relation` in this project and record the version as its fixed input through `/api/placement/*`.
 * Runs inside the workbench's 成果 client and shares its `route`, `readText` and `loadArtifacts`.
 */
export const ARTIFACT_ATTACH_TARGET_CLIENT_SCRIPT = String.raw`
  // Targets declaring a placement_relation are read when the person opens the control, not with every detail.
  document.addEventListener("toggle", async (event) => {
    const box = event.target;
    if (!(box instanceof HTMLDetailsElement) || !box.matches("[data-artifact-attach-target]") || !box.open || box.dataset.loaded === "1") return;
    const form = box.querySelector("[data-artifact-attach-target-form]"), select = box.querySelector("select"), status = box.querySelector("[data-artifact-attach-target-status]");
    const projectId = document.body.dataset.projectId || "";
    try {
      const ref = JSON.parse(form.dataset.artifactReference);
      const object = { kind: "artifact", id: JSON.stringify([ref.artifact_id, ref.version]), project_id: projectId };
      const payload = await molisWorkRequest(route("/api/placement/attach-targets"), { body: { project_id: projectId, object }, fallback: globalThis.t.text("workbench.attach-target-client.could-not-load-targets") });
      const kinds = payload.kinds || [];
      const options = kinds.flatMap((kind) => (kind.targets || []).map((target) => Object.assign(document.createElement("option"), {
        value: JSON.stringify({ kind: kind.kind, id: target.id }),
        textContent: kinds.length > 1 ? kind.noun + " · " + target.title : target.title,
      })));
      select.replaceChildren(...options);
      if (!select.options.length) status.textContent = globalThis.t.text("workbench.attach-target-client.nothing-to-attach-yet");
      box.dataset.loaded = "1";
    } catch (error) { status.textContent = error.message; }
  }, true);
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest?.("[data-artifact-attach-target-form]");
    if (!form) return;
    event.preventDefault();
    const chosen = form.elements.target.value, button = form.querySelector("button[type=submit]"), status = form.querySelector("[data-artifact-attach-target-status]");
    if (!chosen || button.disabled) return;
    button.disabled = true; status.textContent = "";
    try {
      const projectId = document.body.dataset.projectId || "";
      const ref = JSON.parse(form.dataset.artifactReference);
      const target = JSON.parse(chosen);
      const object = { kind: "artifact", id: JSON.stringify([ref.artifact_id, ref.version]), project_id: projectId };
      await molisWorkRequest(route("/api/placement/attach"), { body: { project_id: projectId, object, target, mode: "fixed" }, fallback: globalThis.t.text("workbench.attach-target-client.input-was-not-recorded") });
      // The detail reloads so 「被谁引用」 shows the target.
      void loadArtifacts(artifactPath || route("/artifacts"), true);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
`;
