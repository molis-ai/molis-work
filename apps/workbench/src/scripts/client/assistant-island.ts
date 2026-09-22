/** A bounded information assistant; all writes use the plugin's existing commands. */
export const ASSISTANT_ISLAND_FACTORY_SCRIPT = String.raw`(host) => {
  const { translate: L, feedApi } = host;
  const island = document.querySelector("[data-assistant-island]");
  if (!island) return null;
  const toggle = island.querySelector("[data-assistant-toggle]");
  const composer = island.querySelector("[data-assistant-composer]");
  const input = island.querySelector("[data-assistant-input]");
  const send = island.querySelector("[data-assistant-send]");
  const plan = island.querySelector("[data-assistant-plan]");
  let busy = false;
  if (!toggle || !composer || !input || !send) return null;

  const syncSend = () => {
    send.disabled = busy || !String(input.value || "").trim();
  };
  const place = () => {
    const rect = toggle.getBoundingClientRect();
    const width = composer.offsetWidth || 300;
    const height = composer.offsetHeight || 32;
    const left = Math.min(rect.right + 8, innerWidth - width - 8);
    const top = Math.max(8, Math.min(rect.top + (rect.height - height) / 2, innerHeight - height - 8));
    composer.style.inset = "auto";
    composer.style.margin = "0";
    composer.style.left = Math.max(8, left) + "px";
    composer.style.top = top + "px";
  };
  const isOpen = () => composer.matches(":popover-open");

  composer.addEventListener("toggle", (event) => {
    const open = event.newState === "open";
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      place();
      syncSend();
      requestAnimationFrame(() => {
        place();
        input.focus();
      });
    }
  });
  input.addEventListener("input", syncSend);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    syncSend();
    if (send.disabled) return;
    composer.requestSubmit(send);
  });
  const note = (message) => {
    const p = document.createElement("p"); p.textContent = message; plan.append(p); place(); return p;
  };
  const actionButton = (label, action) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary";
    button.textContent = L(label); plan.append(button);
    button.onclick = async () => {
      button.disabled = true;
      try { await action(button); } catch (error) { note(error.message); button.disabled = false; }
      place();
    };
    return button;
  };
  const presentPlan = (result) => {
    note(result.message);
    const action = result.action;
    if (!action) return;
    const description = document.createElement("blockquote");
    description.textContent = (action.name || action.title) + "\n" + action.instructions;
    plan.append(description);
    if (action.kind === "draft_pages") {
      note(L("所选材料") + "：" + action.entry_ids.length);
      actionButton("检查材料与写作要求", () => { composer.hidePopover(); host.preparePages(action); });
      return;
    }
    let record = null;
    let sample = null;
    actionButton("创建规则草稿并试跑真实样本", async button => {
      const snapshot = await feedApi("/api/feed", "GET");
      sample = snapshot.feed_items.find(item => item.item_id === action.sample_item_id && item.source_id === action.source_id);
      if (!sample) throw new Error(L("样本已不可用，请重新提出规则"));
      if (!record) {
        record = (await feedApi("/api/functions", "POST", { primitive: "choice", name: action.name,
          function_key: "inbox_filter_" + crypto.randomUUID().replaceAll("-", "") })).function;
      }
      record = (await feedApi("/api/functions/" + encodeURIComponent(record.id), "POST", {
        expected_updated_at: record.updated_at, instructions: action.instructions,
        criteria: [{ key: "inbox.admit", description: "符合规则，需要继续处理，进入 Inbox" }, { key: "feed.open", description: "不符合规则，留在 Feed" }],
        scene_id: "feed.capture", subject_kinds: ["feed_item"], scene_map: { "inbox.admit": "inbox.admit", "feed.open": "feed.open" },
      })).function;
      note(L("试跑样本") + "：" + sample.title);
      record = (await feedApi("/api/functions/" + encodeURIComponent(record.id) + "/preview", "POST", {
        expected_updated_at: record.updated_at, input: [sample.title, sample.summary, sample.body || ""].join("\n\n"),
      })).function;
      const preview = record.last_preview;
      note(L("实际试跑结果") + "：" + L(preview?.outcome === "needs_review" ? "需要人工复核" : preview?.choice === "inbox.admit" ? "进入 Inbox" : "留在 Feed") + " · " + (preview?.model || "Jev"));
      button.textContent = L("草稿已创建并试跑");
      actionButton("到 Functions 检查或修改", () => { composer.hidePopover(); host.openItem("functions", record.id, record.name); });
      actionButton("启用规则，处理最近 20 条消息", async enable => {
        if (record.status !== "published") record = (await feedApi("/api/functions/" + encodeURIComponent(record.id) + "/publish", "POST", { expected_updated_at: record.updated_at })).function;
        const existing = (await feedApi("/api/feed/out-rules", "GET")).rules;
        if (!existing.some(rule => rule.enabled && rule.function_key === record.function_key && rule.match.source_id === action.source_id && rule.admission === "inbox")) {
          await feedApi("/api/feed/out-rules", "POST", { name: action.name, source_id: action.source_id, function_key: record.function_key, admission: "inbox" });
        }
        const latest = await feedApi("/api/feed", "GET");
        const ids = latest.feed_items.filter(item => item.source_id === action.source_id).slice(0, 20).map(item => item.item_id);
        if (ids.length) await feedApi("/api/feed/out-rules/evaluate", "POST", { item_ids: ids });
        await host.refresh(); enable.textContent = L("规则已启用");
        note(L("筛选结果与待复核项已进入 Inbox；来源的新消息也会沿用此规则。"));
      });
    });
  };
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = String(input.value || "").trim();
    if (!prompt || busy) return;
    busy = true; syncSend(); plan.replaceChildren();
    note(L("正在结合当前项目的来源和 Inbox 材料拟定方案…"));
    try {
      const selected = document.querySelector("[data-feed-item-id].is-selected")?.dataset.feedItemId;
      const result = await feedApi("/api/assistant/plan", "POST", { prompt, selected_item_id: selected });
      plan.replaceChildren(); presentPlan(result);
    } catch (error) { plan.replaceChildren(); note(error.message); }
    finally { busy = false; syncSend(); place(); }
  });
  island.querySelector("[data-plugin-id]")?.addEventListener("click", () => {
    if (isOpen()) composer.hidePopover();
  });
  addEventListener("resize", () => { if (isOpen()) place(); });
  syncSend();
  return { isOpen };
}`;
