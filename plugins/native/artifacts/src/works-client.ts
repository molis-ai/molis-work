/**
 * 「被谁引用」's Assistant works in a 成果 version's detail (specs/artifact-positioning 五.1): the works that started from this
 * version, took it as material or produced it, read from the Assistant once the detail shows. Each opens in the Assistant.
 * Runs inside the workbench's 成果 client and shares its `route`, `L` and `detail`.
 */
export const ARTIFACT_WORKS_CLIENT_SCRIPT = String.raw`
  const WORK_RELATIONS = { origin: L("从这一版开始"), material: L("作为材料"), result: L("工作结果") };
  const loadArtifactWorks = async () => {
    const box = detail.querySelector("[data-artifact-works]");
    if (!box) return;
    let subjects = [];
    try { subjects = JSON.parse(box.dataset.artifactWorks || "[]"); } catch { return; }
    const found = await Promise.all(subjects.map((id) => fetch(route("/api/assistant/related?kind=artifact&id=" + encodeURIComponent(id)), { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { works: [] }).then((payload) => payload.works || []).catch(() => [])));
    // A work can relate to the version more than once (where it started, and what it made): list it once, by its first relation.
    const works = found.flat().filter((work) => WORK_RELATIONS[work.relation]);
    const unique = works.filter((work, index) => works.findIndex((other) => other.work_id === work.work_id) === index);
    if (!unique.length || !box.isConnected) return;
    box.querySelector("ul").replaceChildren(...unique.map((work) => {
      const row = document.createElement("li"), open = document.createElement("button"), role = document.createElement("span");
      open.type = "button"; open.className = "artifact-link-work"; open.dataset.artifactOpenWork = work.work_id; open.textContent = work.title || L("助理工作");
      role.textContent = WORK_RELATIONS[work.relation];
      row.append(open, role);
      return row;
    }));
    box.hidden = false;
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-artifact-open-work]");
    if (!button) return;
    document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { work_id: button.dataset.artifactOpenWork } }));
  });
`;
