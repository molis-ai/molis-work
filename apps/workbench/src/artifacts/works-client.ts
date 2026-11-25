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
    document.querySelectorAll("[data-artifact-source-error]").forEach(node => {
      const source = node.dataset.artifactSourceError;
      node.textContent = source ? globalThis.t.text("workbench.browser-ui.reference-source-failed", { source }) : globalThis.t.text("workbench.browser-ui.reference-links-failed");
    });
    document.querySelectorAll("[data-artifact-work-word]").forEach(node => labelWork(node, node.dataset.artifactWorkWord));
  });
  // A server source leaves a row or a retry while it matters. The Assistant arrives separately.
  const updateReferenceEmpty = section => {
    const works = section.querySelector("[data-artifact-works]");
    section.querySelector("[data-artifact-no-references]").hidden = !works?.dataset.complete || !works.hidden || !!section.querySelector("[data-artifact-reference-source]");
  };
  document.addEventListener("click", event => {
    const retry = event.target.closest?.("[data-artifact-reference-retry]");
    if (!retry) return;
    const source = retry.closest("[data-artifact-reference-source]"), holder = source.closest("[data-artifact-detail]");
    const section = source.closest("[data-artifact-links]"), path = holder.dataset.artifactFragmentPath;
    if (!path || source.getAttribute("aria-busy") === "true") return;
    const current = () => source.isConnected && holder.dataset.artifactFragmentPath === path && holder.checkVisibility({ visibilityProperty: true });
    void globalThis.molisBusy(source, async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const html = await molisWorkRequest(path, { as: "text", headers: {
          "x-molis-work-fragment": "artifact-reference-source", "x-molis-work-reference-source": source.dataset.artifactReferenceSource,
        } });
        if (!current()) return;
        const template = document.createElement("template");
        template.innerHTML = html;
        const result = template.content.querySelector("[data-artifact-reference-response]");
        if (!result || result.lang !== document.documentElement.dataset.uiLanguageTag) continue;
        const focus = document.activeElement === retry, target = result.querySelector("a,button") || section.querySelector("h2");
        source.replaceWith(...result.childNodes);
        updateReferenceEmpty(section);
        if (focus) target.focus({ preventScroll: true });
        return;
      }
    }).catch(() => { /* The existing source error and its retry stay available. */ });
  });
  const loadArtifactWorks = async (known = new Map()) => {
    const box = detail.querySelector("[data-artifact-works]");
    if (!box) return;
    let subjects = [];
    try { subjects = JSON.parse(box.dataset.artifactWorks || "[]"); } catch { return; }
    const section = box.closest("[data-artifact-links]"), status = section.querySelector("[data-artifact-works-status]");
    if (box.dataset.busy) return;
    box.dataset.busy = "true";
    delete box.dataset.complete;
    updateReferenceEmpty(section);
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
    if (!failed) box.dataset.complete = "true";
    box.hidden = !unique.length;
    updateReferenceEmpty(section);
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
