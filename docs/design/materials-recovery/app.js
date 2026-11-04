// 33 item 2 · Materials: checking what was read, changing the scope or the model, and materials inside a Coding round.
// Built on the shared Coding frame (../coding-frame/coding-proto.js) and the component board's parts (window.mwKit); the first two
// blocks sit in the 04 onboarding sheet (left asks, right shows), drawn here with board parts. All data is sample data: nothing
// reads a folder, calls a model or touches a Home.
(() => {
  const Z = (zh, en) => [zh, en];
  const data = {
    blocks: [
      { id: "check", name: Z("材料核对：读到了什么", "Checking what was read") },
      { id: "scope", name: Z("改范围与换模型", "Changing the scope or the model") },
      { id: "coding", name: Z("Coding 一轮里的材料", "Materials in a Coding round") },
    ],
    decided: { check: "B", scope: "A", coding: "A" },
    schemes: {
      check: { A: Z("A 按结果分组", "A Grouped by outcome"), B: Z("B 每份一条，写走到哪一步", "B One row per file, with how far it got"), C: Z("C 一行结果，点开看是哪些", "C One result line; open to see which") },
      scope: { A: Z("A 一张「这次只做这些」", "A A “only this, this time” card"), B: Z("B 在材料清单上标出变化", "B Changes marked on the list"), C: Z("C 进度里写变化，摘要分版本", "C Changes in the progress; summary versions") },
      coding: { A: Z("A 本轮抬头下一张材料清单", "A A materials list under the round line"), B: Z("B 输入框里的材料签带状态", "B Material chips in the composer carry their state"), C: Z("C 文件栏里的「本轮材料」", "C “This round's materials” in the files column") },
    },
    states: {
      check: [["mixed", "混合材料读完", "Mixed materials read"], ["sensitive", "你要把像密钥的文件发给模型", "You want to send a file that looks like secrets"], ["listing", "大文件夹还在清点（总数未知）", "A big folder is still being listed"], ["restored", "回来或重启后，先恢复上次的选择", "Back or restarted: last choice restored first"], ["denied", "一个位置的授权没了", "One location lost its access"], ["empty", "空文件夹与时间范围里没有文件", "An empty folder vs nothing in the range"]],
      scope: [["add", "加了 3 份材料", "You added 3 materials"], ["remove", "去掉了 2 份", "You removed 2"], ["model", "换了模型", "You changed the model"], ["late", "旧的结果晚到了", "An old result arrived late"]],
      coding: [["walk", "走一遍（按发送开始）", "Walk through (press Send)"], ["ok", "正常：4 份，其中一份很长", "Normal: 4, one of them long"], ["gone", "一份在项目里被删了", "One was deleted from the project"], ["revoked", "Coding 读资料的授权被关了", "Coding's access to materials was turned off"], ["changed", "开始后有一份被改过", "One changed after the round started"], ["many", "带了 30 份（每轮上限）", "30 materials (the per-round limit)"], ["restart", "重启后接着这一轮", "Carrying on after a restart"]],
    },
  };

  // ---------------------------------------------------------------- sample materials
  // Three locations as in 04 (a code folder, Downloads, a meeting-notes folder). 223 picked, 1 duplicate → 222 counted:
  // 214 read (12 of them recognised by their content), 3 images kept as references, 4 without readable text, 1 held back.
  const LOCS = [
    { id: "web", icon: "code", name: Z("website", "website"), path: "~/code/website", found: 214, picked: 186 },
    { id: "dl", icon: "download", name: Z("下载", "Downloads"), path: "~/Downloads", found: 1286, picked: 6 },
    { id: "desk", icon: "folder", name: Z("会议纪要", "Meeting notes"), path: "~/Desktop/会议纪要", found: 31, picked: 31 },
  ];
  const READ = [
    ["src/components/Hero.tsx", "web", "6 KB"], ["src/app.tsx", "web", "3 KB"], ["package.json", "web", "2 KB"], ["README.md", "web", "4 KB"],
    ["Dockerfile", "web", "1 KB", "content"], ["LICENSE", "web", "1 KB", "content"], ["api/schema.proto", "web", "5 KB", "content"], [".gitignore", "web", "1 KB", "content"],
    ["Gartner AI Agents 2026.pdf", "dl", "1.1 MB"], ["访谈纪要-李.docx", "dl", "64 KB", "dup"], ["周会 10-28.md", "desk", "8 KB"],
  ];
  const UNUSED = [["tests/__snapshots__/Hero.test.tsx.snap", "web", "12 KB"], ["pnpm-lock.yaml", "web", "410 KB"], ["CHANGELOG.md", "web", "22 KB"]];
  const MSG = (L) => L("按访谈和周会，把注册改成两步。", "Using the interviews and the meetings, cut sign-up to two steps.");
  const IGNORED = [["node_modules", Z("18,412 项 · 依赖", "18,412 items · dependencies")], [".git", Z("1,206 项 · 版本记录", "1,206 items · version history")], ["dist", Z("38 项 · 构建产物", "38 items · build output")]];

  window.codingProto({
    key: "molis-proto.materials-recovery.v2",
    data,
    defaults: (c) => {
      const S = c.S;
      if (S.block === "coding" && S.state.coding === "walk") S.draft = MSG(c.L);
    },
    blocks: {
      // ---------------------------------------------------------------- 材料核对 (ONB-35～38)
      check(c) {
        const { L, P, esc, sch, st, ic, btn, tag, badge, S, K } = c;
        const scheme = sch(), s = st();
        const sent = S.v.envSent; // the person chose to send .env.local after looking
        const kind = (name) => K.renderFileKind(name.includes(".") && !name.startsWith(".") ? name : name + ".txt");
        const locName = (id) => P(LOCS.find((l) => l.id === id).name);
        const note = (icon, text, tone = "") => `<p class="ob-note${tone ? " is-" + tone : ""}">${ic(icon, "sm")}<span>${text}</span></p>`;

        // The problems, each with why and what can be done.
        const PROBLEMS = [
          { n: "扫描合同.pdf", loc: "dl", size: "2.4 MB", g: "unread", why: L("没有文字层：是扫描件，要先识别文字（OCR）才能读", "No text layer: it's a scan; text recognition (OCR) is needed first"), acts: [[L("换一份有文字的", "Replace with a text version"), "replace"], [L("只留原件", "Keep the original only"), "keep"]] },
          { n: "旧版发布会.key", loc: "dl", size: "31 MB", g: "unread", why: L("Keynote 文件读不了正文", "Keynote files can't be read as text"), acts: [[L("导出成 PDF 再加", "Export to PDF and add"), "replace"], [L("只留原件", "Keep the original only"), "keep"]] },
          { n: "竞品表.xlsx", loc: "dl", size: "42 KB", g: "unread", why: L("表格还读不了正文；原件留着，可以引用", "Spreadsheets can't be read as text yet; the original is kept and can be cited"), acts: [[L("另存为 CSV 再加", "Save as CSV and add"), "replace"]] },
          { n: "public/app.wasm", loc: "web", size: "1.8 MB", g: "unread", why: L("不是文本，没有正文", "Not text; nothing to read"), acts: [] },
        ];
        const IMAGES = [["assets/hero.png", "web", "320 KB"], ["assets/og.png", "web", "96 KB"], ["截图 10-27.png", "dl", "1.2 MB"]];
        const actBtns = (p) => p.acts.map(([label, a]) => btn(label, { v: "ghost", act: "toast", arg: a === "keep" ? L(`${p.n}：只留原件，可以引用（模拟）`, `${p.n}: original kept for citing (sample)`) : L(`选一份新的替换 ${p.n}（模拟）`, `Pick a file to replace ${p.n} (sample)`) })).join("");

        // ---------- the materials step (listing states): locations as 04 drew them, with the new states ----------
        if (["listing", "restored", "denied", "empty"].includes(s)) {
          const groups = LOCS.map((l) => {
            let caption = l.path, count = `${l.picked}/${l.found.toLocaleString()}`, status = "", rows = [], noteText = "";
            if (s === "listing" && l.id === "dl" && !S.v.stopped) {
              caption = `${l.path} · ${L("正在看", "Looking in")} 2025/会议录音`; count = ""; status = tag(L("已找到 812 项…", "812 found…"), "running", "progress");
              noteText = L("还不知道一共多少，不显示百分比；已找到的可以先勾。", "The total isn't known yet, so no percentage; you can tick what's found already.");
              rows = [K.renderFileRow({ name: "Gartner AI Agents 2026.pdf", size: "1.1 MB", check: { checked: true } }), K.renderFileRow({ name: "访谈纪要-李.docx", size: "64 KB", check: { checked: true } })];
            } else if (s === "listing" && l.id === "dl") {
              status = tag(L("已停止 · 812 项", "Stopped · 812 found"), "interrupted", "attention"); count = "6/812";
              noteText = L("停在这里了，已找到的 812 项都在；没看到的不会读。", "Stopped here; the 812 found are kept. What wasn't reached won't be read.");
            } else if (s === "restored") {
              status = tag(L("核对文件夹有没有变化…", "Checking for changes…"), "running", "progress");
              noteText = l.id === "web" ? L("先显示上次的选择；核对完有变化会标出来。", "Your last choice shows first; changes are marked once checked.") : "";
            } else if (s === "denied" && l.id === "dl") {
              caption = l.path; count = ""; status = tag(L("读不了", "Can't read"), "blocked", "blocked");
              noteText = L("这个文件夹的读取授权没了（可能在系统设置里撤了）。上次勾的 6 份不算进来。", "Access to this folder is gone (perhaps revoked in System Settings). The 6 you ticked aren't counted.");
            } else if (s === "empty" && l.id === "desk") {
              count = "0"; status = badge(L("文件夹是空的", "Empty folder"), "neutral"); noteText = L("这个文件夹里什么都没有。", "There is nothing in this folder.");
            } else if (s === "empty" && l.id === "dl") {
              caption = `${l.path} · ${L("最近 7 天", "Last 7 days")}`; count = "0/1,286"; status = badge(L("这段时间没有", "None in range"), "warning");
              noteText = L("文件夹里有 1,286 项，最近 7 天没有新的。", "The folder has 1,286 items; none from the last 7 days.");
            }
            const tools = s === "listing" && l.id === "dl" ? (S.v.stopped ? btn(L("接着清点", "Resume"), { act: "scan-resume", icon: "play" }) : btn(L("停止", "Stop"), { act: "scan-stop", icon: "pause" }))
              : s === "denied" && l.id === "dl" ? btn(L("重新授权", "Grant again"), { act: "toast", arg: L("系统的文件夹授权窗口（模拟）", "The system's folder access window (sample)") }) + btn(L("本次跳过", "Skip this time"), { v: "ghost", act: "toast", arg: L("跳过下载，其余照常（模拟）", "Downloads skipped; the rest carries on (sample)") })
              : s === "empty" && l.id === "dl" ? btn(L("改成最近 30 天", "Last 30 days"), { act: "toast", arg: L("范围改成最近 30 天（模拟）", "Range set to 30 days (sample)") }) : "";
            return `<div class="ob-loc${s === "denied" && l.id === "dl" ? " is-blocked" : ""}">${K.renderFileGroup({ glyph: l.icon, title: P(l.name), caption, count, status, rows, note: noteText })}${tools ? `<div class="ob-loc__tools">${tools}</div>` : ""}</div>`;
          }).join("");
          const picked = s === "denied" ? 217 : s === "empty" ? 186 : 223;
          const big = s === "restored" ? `<div class="ob-big"><b>${picked}</b><span>${L("份 · 上次的选择", "items · your last choice")}</span>${tag(L("核对中", "Checking"), "running", "progress")}</div>`
            : `<div class="ob-big"><b>${picked}</b><span>${L(`份 · ${s === "empty" ? 1 : s === "denied" ? 2 : 3} 个位置`, `items · ${s === "empty" ? 1 : s === "denied" ? 2 : 3} locations`)}</span>${s !== "empty" ? `<em>${L("重复 1 份只算一次", "1 duplicate counted once")}</em>` : ""}</div>`;
          const left = big + (s === "listing" ? note("clock", L("「下载」还在清点；其余两个位置已经好了，可以先往下走，清点完会补上。", "Downloads is still being listed; the other two are ready. You can go on — it fills in when done.")) : "")
            + (s === "denied" ? note("circle-alert", L("一个位置读不了，不影响另外两个。", "One location can't be read; the other two are fine."), "warn") : "")
            + note("shield", L("只读勾选的，原文件不改。", "Only ticked items are read; originals stay unchanged."));
          return ob(c, { step: 0, q: L("这次读这些", "Read these this time"), left, right: `<div class="ob-scene">${groups}</div>`, primary: L("下一步", "Next"), primaryDisabled: s === "restored" });
        }

        // ---------- after reading (mixed / sensitive) ----------
        const used = 205, unused = 9, read = 214;
        const facts = [[L("发现", "Found"), "1,531"], [L("选中", "Ticked"), "223"], [L("读好", "Read"), String(read)], [L("用到摘要", "In the summary"), String(used)], [L("带进项目", "Into the project"), L("采用时", "On adopt")]];
        const heldRow = (o = {}) => K.renderFileRow({ name: ".env.local", className: "is-why", size: sent ? L("已按你的选择发送去掉值的版本", "Sent without values, as you chose") : L("像是密钥（STRIPE_KEY=…），没发给模型", "Looks like secrets (STRIPE_KEY=…); not sent"), state: sent ? tag(L("已发送", "Sent"), "done", "done") : tag(L("没发送", "Held back"), "blocked", "hold") });
        let right = "";

        if (scheme === "A") {
          const readRows = [READ[4], READ[6], READ[9], READ[0], READ[8]].map(([n, , size, how]) => K.renderFileRow({ name: n, size, state: how === "content" ? badge(L("按内容认出", "By content"), "info") : how === "dup" ? badge(L("重复，只算一次", "Duplicate, once"), "neutral") : "" }));
          const unusedRows = UNUSED.map(([n, , size]) => K.renderFileRow({ name: n, size, state: `<span class="mw-file-row__state">${L("读了，没用到", "Read, not used")}</span>` }));
          const g = (o) => K.renderFileGroup(o);
          right = `<div class="ob-scene">
            ${g({ glyph: "lock", title: L("没发给模型 · 1 份", "Not sent to the model · 1"), caption: L("勾了它所在的文件夹，不等于同意外发", "Ticking its folder isn't consent to send it"), rows: [heldRow() + (sent ? "" : `<li class="ob-fix">${btn(L("看看哪几行", "See which lines"), { v: "ghost", act: "toast", arg: L("STRIPE_KEY、DATABASE_URL 两行（值不显示）", "Two lines: STRIPE_KEY, DATABASE_URL (values hidden)") })}${btn(L("仍要发送…", "Send anyway…"), { v: "ghost", act: "send-env" })}</li>`)], className: "is-hold" })}
            ${g({ glyph: "circle-alert", title: L("读不了正文 · 4 份", "No readable text · 4"), caption: L("没有算成读好；原件都留着", "Not counted as read; the originals are kept"), rows: PROBLEMS.map((p) => K.renderFileRow({ name: p.n, size: p.why, className: "is-why" }) + (p.acts.length ? `<li class="ob-fix">${actBtns(p)}</li>` : "")), className: "is-warn" })}
            ${g({ glyph: "check", title: L(`读好了 · ${read} 份`, `Read · ${read}`), caption: L(`${used} 份用在了摘要里 · ${unused} 份读了没用到 · 12 份没有常见后缀，按内容认出`, `${used} used in the summary · ${unused} read but not used · 12 recognised by content`), rows: readRows.slice(0, 5), note: L(`另外 ${read - 5} 份`, `${read - 5} more`), className: "is-ok" })}
            <details class="mw-collapsible ob-fold"><summary>${L(`读了没用到的 ${unused} 份`, `${unused} read but not used`)}</summary><div class="mw-collapsible__body"><ul class="mw-file-list">${unusedRows.join("")}</ul></div></details>
            ${g({ glyph: "image", title: L("只留引用 · 3 张图", "Kept as references · 3 images"), caption: L("图片不读文字，项目里可以引用", "Images aren't read as text; they can be cited in the project"), rows: IMAGES.map(([n, , size]) => K.renderFileRow({ name: n, size })) })}
            <details class="mw-collapsible ob-fold"><summary>${L("按规则没读 · 3 类 · 19,656 项", "Skipped by rule · 3 kinds · 19,656 items")}</summary><div class="mw-collapsible__body"><ul class="mw-file-list">${IGNORED.map(([n, d]) => K.renderFileRow({ name: n + "/", size: P(d), state: btn(L("这次读它", "Read it this time"), { v: "ghost", act: "toast", arg: L(`下次读取会带上 ${n}（模拟）`, `${n} is included next time (sample)`) }) })).join("")}</ul><p class="ob-rule">${L("依赖、版本记录和构建产物默认不读。.gitignore、.editorconfig 这类配置照常读；.env 这类可能含密钥的不外发。", "Dependencies, version history and build output are skipped by default. Config like .gitignore is read as usual; files like .env that may hold secrets are never sent out.")}</p></div></details>
          </div>`;
        } else if (scheme === "B") {
          const filter = S.v.filter || "all";
          const track = (n) => `<span class="ob-track" role="img" aria-label="${esc(L(`走到第 ${n} 步，共 5 步`, `Step ${n} of 5`))}"${c.fresh(L("五格走到哪：发现、选中、读好、用到、带进项目；组件板没有这个部件", "Five-cell progress: found, ticked, read, used, brought in; not on the board"))}>${[0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? "on" : ""}${i === n && n < 4 ? " stop" : ""}"></i>`).join("")}</span>`;
          // One compact row per file, the board's renderFileRow at 04's density: type, name, source and size, five cells, status.
          // Only a row that needs you gets a second line, with the whole reason and its fix (the cells and that line are new on the board).
          const W = {
            used: [L("用到", "Used"), "done", "done"], content: [L("按内容认出", "By content"), "done", "done"], unused: [L("没用到", "Not used"), "idle", "quiet"],
            ref: [L("只留引用", "Reference"), "idle", "idle"], unread: [L("读不了", "No text"), "blocked", "attention"], held: [L("没发送", "Held back"), "blocked", "hold"], sent: [L("已发送", "Sent"), "done", "done"],
          };
          const rowsAll = [
            ...PROBLEMS.map((p) => ({ n: p.n, loc: p.loc, size: p.size, step: 2, w: "unread", g: "issue", why: p.why, fix: p.acts.length ? btn(p.acts[0][0], { v: "ghost", act: "toast", arg: L(`选一份新的替换 ${p.n}（模拟）`, `Pick a file to replace ${p.n} (sample)`) }) : "" })),
            { n: ".env.local", loc: "web", size: "1 KB", step: sent ? 4 : 3, w: sent ? "sent" : "held", g: sent ? "ok" : "issue", why: sent ? "" : L("像是密钥（STRIPE_KEY=…），读了，没发给模型", "Looks like secrets (STRIPE_KEY=…): read, not sent to the model"), fix: sent ? "" : btn(L("仍要发送…", "Send anyway…"), { v: "ghost", act: "send-env" }) },
            ...READ.map(([n, loc, size, how]) => ({ n, loc, size, step: 4, w: how === "content" ? "content" : "used", g: "ok" })),
            ...UNUSED.map(([n, loc, size]) => ({ n, loc, size, step: 3, w: "unused", g: "unused" })),
            ...IMAGES.map(([n, loc, size]) => ({ n, loc, size, step: 2, w: "ref", g: "ref" })),
          ];
          const shown = rowsAll.filter((r) => filter === "all" || (filter === "issue" ? r.g === "issue" : r.g === "unused"));
          const issues = rowsAll.filter((r) => r.g === "issue").length;
          const tabs = c.K.renderToggleGroup({ label: L("看哪些", "Show"), items: [["all", L("全部", "All")], ["issue", L(`要处理 ${issues}`, `Need you ${issues}`)], ["unused", L(`没用到 ${unused}`, `Not used ${unused}`)]].map(([v, l]) => ({ value: v, label: l, current: filter === v, attrs: { "data-act": "filter", "data-arg": v } })) });
          const row = (r) => {
            const [word, state, tone] = W[r.w];
            return K.renderFileRow({ name: r.n, size: `${locName(r.loc)} · ${r.size}`, state: `<span class="ob-cells">${track(r.step)}${tag(word, state, tone)}</span>`, className: r.why ? "is-issue" : "" })
              + (r.why ? `<li class="ob-why"${c.fresh(L("原因与补救：只给要处理的行加这一行；组件板没有这个槽位", "Reason and fix: a line only rows that need you get; not on the board"))}><span>${esc(r.why)}</span>${r.fix}</li>` : "");
          };
          right = `<div class="ob-scene is-list">
            <ol class="ob-funnel" aria-label="${L("五件事", "Five facts")}"${c.fresh(L("一排五个数：发现、选中、读好、用到、带进项目；组件板没有", "A row of five counts; not on the board"))}>${facts.map(([k, v], i) => `<li${i === 4 ? ' class="is-later"' : ""}><b>${v}</b><span>${k}</span></li>`).join("")}</ol>
            <div class="ob-filter">${tabs}<span class="cap">${L("每一格：发现 · 选中 · 读好 · 用到 · 带进项目", "Cells: found · ticked · read · used · brought in")}</span></div>
            <div class="ob-listbox"><ul class="mw-file-list ob-list" tabindex="0" aria-label="${L("每份材料", "Each file")}">${shown.map(row).join("")}<li class="ob-more">${L("样张只列出其中一部分", "The sample lists only some of them")}</li></ul></div>
            <details class="mw-collapsible ob-fold"><summary>${L("按规则没读 · 19,656 项", "Skipped by rule · 19,656 items")}</summary><div class="mw-collapsible__body"><p class="ob-rule">${IGNORED.map(([n, d]) => `<code>${n}/</code> ${esc(P(d))}`).join("　")}</p></div></details>
          </div>`;
        } else {
          const open = S.v.chip;
          const chips = [["ok", "check", L(`${read} 份读好`, `${read} read`), "done"], ["ref", "image", L("3 张只留引用", "3 references"), "idle"], ["unread", "circle-alert", L("4 份读不了", "4 unreadable"), "attention"], ["held", "lock", sent ? L("1 份已按你的选择发送", "1 sent as you chose") : L("1 份没发给模型", "1 held back"), sent ? "done" : "hold"], ["rule", "filter", L("19,656 项按规则没读", "19,656 skipped by rule"), "quiet"]];
          const list = {
            ok: READ.slice(0, 6).map(([n, , size, how]) => K.renderFileRow({ name: n, size, state: how === "content" ? badge(L("按内容认出", "By content"), "info") : "" })).join("") + `<li class="ob-more">${L(`另外 ${read - 6} 份 · 其中 ${unused} 份没用到`, `${read - 6} more · ${unused} not used`)}</li>`,
            ref: IMAGES.map(([n, , size]) => K.renderFileRow({ name: n, size })).join(""),
            unread: PROBLEMS.map((p) => K.renderFileRow({ name: p.n, size: p.why, className: "is-why" }) + (p.acts.length ? `<li class="ob-fix">${actBtns(p)}</li>` : "")).join(""),
            held: heldRow() + (sent ? "" : `<li class="ob-fix">${btn(L("仍要发送…", "Send anyway…"), { v: "ghost", act: "send-env" })}</li>`),
            rule: IGNORED.map(([n, d]) => K.renderFileRow({ name: n + "/", size: P(d) })).join(""),
          };
          right = `<div class="ob-scene">
            <div class="ob-card"><div class="ob-card__h">${ic("sparkles", "sm")}<b>${L("工作脉络", "How the work stands")}</b>${badge(L("按 205 份", "From 205"), "neutral")}</div>
              <p>${L("官网改版在第二轮：首页英雄区已重做，订阅表单待接入支付［S12］；10-28 周会定下先做移动端［S41］。访谈里李提到注册太长［S77］。", "The website redesign is in its second round: the hero is redone, the subscribe form awaits payments [S12]; the 10-28 meeting put mobile first [S41]. Li said sign-up is too long [S77].")}</p></div>
            <div class="ob-chips" role="group" aria-label="${L("读取结果", "Reading results")}"${c.fresh(L("结果签：组件板的状态签做成可点的筛选；可点这一点是新的", "Result chips: the board's status marks made clickable; the click is new"))}>${chips.map(([id, icon, label, tone]) => `<button type="button" class="ob-chip${open === id ? " is-open" : ""}" data-act="chip" data-arg="${id}" aria-expanded="${open === id}" data-tone="${tone}">${ic(icon, "sm")}<span>${label}</span>${ic("chevron-down", "xs")}</button>`).join("")}</div>
            ${open ? `<div class="ob-chipbody" role="region"><ul class="mw-file-list">${list[open]}</ul></div>` : `<p class="cap ob-hint">${L("点一个结果，看是哪些文件。", "Pick a result to see which files.")}</p>`}
          </div>`;
        }

        // Left: the read step (04), plus the one thing to decide when a file looks like secrets.
        let left = `<ol class="ob-phases">
          <li class="is-done">${c.ring("done")}<span><b>${L("读 222 份", "Read 222")}</b><small>${L("214 份读好 · 3 张只留引用 · 4 份读不了 · 1 份没发送", "214 read · 3 references · 4 unreadable · 1 held back")}</small></span></li>
          <li class="is-done">${c.ring("done")}<span><b>${L("整理工作脉络", "Sum up the work")}</b><small>${L("用了 205 份", "Used 205")}</small></span></li></ol>`;
        if (s === "sensitive" && !sent) {
          const pick = S.v.envPick || "strip";
          const opt = (v, t, d) => `<label class="ob-opt${pick === v ? " is-on" : ""}"><input type="radio" class="mw-radio" name="env" value="${v}" data-act="env-pick" data-arg="${v}"${pick === v ? " checked" : ""}><span><b>${t}</b><small>${d}</small></span></label>`;
          left += `<div class="ob-ask" role="group" aria-labelledby="ob-ask-t"><div class="ob-ask__h" id="ob-ask-t">${ic("lock", "sm")}<b>${L("要把 .env.local 发给模型吗？", "Send .env.local to the model?")}</b></div>
            <p>${L("里面有 2 行像密钥：STRIPE_KEY、DATABASE_URL。值不会显示在这里。", "Two lines look like secrets: STRIPE_KEY, DATABASE_URL. Values aren't shown here.")}</p>
            ${opt("strip", L("只发变量名，去掉值", "Send names only, without values"), L("模型知道要哪些配置，看不到值", "The model learns which settings exist, not their values"))}
            ${opt("raw", L("原样发送", "Send as is"), L("值会进入这次请求和模型服务商的记录", "Values go into this request and the provider's logs"))}
            ${opt("no", L("不发", "Don't send"), L("保持现在这样", "Keep it as it is"))}
            <div class="ob-ask__acts">${btn(L("就这样", "Confirm"), { v: "primary", act: "env-confirm" })}${btn(L("取消", "Cancel"), { v: "ghost", act: "toast", arg: L("没有发送", "Nothing sent") })}</div></div>`;
        } else {
          left += note("shield", L("读到的文字存在这台 Mac 的这个项目里；整理时只把读好的交给你选的模型。", "Read text stays in this project on this Mac; only what was read goes to your model."));
        }
        return ob(c, { step: 2, q: L("材料读好了", "Materials are read"), left, right, primary: L("继续", "Continue") });
      },

      // ---------------------------------------------------------------- 改范围与换模型 (ONB-40, 42, 45)
      scope(c) {
        const { L, esc, sch, st, ic, btn, tag, badge, S, K, ring } = c;
        const scheme = sch(), s = st(), done = !!S.v.done;
        const ADD = [["周会 10-30.md", "8 KB"], ["周会 11-04.md", "7 KB"], ["设计评审.pdf", "640 KB"]];
        const REM = [["Gartner AI Agents 2026.pdf", "1.1 MB"], ["扫描合同.pdf", "2.4 MB"]];
        const KEEP = [["src/components/Hero.tsx", "6 KB"], ["访谈纪要-李.docx", "64 KB"], ["周会 10-28.md", "8 KB"]];
        const kept = s === "add" ? 222 : s === "remove" ? 220 : 222;
        const model = s === "model" || s === "late" ? "DeepSeek-V4" : "MiniMax-M3";
        const what = {
          add: L("你加了 3 份。只读这 3 份，其余 222 份沿用；摘要和待办按新范围重出。", "You added 3. Only those 3 are read; the other 222 carry over. The summary and to-dos are redone for the new scope."),
          remove: L("你去掉了 2 份。其余不重读；摘要和待办按新范围重出，去掉的不会进项目。", "You removed 2. Nothing else is re-read; the summary and to-dos are redone, and the removed ones won't enter the project."),
          model: L("你换成了 DeepSeek。材料都沿用、不重读；只用新模型重出摘要和待办。", "You switched to DeepSeek. Materials carry over unread; only the summary and to-dos are redone."),
          late: L("上次用 MiniMax 按旧范围发出的整理，10:51 才回来，晚了，没用。", "The summary sent to MiniMax for the old scope came back at 10:51 — too late, so it wasn't used."),
        }[s];
        const SUM_OLD = L("官网改版在第二轮：首页英雄区已重做［S12］；Gartner 报告认为 2026 年 Agent 采购会翻倍［S88］。", "The redesign is in round two: the hero is redone [S12]; Gartner expects agent purchases to double in 2026 [S88].");
        const SUM_NEW = s === "add" ? L("官网改版在第二轮：首页英雄区已重做［S12］；11-04 周会定下先上移动端注册［S224］，设计评审要求把注册缩成两步［S225］。", "The redesign is in round two: the hero is redone [S12]; the 11-04 meeting put mobile sign-up first [S224], and the design review asks for a two-step sign-up [S225].")
          : s === "remove" ? L("官网改版在第二轮：首页英雄区已重做，订阅表单待接入支付［S12］；访谈里李提到注册太长［S77］。", "The redesign is in round two: the hero is redone, the subscribe form awaits payments [S12]; Li said sign-up is too long [S77].")
          : L("官网改版进入第二轮。已完成：首页英雄区［S12］。待定：支付接入［S12］、注册流程缩短［S77］。", "The redesign is in round two. Done: the hero [S12]. Open: payments [S12], a shorter sign-up [S77].");
        const summaryCard = (body, o = {}) => `<div class="ob-card${o.stale ? " is-stale" : ""}${o.landed ? " is-landed" : ""}"><div class="ob-card__h">${ic("sparkles", "sm")}<b>${L("工作脉络", "How the work stands")}</b>${o.badge || ""}</div>${body ? `<p>${body}</p>` : `<div class="ob-skel" aria-hidden="true"><span class="mw-skeleton"></span><span class="mw-skeleton"></span><span class="mw-skeleton"></span></div><p class="cap">${L(`${model} 正在按新范围整理…`, `${model} is summing up the new scope…`)}</p>`}</div>`;
        const lateNote = s === "late" ? `<div class="ob-late" role="status">${ic("history", "sm")}<span>${what}</span></div>` : "";
        // Progress for the redo: reading only what changed, then the summary.
        const readLine = s === "add" ? (done ? L("补读 3 份 · 222 份沿用", "Read 3 new · 222 carried over") : L("补读第 2 / 3 份 · 222 份沿用", "Reading 2 of 3 new · 222 carried over")) : s === "remove" ? L("不用重读 · 220 份沿用", "Nothing to re-read · 220 carried over") : L("不用重读 · 222 份沿用", "Nothing to re-read · 222 carried over");
        const phases = `<ol class="ob-phases">
          <li class="${s === "add" && !done ? "is-run" : "is-done"}">${ring(s === "add" && !done ? "running" : "done")}<span><b>${L("读取", "Read")}</b><small>${readLine}</small></span></li>
          <li class="${done ? "is-done" : "is-wait"}">${ring(done ? "done" : s === "add" ? "waiting" : "running")}<span><b>${L("重出摘要和待办", "Redo the summary and to-dos")}</b><small>${done ? L(`${model} · 按新范围`, `${model} · new scope`) : s === "add" ? L("等补读完", "After the new ones are read") : L(`${model} · 第 1 / 2 批`, `${model} · batch 1 of 2`)}</small></span></li></ol>`;
        let left = "", right = "";
        const finish = done ? "" : btn(L("模拟：整理完成", "Sample: finish"), { v: "ghost", act: "finish", cls: "ob-sim" });

        if (scheme === "A") {
          const rows = [
            s === "add" ? ["plus", "add", L("补读 3 份新加的", "Read the 3 new ones"), ADD.map((a) => a[0]).join("、")] : null,
            s === "remove" ? ["minus", "rem", L("2 份不再用", "2 no longer used"), REM.map((a) => a[0]).join("、")] : null,
            ["check", "keep", L(`${kept} 份沿用，不重读`, `${kept} carried over, not re-read`), L("读好的原文和你的修改都留着", "Read text and your edits are kept")],
            s === "model" || s === "late" ? ["sparkles", "redo", L("换成 DeepSeek-V4", "Switched to DeepSeek-V4"), L("连接用设置里存好的那一个", "Uses the connection saved in Settings")] : null,
            ["refresh", "redo", L("摘要和待办重出", "Summary and to-dos redone"), L("旧的不会当成新范围的结果", "The old ones won't pass as the new scope's")],
          ].filter(Boolean);
          left = `<div class="ob-delta"${c.fresh(L("「这次只做这些」卡：行用组件板的行与图标块；整张卡是新的", "“Only this, this time”: board rows and tiles; the card itself is new"))}><div class="ob-delta__h">${L("这次只做这些", "Only this, this time")}</div>${rows.map(([icon, tone, t, d]) => `<div class="ob-delta__r is-${tone}"><span class="ob-tile">${ic(icon, "sm")}</span><span class="nm"><b>${esc(t)}</b><small class="ell" title="${esc(d)}">${esc(d)}</small></span></div>`).join("")}</div>${lateNote}${phases}${finish}`;
          right = `<div class="ob-scene">${done ? summaryCard(SUM_NEW, { badge: badge(L("新范围", "New scope"), "success"), landed: true }) : summaryCard(SUM_OLD, { stale: true, badge: badge(L("旧范围 · 10:42", "Old scope · 10:42"), "neutral") }) + `<p class="ob-stale-note">${ic("info", "sm")}${L("这份是旧范围的，不能采用；新的出来后换掉它。", "This one is from the old scope and can't be adopted; it's replaced when the new one lands.")}</p>`}</div>`;
        } else if (scheme === "B") {
          const row = (n, size, mark) => K.renderFileRow({ name: n, size, className: "ob-dr is-" + mark, state: mark === "add" ? badge(done ? L("新加 · 已读", "New · read") : L("新加", "New"), "success") : mark === "rem" ? badge(L("不再用", "Not used"), "neutral") : `<span class="mw-file-row__state">${L("沿用", "Kept")}</span>` });
          const rows = [...(s === "add" ? ADD.map(([n, z]) => row(n, z, "add")) : []), ...(s === "remove" ? REM.map(([n, z]) => row(n, z, "rem")) : []), ...KEEP.map(([n, z]) => row(n, z, "keep"))];
          left = `<p class="ob-lede">${what}</p>${lateNote}${phases}${finish}`;
          right = `<div class="ob-scene">${done ? summaryCard(SUM_NEW, { badge: badge(L("新范围", "New scope"), "success"), landed: true }) : `<div class="ob-banner" role="status">${tag(L("按新范围重出中", "Redoing for the new scope"), "running", "progress")}<span class="cap">${L("旧摘要已收起，不会被采用", "The old summary is put away and can't be adopted")}</span></div>`}
            ${K.renderFileGroup({ glyph: "folder-open", title: L(`材料 · ${s === "add" ? 225 : kept} 份`, `Materials · ${s === "add" ? 225 : kept}`), caption: s === "model" || s === "late" ? L("换模型不改材料", "Changing the model doesn't touch materials") : L("变化标在每一行", "Changes are marked on each row"), rows, note: L(`另外 ${kept - 3} 份沿用`, `${kept - 3} more carried over`), className: "ob-diff" + (c.S.marks ? "" : "") })}</div>`;
        } else {
          const ver = S.v.ver || "new";
          const tabs = K.renderTabs({ label: L("摘要版本", "Summary version"), tabs: [{ id: "new", label: L("第 2 版 · 新范围", "v2 · new scope"), selected: ver === "new", attrs: { "data-act": "ver", "data-arg": "new" } }, { id: "old", label: L("第 1 版 · 旧范围", "v1 · old scope"), selected: ver === "old", attrs: { "data-act": "ver", "data-arg": "old" } }] });
          const phasesC = phases.replace(readLine, readLine + (s === "remove" ? L(" · 去掉 2 份", " · 2 removed") : s === "model" || s === "late" ? L(" · 换成 DeepSeek-V4", " · now DeepSeek-V4") : ""));
          left = `<p class="ob-lede">${s === "late" ? L("旧的结果晚到了，没用。", "An old result came late and wasn't used.") : L("只重做受影响的部分。", "Only what's affected is redone.")}</p>${lateNote}${phasesC}${finish}`;
          right = `<div class="ob-scene">${tabs}${ver === "old" ? summaryCard(SUM_OLD, { stale: true, badge: badge(L("只能看，不能采用", "View only"), "neutral") }) : done ? summaryCard(SUM_NEW, { badge: badge(L("可以采用", "Ready to adopt"), "success"), landed: true }) : summaryCard("")}</div>`;
        }
        return ob(c, { step: 2, q: s === "late" ? L("接着用新范围", "Carrying on with the new scope") : L("按新范围整理", "Summing up the new scope"), left, right, primary: L("继续", "Continue"), primaryDisabled: !done });
      },

      // ---------------------------------------------------------------- Coding 一轮里的材料
      // One model for every state: the materials (each with how far it was read), the phase of the round (draft → reading →
      // stopped | running → done), a notice, and what Coding said. "走一遍" plays the states in order from the send button.
      coding(c) {
        const { L, esc, sch, st, ic, btn, ring, tag, badge, OUT, rise, you, round, ai, recover, hint, frame, dirCol, composer, working, S } = c;
        const scheme = sch(), s = st(), fixed = S.v.fixed, w = S.v.w || 0;
        const M = (n, how, k) => ({ n, how, k });
        const LI = M("访谈纪要-李.docx", L("全文", "Whole text"), "ok");
        const GA = M("Gartner AI Agents 2026.pdf", L("先读前 12,000 字，要时接着读", "First 12,000 characters; more on demand"), "info");
        const CS = M("竞品表.csv", L("全文", "Whole text"), "ok");
        const MT = M("周会 10-28.md", L("全文", "Whole text"), "ok");
        const DELETED = L("读不到了：11:02 在项目里删了", "Can't be read: deleted from the project at 11:02");
        let mats = [LI, GA, CS, MT], phase = "running", notice = null, said = [], many = s === "many";
        const SAY1 = L("读了访谈和周会：注册现在 4 步，李说太长。先把「邮箱」「密码」两页合成一页……", "Read the interviews and the meeting: sign-up is 4 steps and Li says it's too long. Merging the email and password pages first…");
        const RECS = {
          gone: { tone: "err", carry: false, title: L("这一轮没开始：「访谈纪要-李」读不到了", "This round didn't start: “访谈纪要-李” can't be read"), body: L("它 11:02 在项目里被删了。去掉这份，就接着读其余 3 份；你的话不用重写。", "It was deleted from the project at 11:02. Remove it and the other 3 are read next; no need to rewrite your message."), kept: [L("你写的话", "Your message"), L("其余 3 份材料", "The other 3 materials")], acts: [["primary", "fix", L("去掉这份再开始", "Start without it")], ["secondary", "toast", L("换一份", "Pick another"), L("资料选择器（模拟）", "Materials picker (sample)")]], tech: "knowledge.read → materials.not_found (artifact 7f3c…, deleted 11:02)" },
          revoked: { tone: "wait", carry: false, title: L("这一轮没开始：Coding 读项目资料的授权关了", "This round didn't start: Coding's access to project materials is off"), body: L("你在 设置 › 插件权限 里关了「读项目资料」。重新打开，或者这一轮不带材料。", "“Read project materials” was turned off in Settings › Plugin permissions. Turn it back on, or run this round without materials."), kept: [L("你写的话", "Your message"), L("选的 4 份材料", "The 4 materials picked")], acts: [["primary", "fix", L("打开授权", "Turn access on")], ["secondary", "toast", L("不带材料开始", "Start without materials"), L("这一轮不带材料（模拟）", "Running without materials (sample)")]], tech: "action gateway → permission.denied (coding → knowledge.read@1)" },
          changed: { tone: "info", title: L("「周会 10-28」在这一轮开始后改过", "“周会 10-28” changed after the round started"), body: L("这一轮接着用 10:40 的版本，前后一致；下一轮用你改过的。", "This round keeps the 10:40 version so it stays consistent; the next round uses your edit."), acts: [["secondary", "toast", L("用新版本重开这一轮", "Restart with the new version"), L("会先停下这一轮（模拟）", "Stops this round first (sample)")]] },
          restart: { tone: "info", title: L("Molis Work 重启过，接着这一轮", "Molis Work restarted; carrying on with this round"), body: L("材料用这一轮开始时的版本，没有重读，也没有换。", "Materials stay at the round's starting versions — not re-read, not swapped."), acts: [] },
          removed: { tone: "ok", landed: true, title: L("去掉了「访谈纪要-李」，接着读其余 3 份", "Removed “访谈纪要-李”; reading the other 3"), acts: [] },
          granted: { tone: "ok", landed: true, title: L("授权打开了，这一轮开始了", "Access is on; the round started"), body: L("4 份材料都读到了。", "All 4 materials were read."), acts: [] },
        };
        const changedMT = () => Object.assign(MT, { how: L("用 10:40 的版本 · 之后你改过", "Using the 10:40 version · you changed it since"), k: "unk" });

        if (s === "walk") {
          // 0 draft · 1 reading the first · 2 it can't be read · 3–5 reading the other three · 6 working · 7 reads on in the long PDF
          // · 8 a material changes mid-round · 9 the round ends.
          const idle = (m) => Object.assign(m, { how: L("发出后读", "Read once sent"), k: "skip" });
          if (w === 0) { phase = "draft"; mats.forEach(idle); }
          else if (w <= 2) {
            phase = w === 1 ? "reading" : "stopped";
            Object.assign(LI, w === 1 ? { how: L("在读…", "Reading…"), k: "run" } : { how: DELETED, k: "err" });
            [GA, CS, MT].forEach((m) => Object.assign(m, { how: L("还没读", "Not read yet"), k: "wait" }));
            if (w === 2) notice = RECS.gone;
          } else {
            mats = [GA, CS, MT];
            const order = [GA, CS, MT], k = w - 3; // 0..2 reading GA, CS, MT
            order.forEach((m, i) => { if (w < 6 && i === k) Object.assign(m, { how: L("在读…", "Reading…"), k: "run" }); else if (w < 6 && i > k) Object.assign(m, { how: L("还没读", "Not read yet"), k: "wait" }); });
            phase = w < 6 ? "reading" : w < 9 ? "running" : "done";
            if (w === 3) notice = RECS.removed;
            if (w >= 7) Object.assign(GA, { how: L("读了前 24,000 字（接着读了一段）", "Read the first 24,000 characters (read on once)"), k: "info" });
            if (w >= 8) { changedMT(); notice = RECS.changed; }
            if (w >= 6) said.push(L("读了竞品表和周会：注册现在 4 步，周会定了先做移动端。先把「邮箱」「密码」两页合成一页……", "Read the comparison table and the meeting: sign-up is 4 steps and mobile comes first. Merging the email and password pages first…"));
            if (w >= 7) said.push(L("又读了 Gartner 报告的第 2 段：里面提到两步注册的转化数据，用在了说明里。", "Read on in the Gartner report: its two-step sign-up conversion figures went into the notes."));
            if (w >= 9) said.push(L("改好了：注册合成两步，3 个文件，测试通过。没用到访谈纪要（这一轮去掉了）。", "Done: sign-up is two steps, 3 files changed, tests pass. The interview notes weren't used (removed this round)."));
          }
        } else if (s === "gone" || s === "revoked") {
          if (!fixed) {
            phase = "stopped"; notice = RECS[s];
            if (s === "gone") { Object.assign(LI, { how: DELETED, k: "err" }); [GA, CS, MT].forEach((m) => Object.assign(m, { how: L("还没读", "Not read yet"), k: "wait" })); }
            else mats.forEach((m) => Object.assign(m, { how: L("没有读：授权关了", "Not read: access is off"), k: "hold" }));
          } else { notice = s === "gone" ? RECS.removed : RECS.granted; if (s === "gone") mats = [GA, CS, MT]; said.push(SAY1); }
        } else {
          if (s === "changed") { changedMT(); notice = RECS.changed; }
          if (s === "restart") { mats.forEach((m) => { m.how = L("本轮开始时的版本，没重读", "The round's version, not re-read"); m.k = "ok"; }); notice = RECS.restart; }
          said.push(SAY1);
        }

        const word = (k) => ({ ok: L("读了", "Read"), info: L("读了一部分", "Partly read"), err: L("读不到", "Unreadable"), hold: L("没读", "Not read"), unk: L("旧版本", "Older version"), run: L("在读", "Reading"), wait: L("等着读", "Waiting"), skip: L("发出后读", "On send") })[k];
        const matRow = (m) => { const [r, t] = OUT[m.k]; return `<div class="row${m.k === "wait" || m.k === "skip" ? " is-quiet" : ""}">${c.K.renderFileKind(m.n)}<span class="nm kv mrow"><b class="ell" title="${esc(m.n)}">${esc(m.n)}</b><span class="ell" title="${esc(m.how)}">${esc(m.how)}</span></span>${m.k === "unk" ? badge(word(m.k), "neutral") : tag(word(m.k), r, t)}</div>`; };
        const count = many ? 30 : mats.length;
        const readN = mats.filter((m) => ["ok", "info", "unk"].includes(m.k)).length;
        const head = many ? L("带进来的材料 · 30 份（每轮上限）· 已读 9 份，其余要时再读", "Materials · 30 (the per-round limit) · 9 read, the rest on demand")
          : phase === "reading" ? L(`带进来的材料 · 在读 ${readN + 1} / ${count}`, `Materials · reading ${readN + 1} of ${count}`) : L(`带进来的材料 · ${count} 份`, `Materials · ${count}`);
        const started = phase === "running" || phase === "done";
        const roundLine = started ? round(L("执行", "Execute"), phase === "done" ? L(" · 已结束", " · ended") : "") : "";
        // In the walk-through, what this beat added rises in; the rest stays put.
        const SAID_AT = [6, 7, 9], NOTICE_AT = { 2: 1, 3: 1, 8: 1 };
        const beat = (html, at) => s === "walk" && w === at ? `<div class="is-new">${html}</div>` : html;
        const says = said.map((t, i) => beat(ai(`<p>${esc(t)}</p>`), SAID_AT[i])).join("") + (phase === "running" && s === "walk" ? working(L("在改 SignUp.tsx…", "Editing SignUp.tsx…")) : "");
        const reading = phase === "reading" ? working(L(`正在读材料 ${readN + 1} / ${count}…`, `Reading material ${readN + 1} of ${count}…`)) : "";
        const replay = s === "walk" && w >= 9 ? rise(`<div class="walk-end">${btn(L("再走一遍", "Play again"), { act: "walk-reset", icon: "refresh" })}</div>`) : "";
        let work = phase === "draft" ? rise(`<div class="walk-start">${ic("info", "sm")}<span>${L("材料已经选好、话也写好了。按发送，看这一轮怎样读材料、碰到读不到的怎样停、去掉后怎样接着。", "Materials are picked and the message is written. Press Send to see how the round reads them, stops on one it can't read, and carries on.")}</span></div>`) : you(MSG(L), "");
        let tray = "", above = "", dir = dirCol({});
        // Before sending, every scheme shows the picked materials as the composer's plain chips (the board's reference chip).
        const plainTray = `<div class="mtray">${mats.map((m) => `<span class="mchip"><span class="ell">${esc(m.n)}</span></span>`).join("")}</div>`;
        if (scheme === "A") {
          if (phase === "draft") tray = plainTray;
          else {
            const rows = many ? mats.map(matRow).join("") + `<div class="row is-quiet"><span class="nm cap">${L("另外 26 份 · 还没用到，要时再读", "26 more · not needed yet, read on demand")}</span>${btn(L("看全部", "See all"), { v: "ghost", act: "toast", arg: L("全部 30 份（模拟）", "All 30 (sample)") })}</div>` : mats.map(matRow).join("");
            work += roundLine + rise(`<div class="list"${c.fresh(L("材料清单：沿用 33 环境 A 的清单行；材料这一种是新的", "Materials list: 33 env A's rows; materials are new"))}><div class="list__head"><span class="grow">${ic("paperclip", "sm")}${head}</span></div>${mats.length ? rows : ""}</div>`);
            if (notice) work += beat(rise(recover(notice)), NOTICE_AT[w] ? w : -1);
            work += says;
          }
        } else if (scheme === "B") {
          const chip = (m) => { const [r] = OUT[m.k]; return `<span class="mchip is-${m.k}" title="${esc(m.how)}">${ring(r, 12)}<span class="ell">${esc(m.n)}</span>${m.k === "err" || m.k === "hold" ? `<button type="button" aria-label="${esc(L("去掉 " + m.n, "Remove " + m.n))}" data-act="fix">${ic("x", "xs")}</button>` : ""}</span>`; };
          tray = `<div class="mtray"${c.fresh(L("材料签：组件板的引用签（mw-ix-chip）加状态环；带状态是新的", "Material chips: the board's reference chip plus a ring; the state is new"))}>${mats.map(chip).join("")}${many ? `<span class="mchip is-more">${L("+26 份", "+26")}</span>` : ""}</div>`;
          if (notice && phase === "stopped") above = hint(notice.tone === "err" ? "err" : "wait", ic("circle-alert", "sm"), esc(notice.title), btn(notice.acts[0][2], { v: "primary", act: "fix" }) + btn(notice.acts[1][2], { v: "ghost", act: "toast", arg: notice.acts[1][3] }));
          else if (notice) above = hint(notice.tone === "ok" ? "ok" : "info", ic(notice.tone === "ok" ? "check" : "info", "sm"), esc(notice.title));
          if (phase !== "draft") work += (started ? round(L("执行", "Execute"), many ? L(" · 30 份材料，已读 9 份", " · 30 materials, 9 read") : L(` · ${count} 份材料`, ` · ${count} materials`) + (phase === "done" ? L(" · 已结束", " · ended") : "")) : "") + reading + says;
        } else {
          if (phase === "draft") tray = plainTray;
          const item = (m) => { const [r] = OUT[m.k]; return `<button type="button" class="mw-dir-row mat is-${m.k}" title="${esc(m.how)}">${ring(r, 12)}<span class="nm">${esc(m.n)}</span><span class="mat-w">${esc(word(m.k))}</span></button>`; };
          const list = (phase === "draft" ? "" : `<div class="c-dir__label">${L("本轮材料", "This round's materials")} · ${count}</div>` + mats.map(item).join("") + (many ? `<div class="mat-more cap">${L("另外 26 份，要时再读", "26 more, read on demand")}</div>` : "") + `<div class="c-dir__label mat-sep">${L("文件", "Files")}</div>`) + c.treeRows();
          dir = dirCol({ list, ...(phase !== "draft" ? { foot: undefined } : {}) });
          if (phase !== "draft") work += roundLine + reading + (notice ? beat(rise(recover(notice)), NOTICE_AT[w] ? w : -1) : "") + says;
        }
        work += replay;
        return frame({ head: { title: L("注册缩成两步", "Two-step sign-up") }, dir, work, composer: composer({ tray, above, placeholder: L("告诉 Coding 要做什么", "Tell Coding what to do"), sendAct: s === "walk" && w === 0 ? "walk-send" : "send" }) });
      },
    },
    acts: (c) => ({
      "scan-stop": () => { c.S.v.stopped = true; c.toast(c.L("已停止清点，找到的 812 项都在", "Stopped; the 812 found are kept")); c.render(); },
      "scan-resume": () => { c.S.v.stopped = false; c.render(); },
      "send-env": () => { c.S.state.check = "sensitive"; c.render(); },
      "env-pick": (el) => { c.S.v.envPick = el.dataset.arg; c.render(); },
      "env-confirm": () => {
        const p = c.S.v.envPick || "strip";
        if (p === "no") { c.toast(c.L("没有发送", "Nothing sent")); return; }
        c.busy("env-confirm", 700, () => { c.S.v.envSent = true; c.toast(p === "strip" ? c.L("只发了变量名，下次整理会用到", "Names only; used in the next summary") : c.L("原样发送；这次整理会用到", "Sent as is; used in the next summary"), "done"); });
      },
      filter: (el) => { c.S.v.filter = el.dataset.arg; c.render(); },
      chip: (el) => { c.S.v.chip = c.S.v.chip === el.dataset.arg ? null : el.dataset.arg; c.render(); },
      finish: () => c.busy("finish", 900, () => { c.S.v.done = true; }),
      ver: (el) => { c.S.v.ver = el.dataset.arg; c.render(); },
      fix: () => {
        if (c.S.block === "coding" && c.S.state.coding === "walk") { c.busy("fix", 600, () => { c.S.v.w = 3; walk(c, 3); }); return; }
        c.busy("fix", 700, () => { c.S.v.fixed = true; });
      },
      "walk-send": () => { c.S.draft = ""; c.S.v.w = 1; c.render(); walk(c, 1); },
      "walk-reset": () => { c.S.v = {}; c.S.draft = MSG(c.L); c.render(); },
      "ob-next": () => c.toast(c.L("下一步（模拟）", "Next step (sample)"), "done"),
      "ob-back": () => c.toast(c.L("上一步：你的选择都留着（模拟）", "Back: your choices are kept (sample)")),
    }),
  });

  // ---------------------------------------------------------------- the walk-through: one step a beat, waiting where the person acts
  function walk(c, from) {
    const stop = { 2: true, 9: true }; // 2 waits for "start without it"; 9 is the end
    if (stop[from]) return;
    c.after(from === 1 ? 1100 : 1300, () => {
      const S = c.S;
      if (S.block !== "coding" || S.state.coding !== "walk" || S.v.w !== from) return; // the person moved on
      S.v.w = from + 1; c.render(); walk(c, from + 1);
    });
  }

  // ---------------------------------------------------------------- the 04 onboarding sheet, drawn with board parts
  function ob(c, p) {
    const { L, K, ic, esc } = c;
    const STEPS = [Z("材料", "Materials"), Z("模型", "Model"), Z("读取与整理", "Read and sum up"), Z("补几件事", "A few questions"), Z("看方案", "Plan"), Z("采用", "Adopt")];
    const name = c.P(STEPS[p.step]);
    const back = K.renderButton({ label: L("上一步", "Back"), variant: "secondary", size: "md", icon: "back", className: "ob-back", attrs: { "data-act": "ob-back", "aria-label": L("上一步", "Back") } });
    const next = K.renderButton({ label: p.primary, variant: "primary", size: "md", key: "↵", disabled: p.primaryDisabled, attrs: { "data-act": "ob-next" } });
    return `<div class="ob">
      <header class="ob-title"><span class="ob-brand">${ic("brand", "sm")}Molis Work</span><span class="ob-crumb ell">${L("新建项目 · 官网改版", "New project · Website redesign")}</span></header>
      <div class="ob-sheet"><div class="ob-welcome">
        <div class="ob-left"><div class="ob-col"><div class="ob-head"><span class="ob-av">${ic("sparkles", "sm")}</span><h1 tabindex="-1">${esc(p.q)}</h1></div>${p.left}</div></div>
        <div class="ob-right">${p.right}</div>
      </div></div>
      <footer class="ob-bar"><span class="ob-bar__start">${K.renderButton({ label: L("项目", "Projects"), variant: "ghost", size: "md", icon: "chevron-left", className: "ob-exit", attrs: { "data-act": "ob-back", "aria-label": L("项目", "Projects") } })}</span>
        <span class="ob-bar__mid">${K.renderSteps({ total: STEPS.length, current: p.step, label: L("步骤", "Steps") })}<span class="ob-stepname">${p.step + 1}/${STEPS.length} · ${esc(name)}</span></span>
        <span class="ob-bar__end">${back}${next}</span></footer>
    </div>`;
  }

  // The list box's edge fade: data-more says which edges have more to scroll to (the board's overflow fade, turned vertical).
  const edge = (el) => {
    const top = el.scrollTop > 2, bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    const v = top && bottom ? "both" : top ? "start" : bottom ? "end" : "";
    if (v) el.dataset.more = v; else delete el.dataset.more;
  };
  document.addEventListener("scroll", (e) => { if (e.target instanceof Element && e.target.matches(".ob-list")) edge(e.target); }, true);
  const sync = () => document.querySelectorAll(".ob-list").forEach(edge);
  new MutationObserver(sync).observe(document.getElementById("app"), { childList: true, subtree: true });
  addEventListener("resize", sync);
  sync();
})();
