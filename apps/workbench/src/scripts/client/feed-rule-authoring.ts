import { FEED_CAPTURE_SCENE_ID, FEED_OPEN_BEHAVIOR_ID, INBOX_ADMIT_BEHAVIOR_ID } from '@molis-ai/molis-work-contracts/modules/functions';

/** Feed composes the public Functions authoring API; Functions owns every AI draft and published rule. */
export const FEED_RULE_AUTHORING_SCRIPT = `
    const feedRuleDrafts = new Map();
    const feedRuleKey = (section) => route("/") + ":feed-rule:" + section.dataset.feedOutRules;
    const feedRuleFields = ["data-feed-out-rule-name", "data-feed-out-rule-contains", "data-feed-rule-instructions", "data-feed-out-rule-function-key", "data-feed-out-rule-admission"];
    const feedRuleState = (section) => {
      const key = feedRuleKey(section);
      if (!feedRuleDrafts.has(key)) {
        let saved = {};
        try { saved = JSON.parse(sessionStorage.getItem(key) || "{}"); } catch {}
        feedRuleDrafts.set(key, saved);
      }
      return feedRuleDrafts.get(key);
    };
    const rememberFeedRule = (section) => {
      const state = feedRuleState(section);
      state.mode = section.dataset.ruleMode || "keyword";
      state.fields = Object.fromEntries(feedRuleFields.map(attr => [attr, section.querySelector("[" + attr + "]")?.value || ""]));
      try { sessionStorage.setItem(feedRuleKey(section), JSON.stringify(state)); } catch {}
    };
    const setFeedRuleMode = (section, mode) => {
      section.dataset.ruleMode = mode;
      section.querySelectorAll("[data-feed-rule-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.feedRuleMode === mode)));
      section.querySelectorAll("[data-feed-rule-field]").forEach(field => field.hidden = field.dataset.feedRuleField !== mode);
    };
    const hydrateFeedRuleDrafts = () => {
      feedSourcesDialog?.querySelectorAll("[data-feed-out-rules]").forEach(section => {
        const composer = section.querySelector("[data-feed-rule-composer]");
        if (!composer || composer.dataset.hydrated) return;
        const state = feedRuleState(section);
        for (const [attr, value] of Object.entries(state.fields || {})) { const field = section.querySelector("[" + attr + "]"); if (field) field.value = value; }
        setFeedRuleMode(section, state.mode || "keyword");
        composer.dataset.hydrated = "true";
      });
    };
    document.addEventListener("input", event => {
      const section = event.target.closest?.("[data-feed-out-rules]");
      if (section && event.target.closest("[data-feed-rule-composer]")) rememberFeedRule(section);
    });
    document.addEventListener("change", event => {
      const section = event.target.closest?.("[data-feed-out-rules]");
      if (section && event.target.closest("[data-feed-rule-composer]")) rememberFeedRule(section);
    });
    const feedRuleStatus = (section, message, error = false) => {
      const node = section.querySelector("[data-feed-rule-status]");
      if (node) { node.textContent = message; node.hidden = !message; node.dataset.error = String(error); }
    };
    const readFeedRule = (section) => {
      const value = attr => String(section.querySelector("[" + attr + "]")?.value || "").trim();
      const mode = section.dataset.ruleMode || "keyword";
      const instructions = value("data-feed-rule-instructions");
      const contains = mode === "keyword" ? value("data-feed-out-rule-contains") : "";
      const functionKey = mode === "existing" ? value("data-feed-out-rule-function-key") : "";
      if (mode === "keyword" && !contains) throw new Error(L("填写一个关键词，再预览匹配结果。"));
      if (mode === "natural" && !instructions) throw new Error(L("先描述你想捕捉什么消息。"));
      if (mode === "existing" && !functionKey) throw new Error(L("请选择一条已发布规则。"));
      return { mode, instructions, contains, functionKey, name: value("data-feed-out-rule-name") || contains || instructions.slice(0, 40), admission: value("data-feed-out-rule-admission") || "suggest" };
    };
    const ensureFeedFunctionDraft = async (section, rule) => {
      const state = feedRuleState(section);
      const content = JSON.stringify({ name: rule.name, instructions: rule.instructions });
      if (state.function?.status === "published" && state.functionContent !== content) { delete state.function; delete state.functionKey; delete state.previewContent; }
      if (!state.function) {
        state.functionKey ||= "feed_rule_" + crypto.randomUUID().replaceAll("-", "");
        try {
          state.function = (await feedApi("/api/functions", "POST", { name: rule.name, function_key: state.functionKey, primitive: "noul" })).function;
        } catch (error) {
          // A response may have been lost after create. Recover that exact draft on retry.
          const listed = await feedApi("/api/functions", "GET");
          state.function = listed.functions.find(fn => fn.function_key === state.functionKey);
          if (!state.function) throw error;
        }
        rememberFeedRule(section);
      }
      if (state.functionContent !== content) {
        const fn = state.function;
        state.function = (await feedApi("/api/functions/" + encodeURIComponent(fn.id), "POST", {
          updated_at: fn.updated_at,
          name: rule.name, instructions: rule.instructions,
          criteria: { true_description: "符合用户描述，值得关注。", false_description: "不符合用户描述，无需关注。" },
          scene_id: ${JSON.stringify(FEED_CAPTURE_SCENE_ID)}, subject_kinds: ["feed_item"],
          scene_map: { true: ${JSON.stringify(INBOX_ADMIT_BEHAVIOR_ID)}, false: ${JSON.stringify(FEED_OPEN_BEHAVIOR_ID)} }
        })).function;
        state.functionContent = content;
        delete state.previewContent;
        rememberFeedRule(section);
      }
      return state.function;
    };
    const handleFeedRuleAction = async (target) => {
      const modeButton = target.closest("[data-feed-rule-mode]");
      if (modeButton) {
        const section = modeButton.closest("[data-feed-out-rules]");
        setFeedRuleMode(section, modeButton.dataset.feedRuleMode); rememberFeedRule(section);
        section.querySelector("[data-feed-rule-preview]").hidden = true;
        feedRuleStatus(section, ""); return true;
      }
      const button = target.closest("[data-feed-rule-preview-run], [data-feed-out-rule-create]");
      if (!button) return false;
      const section = button.closest("[data-feed-out-rules]");
      const composer = section.querySelector("[data-feed-rule-composer]");
      if (composer.getAttribute("aria-busy") === "true") return true;
      const preview = button.hasAttribute("data-feed-rule-preview-run");
      composer.setAttribute("aria-busy", "true"); composer.inert = true;
      feedRuleStatus(section, L(preview ? "正在预览最近的消息…" : "正在保存规则…"));
      try {
        const rule = readFeedRule(section);
        const state = feedRuleState(section);
        if (preview) {
          const result = await feedApi("/api/feed/out-rules/preview", "POST", { source_id: section.dataset.feedOutRules, contains: rule.contains });
          if (!result.samples.length) throw new Error(L("还没有可预览的消息。先拉取来源内容，再试一次。"));
          if (rule.mode === "natural") {
            const settings = await feedApi("/api/functions/settings", "GET");
            if (!settings.has_credential) throw new Error(L("AI 判断还未连接。请在 Connectors 配置 TypeSafe，并在 Functions 选择该连接；当前输入已保留。"));
            await ensureFeedFunctionDraft(section, rule);
          }
          const rows = [];
          for (const sample of result.samples) {
            let matched = sample.matched;
            let needsReview = false;
            if (rule.mode === "natural") {
              const fn = state.function;
              state.function = (await feedApi("/api/functions/" + encodeURIComponent(fn.id) + "/preview", "POST", { input: sample.input, updated_at: fn.updated_at })).function;
              const evaluated = state.function.last_preview;
              needsReview = evaluated.outcome !== "ok";
              matched = !needsReview && evaluated.noul >= 0.5;
              rememberFeedRule(section);
            } else if (rule.mode === "existing") {
              const evaluated = await feedApi("/api/functions/by-key/" + encodeURIComponent(rule.functionKey) + "/invoke", "POST", { input: sample.input });
              const described = await feedApi("/api/functions", "GET");
              const fn = described.functions.find(fn => fn.function_key === rule.functionKey);
              const key = fn?.primitive === "noul" ? (evaluated.data?.noul >= 0.5 ? "true" : "false") : evaluated.data?.choice;
              needsReview = evaluated.status !== "ok";
              matched = !needsReview && (fn?.scene_map?.[key] || key) === ${JSON.stringify(INBOX_ADMIT_BEHAVIOR_ID)};
            }
            rows.push({ title: sample.title, matched, needsReview });
          }
          if (rule.mode === "natural") { state.previewContent = state.functionContent; rememberFeedRule(section); }
          const output = section.querySelector("[data-feed-rule-preview]");
          output.replaceChildren();
          const heading = document.createElement("strong");
          heading.textContent = L("最近 {count} 条消息的预览", { count: rows.length }); output.append(heading);
          for (const row of rows) {
            const line = document.createElement("div"); line.className = "feed-rule-preview-row";
            const title = document.createElement("span"); title.textContent = row.title;
            const outcome = document.createElement("span"); outcome.className = "feed-rule-preview-outcome";
            outcome.textContent = L(row.needsReview ? "待复核" : row.matched ? "匹配" : "不匹配");
            outcome.dataset.match = String(row.matched); line.append(title, outcome); output.append(line);
          }
          output.hidden = false;
          feedRuleStatus(section, L("预览完成，未改变消息或 Inbox。"));
        } else {
          if (rule.mode === "natural") {
            const content = JSON.stringify({ name: rule.name, instructions: rule.instructions });
            if (!state.function || state.previewContent !== content) throw new Error(L("请先用当前描述预览，再保存并启用。"));
            if (state.function.status !== "published") state.function = (await feedApi("/api/functions/" + encodeURIComponent(state.function.id) + "/publish", "POST", { updated_at: state.function.updated_at })).function;
            rule.functionKey = state.function.function_key;
            rememberFeedRule(section);
          }
          await feedApi("/api/feed/out-rules", "POST", { name: rule.name || L("来源捕捉规则"), contains: rule.contains, source_id: section.dataset.feedOutRules, admission: rule.admission, function_key: rule.functionKey || null });
          feedRuleDrafts.delete(feedRuleKey(section));
          try { sessionStorage.removeItem(feedRuleKey(section)); } catch {}
          section.querySelectorAll("[data-feed-rule-composer] input, [data-feed-rule-composer] textarea").forEach(field => field.value = "");
          delete composer.dataset.hydrated;
          section.querySelector("[data-feed-rule-preview]").hidden = true;
          feedRuleStatus(section, "");
          await refreshFeedStage(); hydrateFeedRuleDrafts();
          showToast(L("规则已启用，将处理新消息和更新。"));
          feedRuleStatus(section, "");
        }
      } catch (error) { feedRuleStatus(section, error.message || L("规则操作失败，输入已保留，请重试。"), true); }
      finally { composer.removeAttribute("aria-busy"); composer.inert = false; }
      return true;
    };
`;
