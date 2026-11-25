/**
 * 「被谁引用」's Assistant works in a 成果 version's detail (specs/artifact-positioning 五.1): the works that started from this
 * version, took it as material or produced it, read from the Assistant once the detail shows. Each opens in the Assistant.
 * Runs inside the workbench's 成果 client and shares its `route`, `readText` and `detail`.
 */
export const ARTIFACT_WORKS_CLIENT_SCRIPT = String.raw`
  const workLabels = {
    origin: () => globalThis.t.text("workbench.works-client.started-version"),
    material: () => globalThis.t.text("workbench.works-client.material"),
    result: () => globalThis.t.text("workbench.works-client.work-result"),
    assistant: () => globalThis.t.text("workbench.works-client.assistant-work"),
    reading: () => globalThis.t.text("workbench.works-client.reading-references"),
    incomplete: () => globalThis.t.text("workbench.works-client.references-incomplete"),
    retry: () => globalThis.t.text("common.control.retry"),
  };
  const labelWork = (node, word) => {
    node.dataset.artifactWorkWord = word;
    node.textContent = workLabels[word]();
  };
  document.addEventListener("molis-work:language-changed", () => {
    detail?.querySelectorAll("[data-artifact-work-word]").forEach(node => labelWork(node, node.dataset.artifactWorkWord));
  });
  const loadArtifactWorks = async (known = new Map()) => {
    const box = detail.querySelector("[data-artifact-works]");
    if (!box) return;
    let subjects = [];
    try { subjects = JSON.parse(box.dataset.artifactWorks || "[]"); } catch { return; }
    const section = box.closest("[data-artifact-links]"), status = section.querySelector("[data-artifact-works-status]");
    const empty = section.querySelector("[data-artifact-no-references]");
    if (box.dataset.busy) return;
    box.dataset.busy = "true";
    if (empty) empty.hidden = true;
    const message = document.createElement("span");
    labelWork(message, "reading");
    status.replaceChildren(message);
    const missing = subjects.filter(id => !known.has(id));
    const settled = await Promise.allSettled(missing.map(async id => {
      const payload = await molisWorkRequest(route("/api/assistant/related?kind=artifact&id=" + encodeURIComponent(id)));
      if (!Array.isArray(payload?.works)) throw Error();
      return payload.works;
    }));
    if (!box.isConnected) return;
    delete box.dataset.busy;
    const failed = settled.some(result => result.status === "rejected");
    settled.forEach((result,index) => { if (result.status === "fulfilled") known.set(missing[index], result.value); });
    const found = subjects.flatMap(id => known.get(id) || []);
    status.replaceChildren();
    if (failed) {
      const retry = document.createElement("button");
      retry.type = "button"; retry.className = "mw-btn mw-btn--ghost";
      labelWork(retry, "retry");
      retry.addEventListener("click", () => { if (box === detail.querySelector("[data-artifact-works]")) void loadArtifactWorks(known); });
      labelWork(message, "incomplete");
      status.append(message, " ", retry);
    }
    // A work can relate to the version more than once (where it started, and what it made): list it once, by its first relation.
    const works = found.filter((work) => ["origin", "material", "result"].includes(work.relation));
    const unique = works.filter((work, index) => works.findIndex((other) => other.work_id === work.work_id) === index);
    if (empty) empty.hidden = failed || unique.length > 0;
    box.hidden = !unique.length;
    box.querySelector("ul").replaceChildren(...unique.map((work) => {
      const row = document.createElement("li"), open = document.createElement("button"), role = document.createElement("span");
      open.type = "button"; open.className = "artifact-link-work"; open.dataset.artifactOpenWork = work.work_id;
      if (work.title) open.textContent = work.title;
      else labelWork(open, "assistant");
      labelWork(role, work.relation);
      row.append(open, role);
      return row;
    }));
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-artifact-open-work]");
    if (!button) return;
    document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { work_id: button.dataset.artifactOpenWork } }));
  });
`;
