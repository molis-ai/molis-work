/**
 * 「交给助理 / 执行插件」 in a 成果 version's detail (specs/artifact-positioning 五.1, PEQ-09): the person's click hands the
 * version to the Assistant or to any discovered work-executor plugin as material of a new work — its subject, so the work is
 * listed under 「被谁引用」, and the text the detail shows. Runs inside the workbench's 成果 client and shares its `readText` and `detail`.
 */
export const ARTIFACT_HANDOFF_CLIENT_SCRIPT = String.raw`
  const showHandoff = () => {
    detail.querySelectorAll("[data-artifact-executor]").forEach((button) => {
      const id = button.dataset.artifactHand || "";
      const tile = id ? document.querySelector('.plugin-rail-items [data-plugin-tile="' + CSS.escape(id) + '"]') : null;
      button.hidden = Boolean(tile && tile.classList.contains("is-available"));
    });
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-artifact-hand]");
    const row = button?.closest("[data-artifact-handoff]");
    if (!row) return;
    const title = row.dataset.artifactTitle || "", version = Number(row.dataset.artifactVersion);
    const shown = detail.querySelector("[data-artifact-business-preview], .artifact-document-preview");
    const text = ((shown && shown.innerText) || title).trim().slice(0, 20000);
    const executor = button.dataset.artifactExecutor || "";
    window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
      message_id: crypto.randomUUID(), purpose: "delegate", source: { surface: "artifacts", title: globalThis.t.text("workbench.handoff-client.result") },
      object: { kind: "artifact", id: row.dataset.artifactSubject, title, version },
      materials: [{ title: globalThis.t.text("workbench.handoff-client.result-title-version-version", { title, version }), text }],
      ...(executor ? { executor } : {}),
    } }));
  });
`;
