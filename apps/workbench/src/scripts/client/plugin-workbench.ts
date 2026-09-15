/** Workbench composes bundled project entries and exact Artifact contributions. */
export const PLUGIN_WORKBENCH_FACTORY_SCRIPT = `(host) => {
  const { route, translate: L, projectId, setSurface, saveUiState, setMobileView } = host;
  const market = document.querySelector('[data-work-surface="market"]');
  const selector = market.querySelector("[data-market-project]");
  const status = market.querySelector("[data-market-status]");
  const retry = market.querySelector("[data-market-retry]");
  let projects = null, marketRequest = null, adding = false;
  const filter = () => {
    const current = projects?.find(project => project.project_id === selector.value);
    const query = market.querySelector("[data-market-search]").value.trim().toLocaleLowerCase();
    const onlyAdded = market.querySelector("[data-market-added]").checked;
    let count = 0;
    market.querySelectorAll("[data-market-plugin]").forEach(card => {
      const added = Boolean(current?.plugins.includes(card.dataset.marketPlugin));
      card.hidden = (onlyAdded && !added) || !((card.querySelector("h2").textContent + " " + card.querySelector("p").textContent).toLocaleLowerCase().includes(query));
      if (!card.hidden) count++;
      const button = card.querySelector("[data-market-add]");
      button.disabled = !current || added || adding;
      button.textContent = added ? L("已添加") : L("添加到项目");
    });
    market.querySelector("[data-market-empty]").hidden = count > 0;
  };
  const loadMarket = async () => {
    if (marketRequest) return marketRequest;
    if (projects) return;
    status.textContent = L("正在读取项目…"); retry.hidden = true;
    marketRequest = (async () => {
      try {
        const response = await fetch("/api/settings/project-plugins", { cache: "no-store" });
        if (!response.ok) throw new Error(L("无法读取项目插件"));
        projects = (await response.json()).projects;
        selector.replaceChildren(...projects.map(project => new Option(project.display_name, project.project_id)));
        if (projects.some(project => project.project_id === projectId)) selector.value = projectId;
        selector.disabled = !projects.length;
        status.textContent = projects.length ? "" : L("先创建一个项目，再添加插件。");
        filter();
      } catch (error) { status.textContent = error.message; retry.hidden = false; }
      finally { marketRequest = null; }
    })();
    return marketRequest;
  };
  market.addEventListener("input", filter);
  market.addEventListener("change", filter);
  market.addEventListener("click", async event => {
    if (event.target.closest("[data-market-retry]")) { void loadMarket(); return; }
    const button = event.target.closest("[data-market-add]");
    if (!button || button.disabled || adding) return;
    const targetProject = selector.value;
    adding = true; selector.disabled = true; filter();
    status.textContent = L("正在添加…");
    try {
      const response = await fetch("/api/settings/projects/" + encodeURIComponent(targetProject) + "/plugins", {
        method: "POST", headers: globalThis.molisWorkControlHeaders(),
        body: JSON.stringify({ plugin_id: button.dataset.marketAdd }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("无法添加插件"));
      const project = projects.find(project => project.project_id === targetProject);
      project.plugins = result.plugins;
      status.textContent = L("已添加到") + " " + project.display_name;
      if (targetProject === projectId) { saveUiState(); location.reload(); }
    } catch (error) { status.textContent = error.message; }
    finally { adding = false; selector.disabled = false; filter(); }
  });
  const directory = document.querySelector("[data-artifact-directory]");
  const detail = document.querySelector("[data-artifact-detail]");
  const artifactKey = "molis-work-artifact-selection:" + route("/");
  let artifactPath = null, artifactRequest = null;
  try {
    const storedPath = sessionStorage.getItem(artifactKey);
    if (storedPath === route("/artifacts") || storedPath?.startsWith(route("/artifacts/"))) artifactPath = storedPath;
  } catch {}
  const loadArtifacts = async (path = artifactPath || route("/artifacts")) => {
    if (!artifactRequest && artifactPath === path && detail.childElementCount && !detail.querySelector("[data-artifact-retry]")) return;
    artifactRequest?.abort();
    const controller = new AbortController(); artifactRequest = controller;
    const message = document.createElement("p"); message.textContent = L("正在读取成果…"); message.role = "status";
    detail.replaceChildren(message);
    try {
      const response = await fetch(path, { cache: "no-store", headers: { "x-molis-work-fragment": "artifact-workbench" }, signal: controller.signal });
      if (!response.ok && response.status !== 404) throw new Error(L("无法读取成果"));
      const template = document.createElement("template"); template.innerHTML = await response.text();
      const nextDirectory = template.content.querySelector("[data-artifact-directory]");
      const nextDetail = template.content.querySelector("[data-artifact-detail]");
      if (!nextDirectory || !nextDetail) throw new Error(L("无法读取成果"));
      if (controller !== artifactRequest) return;
      directory.replaceChildren(...nextDirectory.childNodes); detail.replaceChildren(...nextDetail.childNodes);
      artifactPath = path;
      try { sessionStorage.setItem(artifactKey, path); } catch {}
    } catch (error) {
      if (controller.signal.aborted) return;
      message.textContent = error.message;
      const button = document.createElement("button"); button.type = "button"; button.dataset.artifactRetry = path; button.textContent = L("重试");
      detail.replaceChildren(message, button);
    } finally { if (controller === artifactRequest) artifactRequest = null; }
  };
  document.addEventListener("click", event => {
    const retryButton = event.target.closest("[data-artifact-retry]");
    if (retryButton) { void loadArtifacts(retryButton.dataset.artifactRetry); return; }
    const link = event.target.closest("a[href]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || link.target) return;
    const url = new URL(link.href);
    const base = route("/artifacts");
    if (url.origin !== location.origin || !(url.pathname === base || url.pathname.startsWith(base + "/"))) return;
    event.preventDefault();
    if (link.closest("[data-frame-block]")) { event.preventDefault(); return; }
    setSurface("artifacts");
    void loadArtifacts(url.pathname);
    if (matchMedia("(max-width: 600px)").matches) setMobileView(url.pathname === base ? "tree" : "document");
  });
  return { open: surface => { if (surface === "market") void loadMarket(); if (surface === "artifacts" && !artifactRequest) void loadArtifacts(); } };
}`;
