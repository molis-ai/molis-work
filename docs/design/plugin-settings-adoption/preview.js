// Review surface only. Applied values and receipts below are simulated per option in this browser.
(() => {
  const K = window.mwKit;
  document.querySelector("#icons").innerHTML = window.mwKitSprite;
  const client = document.createElement("script");
  client.textContent = window.mwKitClient;
  document.body.append(client);
  const params = new URLSearchParams(location.search);
  const option = params.get("option") === "A" ? "A" : "B";
  const key = "molis-proto.plugin-settings-adoption." + option;
  const fresh = () => ({
    phase: "preview", issue: "failed", selected: ["lookback", "report"], results: {},
    lang: "zh", theme: "light", focusRow: "lookback"
  });
  let s;
  try { s = JSON.parse(localStorage.getItem(key)) || fresh(); } catch { s = fresh(); }
  const tr = (cn, en) => s.lang === "en" ? en : cn;
  const names = () => ({
    lookback: [tr("助理回看范围", "Assistant lookback"), tr("近 1 天", "Last day"), tr("近 7 天", "Last 7 days"), tr("目前沿用个人设置", "Currently inherited from personal settings")],
    report: [tr("周报生成时间", "Weekly report time"), tr("每周四 16:00", "Thursdays at 16:00"), tr("每周五 16:00", "Fridays at 16:00"), tr("调整你已开启的周报，按洛杉矶时间", "Reschedules your existing report, in Los Angeles time")],
    shelf: [tr("打开置物架的快捷键", "Open Shelf shortcut"), "⌥Space", "⌥⇧Space", tr("这台 Mac 上的所有项目都会生效", "Applies to every project on this Mac")],
    export: [tr("排版插件的导出样式", "Layout plugin export style"), "", tr("双栏", "Two columns"), tr("这个插件暂不支持从场景包修改设置", "This plugin cannot apply settings from a blueprint yet")]
  });
  const ids = ["lookback", "report", "shelf", "export"];
  const scope = id => id === "shelf" ? tr("个人设置", "Personal settings") : tr("当前项目", "This project");
  function save() { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* private preview */ } }
  const $ = selector => document.querySelector(selector);
  const action = (label, cmd, variant = "secondary", options = {}) =>
    K.renderButton({ variant, label, size: "sm", ...options, attrs: { "data-action": cmd } });
  const opts = (label, items, current) => K.renderToggleGroup({ label, items: items.map(([value, name]) => ({
    value, label: name, current: current === value, attrs: { "data-action": value }
  })) });
  function controlBar() {
    $("#controls").innerHTML = '<strong>' + tr("交互定样", "Design preview") + '</strong>' +
      opts(tr("方案", "Option"), [["A", tr("A 按范围", "A · By scope")], ["B", tr("B 逐项查看", "B · One at a time")]], option) +
      '<div class="controls-end">' + action(s.lang === "zh" ? "English" : "中文", "language", "ghost") +
      action(s.theme === "dark" ? tr("浅色", "Light") : tr("深色", "Dark"), "theme", "ghost") +
      action(tr("重置样例", "Reset demo"), "reset", "ghost") + '</div>';
  }
  const stateText = () => ({
    done: tr("已生效", "Applied"), failed: tr("未保存", "Unapplied"), unknown: tr("待核对", "Unverified"),
    ready: tr("可继续", "Ready to resume"), kept: tr("保留你的修改", "Your edit kept"), revoked: tr("许可已收回", "Access withdrawn"),
    skipped: tr("已停止", "Stopped"), undone: tr("已撤销", "Undone"), unsupported: tr("不可采用", "Unavailable")
  });
  const stateMark = st => K.renderStatusMark({ tone: ({done:"done",failed:"blocked",unknown:"attention",revoked:"attention"})[st] || "idle",
    state: ({done:"done",failed:"failed",unknown:"waiting",revoked:"waiting"})[st] || "idle", label: stateText()[st] });
  function row(id, detail = false) {
    const [name, before, after, note] = names()[id];
    const preview = s.phase === "preview";
    const unavailable = id === "export";
    const state = unavailable ? "unsupported" : s.results[id];
    const check = preview && !unavailable
      ? '<input class="mw-check" type="checkbox" data-id="' + id + '" aria-label="' + name + '"' + (s.selected.includes(id) ? ' checked' : '') + '>' : "";
    const difference = unavailable ? "" : '<p class="change">' + before + ' → <strong>' + after + '</strong></p>';
    let reason = note;
    if (state === "done" && id === "report" && !s.laterEdit) reason = tr("已在日程中核对这个安排。", "Verified in Schedule.");
    if (state === "failed") reason = tr("日程服务暂时不可用。恢复后可以单独补上这项。", "Scheduling was unavailable. You can retry just this setting.");
    if (state === "unknown") reason = tr("保存时连接中断，先去日程核对，避免重复安排。", "The connection dropped while saving. Check the schedule before attempting another write.");
    if (state === "revoked") reason = tr("这个项目已收回写入许可。重新获得许可后可继续。", "Write access for this project was withdrawn. Continue after access is restored.");
    if (state === "skipped") reason = tr("本次采用已停止。", "This adoption was stopped.");
    if (state === "done" && id === "report" && s.laterEdit) reason = tr("日程里已手动改为每周一。", "You changed this to Mondays in Schedule.");
    if (state === "kept") reason = tr("你后来已改为每周一，中途修改已保留。", "You later changed this to Mondays. That edit was kept.");
    const help = preview && id === "report" ? "" : preview && !detail && !unavailable ? '<details><summary>' + tr("查看来源", "Show source") + '</summary><p class="metadata">' + note + '</p></details>'
      : '<p class="' + (["failed","unknown","revoked"].includes(state) ? "reason" : "metadata") + '">' + reason + '</p>';
    return '<li data-row="' + id + '"><div class="setting">' + check + '<div class="copy"><strong>' + name + '</strong>' +
      (preview ? difference + (id === "report" ? '<p class="metadata">' + note + '</p>' : "") : unavailable ? "" : '<p class="change">' + (state === "done" ? after : state === "undone" ? before : state === "kept" ? tr("每周一", "Mondays") : tr("计划设置为 ", "Requested: ") + after) + '</p>') +
      help + '</div>' + (state ? stateMark(state) : "") + '</div></li>';
  }
  function group(title, rows, icon = "") {
    return rows ? '<section class="group"><h2>' + (icon ? K.icon(icon) : "") + title + '</h2><ul class="rows">' + rows + '</ul></section>' : "";
  }
  const statusIds = st => s.selected.filter(id => s.results[id] === st);
  function results() {
    const open = s.selected.filter(id => ["failed", "unknown", "revoked", "ready"].includes(s.results[id]));
    const finished = s.selected.filter(id => !open.includes(id));
    if (option === "A") {
      return ["project","personal"].map((kind, i) => group(scope(i ? "shelf" : "lookback"),
        s.selected.filter(id => (kind === "personal") === (id === "shelf")).map(id => row(id,true)).join(""), i ? "user" : "folder")).join("");
    }
    const rest = group(tr("已处理", "Completed"), finished.map(id => row(id,true)).join(""));
    return group(tr("需要处理", "Needs attention"), open.map(id => row(id,true)).join("")) +
      (open.length && finished.length ? '<details><summary>' + tr("查看已处理的 ", "Show completed settings (") + finished.length + tr(" 项", ")") + '</summary>' + rest + '</details>' : rest);
  }
  function render(announce = false) {
    const preview = s.phase === "preview";
    controlBar();
    document.documentElement.lang = s.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = document.documentElement.dataset.resolvedTheme = s.theme;
    $("#context").innerHTML = K.icon("folder") + tr("行业观察　›　每周简报", "Industry research　›　Weekly brief");
    const outstanding = ["failed","unknown","revoked","ready"].some(st => statusIds(st).length);
    const title = preview ? tr("这次采用哪些设置？", "Which settings would you like to apply?")
      : s.phase === "undone" ? tr("已撤销本次更改", "Changes undone")
      : outstanding ? tr("还有一项需要处理", "One setting needs attention") : tr("选中的设置已生效", "Your settings are in place");
    $("#heading").textContent = title;
    $("#lead").textContent = preview ? tr("为「行业观察」准备每周简报。选中的设置会写回原处，以后仍可在设置里修改。", "Set up a weekly brief for Industry research. You can edit each applied value later in its usual settings.")
      : outstanding ? tr("已生效的设置会保留。你可以现在处理剩下的一项，也可以关掉，下次从这里继续。", "Applied settings will stay in place. Resolve the remaining item now or return to it later.")
      : s.phase === "undone" ? tr("仍属于这次采用的值已恢复。", "Settings still owned by this change have been restored.") : tr("下次生成简报时会使用这些设置。", "These settings will be used for your next brief.");
    let body;
    if (!preview) body = results();
    else if (option === "A") {
      body = group(tr("只改「行业观察」", "Only in Industry research"), ["lookback","report","export"].map(id => row(id)).join(""), "folder") +
        group(tr("同时影响其他项目", "Across your projects"), row("shelf"), "user");
    } else {
      const i = ids.indexOf(s.focusRow);
      body = group(scope(s.focusRow) + " · " + (i+1) + " / " + ids.length, row(s.focusRow,true)) +
        '<div class="paging">' + action(tr("上一项", "Previous"), "previous","ghost",{disabled:i===0}) +
        action(tr("下一项", "Next"), "next","secondary",{disabled:i===ids.length-1}) + '</div>' +
        '<details><summary>' + tr("查看本次全部设置", "Review all settings") + '</summary><ul class="rows">' +
        ids.filter(id => id !== s.focusRow).map(id => row(id,true)).join("") + '</ul></details>';
    }
    $("#content").innerHTML = body;
    const faultChoices = [["failed",tr("保存失败","Save failed")],["unknown",tr("结果未知","Unknown result")],["revoked",tr("撤权","Access withdrawn")],["ok",tr("正常","Success")]];
    if (preview) {
      $("#controls").insertAdjacentHTML("beforeend", opts(tr("模拟结果", "Simulated outcome"), faultChoices, s.issue));
      $("#actions").innerHTML = '<span class="count">' + tr("已选 ","Selected ") + s.selected.length + tr(" 项", "") +
        '</span><div class="main-action">' + action(tr("采用选中设置","Apply selected settings"), "apply","primary",{disabled:!s.selected.length}) + '</div>';
    } else {
      let main = "";
      if (statusIds("unknown").length) main = action(tr("核对日程","Check schedule"), "reconcile", "primary");
      if (statusIds("ready").length) main = action(tr("继续保存这一项","Resume this setting"), "retry","primary");
      if (statusIds("failed").length) main = action(tr("重试未保存项","Retry unapplied setting"), "retry","primary");
      if (statusIds("revoked").length) main = action(tr("检查当前许可","Check current access"), "permission","primary");
      $("#actions").innerHTML = '<span class="count">' + statusIds("done").length + ' / ' + s.selected.length + tr(" 项已生效"," applied") + '</span>' +
        (statusIds("done").length && !statusIds("unknown").length ? action(tr("撤销本次采用","Undo these changes"),"undo","ghost") : "") + '<div class="main-action">' + main + '</div>';
      if (!s.laterEdit && s.phase !== "undone" && s.results.report === "done") $("#controls").insertAdjacentHTML("beforeend", action(tr("模拟手动改时间","Simulate a later edit"), "edit","ghost"));
      if (s.results.report === "revoked") $("#controls").insertAdjacentHTML("beforeend", action(tr("模拟恢复许可","Restore access in demo"), "restore","ghost"));
    }
    document.querySelector(".columns").classList.toggle("reveal", announce);
    if (announce) { $("#heading").focus({preventScroll:true}); $("#live").textContent = title; }
  }
  document.addEventListener("change", e => {
    const id = e.target.dataset.id;
    if (!ids.includes(id) || id === "export" || s.phase !== "preview") return;
    if (e.target.checked) s.selected.push(id); else s.selected = s.selected.filter(x => x !== id);
    save();
    const disclosure = e.target.closest("details");
    render();
    const next = document.querySelector('[data-id="' + id + '"]');
    if (disclosure && next?.closest("details")) next.closest("details").open = true;
    next?.focus({preventScroll:true});
  });
  document.addEventListener("click", e => {
    const cmd = e.target.closest("button[data-action]")?.dataset.action;
    if (!cmd) return;
    if (cmd === "A" || cmd === "B") { const url = new URL(location.href); url.searchParams.set("option",cmd); location.href = url.href; return; }
    switch (cmd) {
      case "language": s.lang = s.lang === "zh" ? "en" : "zh"; break;
      case "theme": s.theme = s.theme === "dark" ? "light" : "dark"; break;
      case "reset": s = {...fresh(), lang:s.lang, theme:s.theme}; break;
      case "next": case "previous": s.focusRow = ids[ids.indexOf(s.focusRow)+(cmd === "next" ? 1 : -1)]; break;
      case "ok": case "failed": case "unknown": case "revoked": s.issue = cmd; break;
      case "apply":
        s.phase = "result";
        for (const id of s.selected) s.results[id] = id === "report" && s.issue !== "ok" ? s.issue : "done";
        break;
      case "reconcile": case "retry": s.results.report = "done"; break;
      case "permission":
        $("#live").textContent = tr("写入许可仍然关闭。","Write access is still off.");
        $("#content").insertAdjacentHTML("afterbegin", '<p class="reason" role="status">' + $("#live").textContent + '</p>');
        e.target.closest("button").disabled = true; return;
      case "restore": s.results.report = "ready"; break;
      case "edit": s.laterEdit = true; break;
      case "undo":
        s.phase = "undone";
        for (const id of s.selected) {
          if (s.results[id] === "done") s.results[id] = id === "report" && s.laterEdit ? "kept" : "undone";
          else if (s.results[id] !== "done") s.results[id] = "skipped";
        }
        break;
      default: return;
    }
    save();
    render(["apply","reconcile","retry","undo"].includes(cmd));
    const same = document.querySelector('[data-action="' + cmd + '"]');
    if (!["apply","reconcile","retry","undo"].includes(cmd)) (same && !same.disabled ? same : $("#heading")).focus({preventScroll:true});
    if (cmd === "edit") $("#live").textContent = tr("已在日程中改为每周一。","The schedule now runs on Mondays.");
  });
  render();
})();
