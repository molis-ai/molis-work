// Group A · 永久删除项目: the settings page's delete dialog when the project's default output folder (the folder Molis Work made
// for it, <Home>/outputs/<project_id>) still has files. The page and the dialog are the product's own markup (./export.mjs); this
// file adds the one question, the hint about where a kept folder stays, and simulates the deletion. Nothing deletes anything.
(() => {
  const { esc, L, ic, btn, ring, toast, sim, K } = P;

  const OPTIONS = [
    ["a1", ["A1 问一句，再勾选", "A1 Ask, then tick"]],
    ["a2", ["A2 两个结束按钮", "A2 Two ways to finish"]],
    ["a3", ["A3 选项就是确认", "A3 The choice confirms"], true],
  ];
  const STATES = [
    ["ask", ["① 默认输出目录里有文件：问删还是留", "① Output folder has files: ask"]],
    ["empty", ["② 文件夹是空的：不问（和现在一样）", "② Folder empty: no question (as today)"]],
    ["unknown", ["② 查看不了文件夹：不问，按留", "② Folder can't be looked at: no question, kept"]],
    ["kept", ["③ 选了留：告诉你文件夹在哪", "③ Kept: where the folder is"]],
    ["unasked", ["③ 没问过、留下了文件：也告诉你", "③ Not asked, files stayed: told too"]],
    ["busy", ["④ 选了删，但还有任务在跑", "④ Delete chosen, tasks still running"]],
    ["retry", ["④ 清理没做完：重试", "④ Cleanup unfinished: retry"]],
  ];
  const DATA = [["plain", ["常规", "Typical"]], ["full", ["最挤：长项目名、长路径", "Crowded: long name and path"]]];
  // The samples start at ~ because docs carry no paths from a developer's machine; the product shows and copies the full path.
  const PATHS = {
    plain: "~/.molis-work/outputs/proj-7f3c2a91",
    full: "~/Library/Mobile Documents/com~apple~CloudDocs/工作资料/Molis Work 数据（从旧电脑迁过来的整套资料）/outputs/proj-7f3c2a91",
  };
  const OWNERS = () => L("Goals；Pages；Coding；Feed", "Goals; Pages; Coding; Feed");

  // ---------- State ----------
  // scope: what delete-scope said when the dialog opened. choice: keep | delete | null (never preset). phase: form | done.
  let A = {};
  function preset(state, data, option) {
    A = { state, data, option, scope: state === "empty" ? "empty" : state === "unknown" ? "unknown" : "has_files", choice: null, confirmed: false,
      phase: "form", asked: true, working: false, alert: null, cleanup: false, open: true, nudge: false };
    if (state === "kept") { A.phase = "done"; A.choice = "keep"; }
    if (state === "unasked") { A.phase = "done"; A.asked = false; A.scope = "empty"; }
    if (state === "busy") { A.choice = "delete"; A.confirmed = true; A.alert = "busy"; }
    if (state === "retry") { A.choice = "delete"; A.confirmed = true; A.cleanup = true; }
  }
  const asks = () => A.scope === "has_files";

  // ---------- The page ----------
  function render() {
    const f = window.SETTINGS_FRAGMENTS[P.S.lang][A.data];
    return `<header class="project-preferences-chrome"><span>${esc(f.chrome)}</span><a href="#" data-act="a-noop" aria-label="${esc(L("关闭项目设置", "Close project settings"))}">${ic("x")}</a></header>
      <main class="settings-shell">${f.nav}<div class="settings-content">${f.page}</div></main>`;
  }
  // What the product's dialog says today, read from its own markup, so the words stay the product's.
  let base = null, dialog = null;
  function place() {
    document.querySelectorAll("body > .project-delete-dialog").forEach((node) => node.remove());
    dialog = document.querySelector("#app [data-project-delete-dialog]");
    if (!dialog) return;
    const q = (s) => dialog.querySelector(s);
    base = {
      title: q("header h2").textContent, descId: q(".runtime-plan-body > p[id]").id, desc: q(".runtime-plan-body > p[id]").textContent,
      hint: q("[data-project-delete-scope]").firstChild.textContent, confirm: q(".runtime-plan-confirm span").textContent,
      cancel: q("[data-project-delete-cancel]").textContent, submit: q(".project-delete-button").textContent,
    };
    document.body.append(dialog);
    paint();
    scrim(A.open);
    if (A.open && !dialog.open) dialog.show();
    if (!A.open && dialog.open) dialog.close();
  }
  function scrim(on) {
    let node = document.querySelector(".proto-scrim");
    if (on && !node) { node = document.createElement("div"); node.className = "proto-scrim"; node.dataset.act = "a-cancel"; document.body.append(node); }
    if (!on) node?.remove();
  }

  // ---------- The dialog, painted from the state ----------
  const submitLabel = () => {
    if (A.working) return L("正在删除…", "Deleting…");
    if (A.cleanup) return L("重试清理", "Retry cleanup");
    if (!asks()) return base.submit;
    if (A.option === "a2") return "";
    return A.choice === "delete" ? L("删除项目和文件", "Delete project and files") : A.choice === "keep" ? L("删除项目", "Delete project") : base.submit;
  };
  const canSubmit = () => {
    if (A.working) return false;
    if (!asks()) return A.confirmed;
    // Once the deletion started, the choice is fixed (a retry with another choice is refused), so the retry is always open.
    if (A.cleanup) return true;
    if (A.option === "a1") return A.confirmed && Boolean(A.choice);
    if (A.option === "a2") return A.confirmed;
    return Boolean(A.choice);
  };
  const CHOICES = () => ({
    keep: {
      a1: [L("留在这台电脑上", "Keep them on this Mac"), L("删除之后告诉你文件夹在哪里。", "After deleting, you'll see where the folder is.")],
      a3: [L("删除项目，文件留下", "Delete the project, keep the files"), L("默认输出目录原样留在这台电脑上，删除后告诉你它在哪里。", "The default output folder stays on this Mac as it is; after deleting, you'll see where.")],
    },
    delete: {
      a1: [L("一起删除", "Delete them too"), L("文件夹和里面的文件都删掉，包括还没提交的代码。不能撤销。", "The folder and its files go, including code not yet committed. This can't be undone.")],
      a3: [L("删除项目和文件", "Delete the project and the files"), L("默认输出目录和里面的文件一起删掉，包括还没提交的代码。", "The default output folder goes with its files, including code not yet committed.")],
    },
  });
  // The question, in each option's shape.
  function question() {
    const legend = L("默认输出目录里还有文件，要怎么处理？", "The default output folder still has files. What should happen to them?");
    const why = L("这是 Molis Work 为这个项目建的文件夹，Agent 和插件写出的文件默认放在这里。", "Molis Work made this folder for the project; Agents and plugins write their files here unless told otherwise.");
    if (A.option === "a1") {
      const row = (value, danger) => {
        const [title, desc] = CHOICES()[value].a1;
        return `<label class="runtime-plan-confirm${danger ? " is-danger" : ""}"><input type="radio" name="output_files" value="${value}" data-a="choose"${A.choice === value ? " checked" : ""}${A.working || A.cleanup ? " disabled" : ""}><span><strong>${esc(title)}</strong><small>${esc(desc)}</small></span></label>`;
      };
      return `<fieldset class="a-ask"><legend>${esc(legend)}</legend><p class="mw-field__hint">${esc(why)}</p>${row("keep")}${row("delete", true)}</fieldset>`;
    }
    if (A.option === "a2") {
      // On a retry the two finishing buttons are gone (the choice can't change), so the box says which one was pressed.
      const chosen = A.cleanup ? `<span>${esc(L(`你选了「${CHOICES()[A.choice].a3[0]}」，重试时不能改。`, `You chose "${CHOICES()[A.choice].a3[0]}"; a retry can't change it.`))}</span>` : "";
      return `<div class="a-facts"><strong>${esc(L("默认输出目录里还有文件", "The default output folder still has files"))}</strong><span>${esc(why)} ${esc(L("一起删除的话，里面还没提交的代码也会没。", "Deleting them too also removes code not yet committed."))}</span>${chosen}</div>`;
    }
    const opts = ["keep", "delete"].map((value) => ({ value, label: CHOICES()[value].a3[0], description: CHOICES()[value].a3[1], selected: A.choice === value, disabled: A.working || A.cleanup }));
    return `<div class="a-cards"><p class="a-ask"><strong id="a-cards-label">${esc(legend)}</strong></p>${P.M.renderInteractionOptions(opts, { id: "a-cards", labelledBy: "a-cards-label" })}
      <p class="a-cards__say">${esc(L("两种都会永久删除项目，不能撤销。", "Both delete the project for good. This can't be undone."))}</p></div>`;
  }
  function alertHtml() {
    if (A.alert !== "busy") return "";
    return `<div class="a-busy">${K.renderAlert({ title: L("现在删不干净这些文件", "These files can't be deleted cleanly right now"), tone: "warning", state: "answer", rise: !A.alertShown, role: "alert",
      className: A.nudge ? "is-nudged" : "",
      body: L("这个项目还有任务在运行或排队，它们可能还在往这个文件夹里写。等任务结束，或者先在项目里停下它们，再来删除；也可以留下文件，现在就删除项目。",
        "This project still has tasks running or queued, and they may still be writing to this folder. Wait for them to finish, or stop them in the project first, then delete; or keep the files and delete the project now."),
      actions: [{ label: L("改成留下文件", "Keep the files instead"), variant: "secondary", attrs: { "data-act": "a-keep-instead" } }] })}</div>`;
  }
  function paint() {
    if (!dialog || !base) return;
    const header = dialog.querySelector("header > div"), body = dialog.querySelector(".runtime-plan-body"), footer = dialog.querySelector("form > footer");
    const name = header.querySelector("p").outerHTML;
    if (A.phase === "done") {
      header.innerHTML = `<h2 id="${dialog.getAttribute("aria-labelledby")}" class="a-done__head">${ring("done")}<span>${esc(L("项目已删除", "Project deleted"))}</span></h2>${name}`;
      const path = PATHS[A.data];
      body.innerHTML = `<div class="a-done">
        <div class="a-kept"><div class="a-kept__title">${ic("folder")}<span>${esc(L("默认输出目录留在这台电脑上", "The default output folder stays on this Mac"))}</span></div>
          <div class="a-kept__path"><code>${esc(path)}</code>${btn({ label: L("复制位置", "Copy location"), icon: "copy", act: "a-copy", data: { path } })}</div></div>
        <p>${esc((A.asked ? "" : L("里面有文件，删除时没有动它们。", "It had files in it, so they were left alone. ")) + L("文件夹以项目编号命名，Molis Work 里不会再列出它。要用里面的文件，到这个位置去找。", "The folder is named by the project's number and Molis Work won't list it again. To use its files, go to this location."))}</p></div>`;
      footer.innerHTML = btn({ label: L("回到项目列表", "Back to projects"), variant: "primary", size: "md", act: "a-home" });
      requestAnimationFrame(() => footer.querySelector("button")?.focus({ preventScroll: true }));
      return;
    }
    header.innerHTML = `<h2 id="${dialog.getAttribute("aria-labelledby")}">${esc(base.title)}</h2>${name}`;
    const copyChanged = asks() ? ` <span class="proto-sim proto-copy" title="${esc(L("有这一问时，第一句改说「你自己选的文件夹」，免得和下面的「一起删除」矛盾", "With the question, the first sentence says \"folders you chose\", so it doesn't contradict \"delete them too\""))}">${esc(L("改了这句", "Copy changed"))}</span>` : "";
    const desc = asks() ? L("永久删除这个项目在 Molis Work 中的目标、记录和关联。你自己选的文件夹里的代码和文件会保留。", "Permanently delete this project's goals, records and links in Molis Work. Code and files in folders you chose stay.") : base.desc;
    const confirmBox = asks() && A.option === "a3" ? "" : `<label class="runtime-plan-confirm"><input type="checkbox" name="delete_confirmed" data-a="confirm"${A.confirmed ? " checked" : ""}${A.working || A.cleanup ? " disabled" : ""}><span>${esc(base.confirm)}</span></label>`;
    const error = A.cleanup ? L("项目已从目录移除，但本机数据清理未完成。请重试清理。", "The project was removed from the directory, but local cleanup did not finish. Retry cleanup.") : "";
    body.innerHTML = `<p id="${base.descId}">${esc(desc)}${copyChanged}</p><p class="mw-field__hint" data-project-delete-scope>${esc(base.hint)}<br><span>${esc(OWNERS())}</span></p>${asks() ? question() : ""}${confirmBox}${alertHtml()}<p class="settings-form-error" data-project-delete-error role="alert"${error ? "" : " hidden"}>${esc(error)}</p>`;
    A.alertShown = A.alert === "busy";
    A.nudge = false;
    // The refusal or the unfinished cleanup is what this moment is about: bring it into view inside the dialog's scrolling body.
    if (A.alert || A.cleanup) requestAnimationFrame(() => body.querySelector(".a-busy, [data-project-delete-error]:not([hidden])")?.scrollIntoView({ block: "nearest" }));
    const cancel = `<button class="mw-btn mw-btn--secondary" type="button" data-project-delete-cancel data-act="a-cancel" autofocus${A.working ? " disabled" : ""}>${esc(base.cancel)}</button>`;
    if (asks() && A.option === "a2" && !A.cleanup) {
      const working = (which) => A.working && A.choice === which;
      footer.innerHTML = cancel
        + `<button class="mw-btn mw-btn--secondary a-keep" type="button" data-act="a-finish" data-choice="keep"${!A.confirmed || A.working ? " disabled" : ""}>${esc(working("keep") ? L("正在删除…", "Deleting…") : L("删除项目，留下文件", "Delete project, keep files"))}</button>`
        + `<button class="mw-btn mw-btn--danger project-delete-button" type="button" data-act="a-finish" data-choice="delete"${!A.confirmed || A.working ? " disabled" : ""}>${esc(working("delete") ? L("正在删除…", "Deleting…") : L("删除项目和文件", "Delete project and files"))}</button>`;
    } else {
      footer.innerHTML = cancel + `<button class="mw-btn mw-btn--danger project-delete-button" type="button" data-act="a-submit"${canSubmit() ? "" : " disabled"}>${esc(submitLabel())}</button>`;
    }
  }

  // ---------- What happens (simulated) ----------
  function submit() {
    // Pressing again while the refusal is showing keeps it in place, and it hops once instead of appearing again.
    const told = A.alert === "busy";
    A.working = true; if (!told) A.alert = null; paint();
    setTimeout(() => {
      A.working = false;
      const deleting = asks() && A.choice === "delete";
      if (A.state === "busy" && deleting) { A.alert = "busy"; A.nudge = told; paint(); return; }
      A.alert = null;
      A.cleanup = false;
      if (deleting || A.scope === "empty" && A.state !== "unasked") {
        A.open = false; scrim(false); dialog.close();
        toast(deleting ? L("（模拟）项目和默认输出目录都删了，回到项目列表", "(Simulated) Project and default output folder deleted; back to the project list")
          : L("（模拟）项目已删除，回到项目列表", "(Simulated) Project deleted; back to the project list"));
        return;
      }
      // Kept: asked and chose to keep; or not asked (empty when opened, or could not be looked at) and files are there.
      A.asked = asks();
      A.phase = "done"; paint();
    }, 720);
  }
  function act(name, el) {
    switch (name) {
      case "a-cancel": if (A.working) return false; A.open = false; scrim(false); dialog?.close(); return false;
      case "a-open": A = { ...A, open: true, phase: A.phase === "done" ? "form" : A.phase }; scrim(true); paint(); dialog.show(); return false;
      case "a-submit": if (canSubmit()) submit(); return false;
      case "a-finish": if (!A.confirmed || A.working) return false; A.choice = el.dataset.choice; submit(); return false;
      case "a-keep-instead": A.choice = "keep"; A.alert = null; paint(); dialog.querySelector('[value="keep"], [data-ix-option="keep"]')?.focus(); return false;
      case "a-copy": window.molisCopy?.(el, el.dataset.path, { done: L("已复制", "Copied"), failed: L("没能复制", "Couldn't copy") }); return false;
      case "a-home": A.open = false; scrim(false); dialog.close(); toast(L("（模拟）回到项目列表", "(Simulated) Back to the project list")); return false;
      case "a-noop": return false;
      default: return false;
    }
  }
  // The product's own controls inside the dialog (its checkbox, the radios, the option cards) and its 删除项目 button on the page.
  function input(el) {
    if (el.matches('[data-a="confirm"]')) { A.confirmed = el.checked; repaintKeepingFocus(el); return true; }
    if (el.matches('[data-a="choose"]')) { A.choice = el.value; if (A.alert && A.choice === "keep") A.alert = null; repaintKeepingFocus(el); return true; }
    return false;
  }
  function click(el) {
    const option = el.closest("[data-ix-option]");
    if (option && option.closest(".a-cards")) { if (A.working || A.cleanup) return true; A.choice = option.dataset.ixOption; if (A.choice === "keep") A.alert = null; repaintKeepingFocus(option); return true; }
    if (el.closest("[data-project-delete-open]")) { act("a-open"); return true; }
    return false;
  }
  function repaintKeepingFocus(el) {
    const key = el.dataset.ixOption ? `[data-ix-option="${el.dataset.ixOption}"]` : el.name === "output_files" ? `[value="${el.value}"]` : `[data-a="${el.dataset.a}"]`;
    paint();
    dialog.querySelector(key)?.focus({ preventScroll: true });
  }
  function key(event) {
    if (event.key === "Escape" && dialog?.open) act("a-cancel");
    return false;
  }
  const NOTES = {
    ask: ["打开确认框时默认输出目录里有文件。插件数据的名单、路径和删除都是模拟的。", "The default output folder had files when the dialog opened. The plugin names, path and deletion are simulated."],
    empty: ["文件夹是空的：确认框和现在一模一样，不问。删除是模拟的。", "The folder is empty: the dialog is today's, with no question. Deletion is simulated."],
    unknown: ["查看不了（比如路径上有符号链接）时不问、按留；删除后有文件留下就告诉你在哪。", "When the folder can't be looked at (a symbolic link on the way, say) there is no question and it is kept; if files stayed, you're told where."],
    kept: ["选了留之后：确认框不关，换成文件夹的位置。产品里路径来自删除结果，这里是示例。", "After keeping: the dialog stays and shows where the folder is. In the product the path comes from the deletion's result; this one is a sample."],
    unasked: ["打开时是空的、删除前又有了文件：没问过，按留，同样告诉你在哪。", "Empty when opened, files by the time of deleting: not asked, kept, and you're told where."],
    busy: ["选了删、项目里还有任务在跑或排队时，平台拒绝；选择不丢，可以改成留。", "With delete chosen and tasks running or queued, the platform refuses; the choice stays and can be switched to keep."],
    retry: ["清理没做完时沿用现在的提示和「重试清理」；这里按一次重试就成功。", "An unfinished cleanup keeps today's message and Retry cleanup; one retry succeeds here."],
  };
  window.Groups = window.Groups || {};
  window.Groups.a = {
    title: ["A 永久删除项目", "A Delete a project"], options: OPTIONS, states: STATES, data: DATA, bodyClass: "settings-page project-preferences-page", settingsCss: true,
    preset, render, place, act, key, input, click, outside: () => false, note: (state) => NOTES[state],
  };
  void sim;
})();
