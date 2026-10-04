/**
 * 「交给助理 / Coding」 in a 成果 version's detail (specs/artifact-positioning 五.1): the person's click hands the version to
 * the Assistant as material of a new work — its subject, so the work is listed under 「被谁引用」, and the text the detail
 * shows. Coding takes it only where the project has Coding. Runs inside the workbench's 成果 client and shares its `L` and `detail`.
 */
export const ARTIFACT_HANDOFF_CLIENT_SCRIPT = String.raw`
  const showHandoff = () => {
    const coding = Boolean(document.querySelector('.plugin-rail-items [data-plugin-id="coding"]'));
    detail.querySelectorAll('[data-artifact-hand="coding"]').forEach((button) => { button.hidden = !coding; });
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-artifact-hand]");
    const row = button?.closest("[data-artifact-handoff]");
    if (!row) return;
    const title = row.dataset.artifactTitle || "", version = Number(row.dataset.artifactVersion);
    const shown = detail.querySelector("[data-artifact-business-preview], .artifact-document-preview");
    const text = ((shown && shown.innerText) || title).trim().slice(0, 20000);
    window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
      message_id: crypto.randomUUID(), purpose: "delegate", source: { surface: "artifacts", title: L("成果") },
      object: { kind: "artifact", id: row.dataset.artifactSubject, title, version },
      materials: [{ title: L("成果「{title}」第 {version} 版").replace("{title}", title).replace("{version}", String(version)), text }],
      ...(button.dataset.artifactHand === "coding" ? { executor: "coding" } : {}),
    } }));
  });
`;
