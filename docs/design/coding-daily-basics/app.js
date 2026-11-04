// 35-2 · Coding A 期：命令、图片、工具准备与诊断 — design sample on the shared Coding frame (../coding-frame/coding-proto.js) and the
// component board's parts (menus, buttons, status marks, the diff view, the media zoom). All data is sample data; nothing reads a
// folder, runs a command, downloads a tool or calls a model.
(() => {
  const Z = (zh, en) => [zh, en];
  let langsHtml = "", menuShown = false;
  const data = {
    blocks: [
      { id: "commands", name: Z("命令与说明文件", "Commands and instruction files") },
      { id: "images", name: Z("图片", "Images") },
      { id: "tools", name: Z("代码理解工具", "Code-understanding tools") },
      { id: "checks", name: Z("写后检查与格式化", "After-write checks and formatting") },
    ],
    decided: { commands: "A", images: "A", tools: "A", checks: "A" },
    schemes: {
      commands: { A: Z("A 放进现有斜杠菜单，按来源分组", "A In the existing slash menu, grouped by source"), B: Z("B 单独的「命令」面板", "B A separate Commands panel"), C: Z("C 输入框上方常用命令签", "C Frequent commands as chips above the composer") },
      images: { A: Z("A 输入框里一排缩略图", "A A row of thumbnails inside the composer"), B: Z("B 附件签，和材料一样", "B Attachment chips, like materials"), C: Z("C 先进对话的待发图片卡", "C A pending image card in the conversation") },
      tools: { A: Z("A 过程里一行，展开看", "A One process line that opens"), B: Z("B 输入框底栏的状态签", "B A status chip in the composer footer"), C: Z("C 文件栏底部的语言面板", "C A languages panel under the files") },
      checks: { A: Z("A 审查卡顶部一行检查结果", "A One check line at the top of the review card"), B: Z("B 差异里出错的行就地标出", "B Marks on the failing lines in the diff"), C: Z("C 审查卡底部的检查分区", "C A checks section at the bottom of the review card") },
    },
    states: {
      commands: [["menu", "打 / 看全部命令", "Type / to see every command"], ["args", "用一个带参数的命令", "Use a command with an argument"], ["none", "项目还没有命令", "The project has no commands yet"], ["broken", "有一个命令文件读不了", "One command file can't be read"], ["init", "/init 起草说明文件", "/init drafts an instruction file"], ["read", "这一轮读到了哪些说明", "Which instructions this round read"]],
      images: [["attached", "贴了两张截图", "Two screenshots pasted"], ["sent", "发出后在消息里", "In the sent message"], ["no-vision", "当前模型看不到图", "The current model can't see images"], ["too-big", "图片太大", "An image is too large"], ["ai-looked", "Coding 自己看了工作区里的图", "Coding looked at an image in the workspace"]],
      tools: [["reuse", "用本机已有的", "Using the one already on this machine"], ["download", "缺了，正在下载", "Missing; downloading"], ["offline", "不允许联网，没法下载", "Offline; can't download"], ["failed", "下载失败", "The download failed"], ["restart", "重启后核对", "Checked after a restart"]],
      checks: [["clean", "没有新错误，已格式化", "No new errors, formatted"], ["errors", "写完有 2 个新错误", "Two new errors after writing"], ["fixed", "Coding 修好后再给你看", "Coding fixed them before review"], ["unavailable", "这次没查（工具没准备好）", "Not checked (tool not ready)"], ["format-failed", "格式化失败，按原样给你看", "Formatting failed; shown as written"]],
    },
  };

  // The hero change, before and after (formatted), for the board's diff view.
  const BEFORE = "export function Hero() {\n  return (\n    <section className=\"hero\">\n      <h1>欢迎来到 website</h1>\n      <p>我们做三件事。</p>\n      <a href=\"/start\">开始</a>\n    </section>\n  );\n}\n";
  const AFTER = "import { SubscribeForm } from \"./SubscribeForm\";\n\nexport function Hero() {\n  return (\n    <section className=\"hero\">\n      <h1>一句话说清 website</h1>\n      <SubscribeForm source=\"hero\" />\n    </section>\n  );\n}\n";
  const AS_WRITTEN = "import {SubscribeForm} from './SubscribeForm'\n\nexport function Hero() {\n  return (\n    <section className=\"hero\">\n      <h1>一句话说清 website</h1>\n        <SubscribeForm source='hero'/>\n    </section>\n  )\n}\n";
  const DIFF_WORDS = { before: Z("改之前 {path} v{version}", "Before {path} v{version}"), after: Z("改之后 {path} v{version}", "After {path} v{version}"), pinned: Z("{workspace}", "{workspace}"), mismatch: Z("两边不在同一个工作区", "Different workspaces"), partial: Z("只显示改动的部分", "Changed hunks only"), coarse: Z("改动太大，中间整段对比", "Too large; compared as a block"), created: Z("新文件", "New file"), removed: Z("删除的文件", "Deleted file"), identical: Z("两边一样", "No difference"), comment_before: Z("评论改之前第 {number} 行", "Comment on old line {number}"), comment_after: Z("评论改之后第 {number} 行", "Comment on new line {number}"), insert: Z("新增", "Added"), delete: Z("删除", "Removed"), same: Z("不变", "Unchanged"), reveal: Z("展开 {count} 行", "Show {count} lines") };

  window.codingProto({
    key: "molis-proto.coding-daily-basics.v1",
    data,
    defaults: (c) => { const { S, st } = c; if (S.block === "commands" && st() === "args") S.draft = ""; },
    blocks: {
      // ---------------------------------------------------------------- 命令与说明文件 (A1, A2)
      commands(c) {
        const { L, sch, st, ic, btn, badge, rise, you, round, ai, recover, hint, frame, dirCol, composer, S, esc, item, group, K } = c;
        const s = st(), scheme = sch();
        const cmds = commandList(c);
        let work = "", above = "", tray = "", below = "";
        if (s === "init") {
          work += you("/init") + round(L("执行", "Execute"));
          work += ai(`<p>${L("读了 package.json、README、src/ 和 tests/，起草了一份 AGENTS.md。写进仓库之前给你看。", "Read package.json, README, src/ and tests/ and drafted an AGENTS.md. You see it before it goes into the repo.")}</p>`);
          work += rise(reviewCard(c, { path: "AGENTS.md", created: true, before: "", after: "# website\n\n- 用 pnpm：pnpm install、pnpm test、pnpm dev（端口 5173）\n- 组件放 src/components，一个组件一个文件\n- 改了组件要补 tests/ 里同名的测试\n- 不要改 .env.local；密钥只用引用\n", checks: "" }));
        } else if (s === "read") {
          work += you(L("首页加一个订阅表单。", "Add a subscribe form to the home page.")) + round(L("执行", "Execute"));
          work += ai(`<p>${L("按 AGENTS.md 的约定，组件放 src/components，同时补了 tests/SubscribeForm.test.tsx。", "Following AGENTS.md: the component lives in src/components, with tests/SubscribeForm.test.tsx alongside.")}</p>`);
          work += rise(`<div class="list"${c.fresh(L("「本轮读到的说明」：列表是组件板的；放在规则菜单里（12 已定）还是单独列，见说明", "“Instructions this round read”: board list; shown in the rules menu (12) — see notes"))}><div class="list__head"><span class="grow">${ic("book", "sm")}${L("这一轮读到的说明", "Instructions this round read")}</span><span class="cap">${L("在「规则」里也能看", "Also under “Rules”")}</span></div>${[["AGENTS.md", L("整个仓库", "Whole repo"), L("10-31 改过", "changed 10-31")], ["src/AGENTS.md", L("src/ 下的文件", "Files under src/"), L("10-28 改过", "changed 10-28")], ["CLAUDE.md", L("整个仓库（和 AGENTS.md 一起读）", "Whole repo (read with AGENTS.md)"), L("09-12 改过", "changed 09-12")], [L("项目指引", "Project guidance"), L("Molis 项目设置里写的", "Written in Molis project settings"), L("11-02 改过", "changed 11-02")]].map(([f, w, v]) => `<div class="row">${ic("file", "sm")}<span class="nm"><b style="font-weight:500">${esc(f)}</b> <span class="cap">· ${esc(w)}</span></span><span class="t">${esc(v)}</span>${badge(L("读到了", "Read"), "success")}</div>`).join("")}<div class="list__foot">${ic("info", "sm")}<span class="ell">${L("项目没被信任时不读仓库里的说明文件；信任只决定读不读，不加权限。", "An untrusted project's instruction files aren't read; trust only decides reading, never grants more.")}</span></div></div>`);
        } else {
          work += you(L("把首屏换成一句主张加订阅表单。", "Make the hero one claim plus the subscribe form.")) + round(L("执行", "Execute"));
          work += ai(`<p>${L("首屏改好了，测试也过了。", "The hero is done and the tests pass.")}</p>`);
          if (s === "broken" && scheme !== "A") work += rise(recover({ tone: "wait", title: L("命令 /发版检查 读不了", "Command /release-check can't be read"), body: L(".molis/commands/发版检查.md 开头的设置写错了（缺结尾的 ---）。别的命令照常可用。", "The header in .molis/commands/release-check.md is malformed (missing the closing ---). Other commands still work."), acts: [["secondary", "toast", L("打开这个文件", "Open the file"), L("打开 .molis/commands/发版检查.md（模拟）", "Opening the file (sample)")]], tech: ".molis/commands/发版检查.md:1 — front matter not closed", carry: false }));
        }
        const argFilled = S.v.arg;
        if (s === "args") {
          // The command becomes a chip in the composer; its argument is the rest of the line; the expanded prompt can be checked.
          tray = `<div class="cmdchip"${c.fresh(L("命令签与参数：新增；展开后能看到发出的完整提示", "Command chip and argument: new; opens to the exact prompt sent"))}><span class="cmdchip__name">${ic("terminal", "xs")}/补测试</span><span class="cmdchip__src">${L("项目", "Project")}</span>${btn(L("去掉命令", "Remove command"), { icon: "x", iconOnly: true, v: "ghost", act: "toast", arg: L("去掉了命令（模拟）", "Command removed (sample)") })}</div>`;
          S.draft = S.draft || "src/components/Hero.tsx";
          below = `<details class="tech expanded"><summary>${ic("chevron-right", "xs")}${L("发出去的完整提示", "The prompt that will be sent")}</summary><code>${esc(L("给 src/components/Hero.tsx 补测试：覆盖每个分支和空状态；用 tests/ 里已有的写法；跑 pnpm test，不改被测代码。", "Add tests for src/components/Hero.tsx: cover each branch and the empty state; follow the style in tests/; run pnpm test; don't change the code under test."))}</code></details>`;
        }
        if (scheme === "C" && s !== "init" && s !== "read") {
          const recent = cmds.project.concat(cmds.mine).filter((x) => !x.broken).slice(0, 3);
          above = `<div class="cmdrow"${c.fresh(L("常用命令签：新增", "Frequent command chips: new"))}>${recent.map((x) => `<button type="button" class="mw-badge cmdpick" data-act="use-cmd" data-arg="${esc(x.slash)}">${ic("terminal", "xs")}/${esc(x.slash)}</button>`).join("")}<button type="button" class="mw-badge cmdpick is-more" data-act="slash">${L("全部命令", "All commands")} <kbd class="mw-kbd">/</kbd></button></div>`;
        }
        if (scheme === "B" && s !== "init" && s !== "read") above = `<div class="cmdrow">${btn(L("命令", "Commands"), { icon: "terminal", act: "palette", v: "ghost" })}<span class="cap">${L("也可以 ⌘⇧P", "or ⌘⇧P")}</span></div>`;
        return frame({ head: { title: L("首页改版：换成新的首屏", "Home redesign: a new hero") }, dir: dirCol({ rows: [["folder-open", ".molis", 0], ["folder-open", "commands", 1], ["file", "补测试.md", 2], ["file", "发版检查.md", 2], ["folder-open", "src", 0], ["file", "Hero.tsx", 1, "M"], ["folder", "tests", 0], ["file", "AGENTS.md", 0], ["file", "CLAUDE.md", 0]], selected: "补测试.md" }), work, composer: composer({ above, tray, below, placeholder: s === "args" ? L("参数：写给这个命令的内容", "Argument for this command") : undefined }) });
      },

      // ---------------------------------------------------------------- 图片 (A3)
      images(c) {
        const { L, sch, st, ic, btn, badge, ring, rise, you, round, ai, recover, hint, foldStep, fold, frame, dirCol, composer, S, esc, plainTag } = c;
        const s = st(), scheme = sch();
        const shots = [{ name: L("首屏-现在.png", "hero-now.png"), size: "214 KB", hue: 210 }, { name: L("设计稿-首屏.png", "design-hero.png"), size: "388 KB", hue: 28 }];
        if (s === "too-big") shots[1] = { name: L("设计稿-首屏.png", "design-hero.png"), size: "12.4 MB", hue: 28, big: true };
        const novision = s === "no-vision" && !S.v.model;
        const thumb = (x, i, size = 56) => `<span class="thumb${x.big ? " is-big" : ""}" style="--h:${x.hue};width:${size}px;height:${Math.round(size * 0.68)}px" data-act="zoom" data-arg="${i}" role="button" tabindex="0" aria-label="${esc(x.name)}"><i></i><i></i><i></i></span>`;
        let work = "", tray = "", above = "", boxCls = "";
        if (s === "sent" || s === "ai-looked") {
          work += you(L("照右边的设计稿改首屏，左边是现在的样子。", "Change the hero to match the design on the right; the left is how it looks now."), `<span class="you__imgs">${shots.map((x, i) => thumb(x, i, 120)).join("")}</span>`) + round(L("修改", "Edit"));
          if (s === "ai-looked") work += rise(`<div class="proc">${fold(`${ic("image", "xs")} ${L("看了 2 张图 · 改了 2 个文件", "Looked at 2 images · changed 2 files")}`, foldStep(`${ic("image", "xs")} ${L("看了你发的 2 张截图", "Looked at your 2 screenshots")}`) + foldStep(`${ic("eye", "xs")} ${L("看了工作区里的 design/hero-v2.png（只读）", "Looked at design/hero-v2.png in the workspace (read-only)")}`, `<div class="pf-line">${thumb({ hue: 160, name: "design/hero-v2.png" }, 9, 96)}<span class="cap">design/hero-v2.png · 1440×900 · ${L("没改", "unchanged")}</span></div>`) + foldStep(`${ic("edit", "xs")} Hero.tsx、hero.css`), { open: true })}</div>`);
          work += ai(`<p>${L("按设计稿把标题换成一句话、按钮改成实心深色，间距从 24 收到 16。", "Per the design: a one-line title, a solid dark button, spacing from 24 down to 16.")}</p>`);
        } else {
          work += you(L("首屏的按钮太浅了。", "The hero button is too faint.")) + round(L("修改", "Edit"));
          work += ai(`<p>${L("可以贴一张截图给我，我照着改。", "Paste a screenshot and I'll work from it.")}</p>`);
        }
        const composing = ["attached", "no-vision", "too-big"].includes(s);
        if (composing) {
          S.draft = S.draft || L("照右边的设计稿改首屏，左边是现在的样子。", "Change the hero to match the design on the right; the left is how it looks now.");
          if (scheme === "A") tray = `<div class="imgtray"${c.fresh(L("输入框里的缩略图排：新增（组件板只有文件行）", "Thumbnail row inside the composer: new (the board only has file rows)"))}>${shots.map((x, i) => `<span class="imgtray__item">${thumb(x, i)}<span class="imgtray__meta"><b class="ell">${esc(x.name)}</b><small>${x.big ? L("12.4 MB · 超过 5 MB", "12.4 MB · over 5 MB") : `${x.size} · ${L("已存一份", "saved")}`}</small></span>${btn(L("去掉", "Remove"), { icon: "x", iconOnly: true, v: "ghost", act: "toast", arg: L("去掉了这张图（模拟）", "Image removed (sample)") })}</span>`).join("")}</div>`;
          if (scheme === "B") above = `<div class="mw-file-list imgchips"${c.fresh(L("附件签带小缩略图：在组件板的文件行上加缩略图", "Attachment chips with a small thumbnail: the board's file row plus a thumbnail"))}>${shots.map((x, i) => `<div class="imgchip">${thumb(x, i, 28)}<span class="ell">${esc(x.name)}</span><small>${x.big ? "12.4 MB" : x.size}</small>${btn(L("去掉", "Remove"), { icon: "x", iconOnly: true, v: "ghost", act: "toast", arg: L("去掉了这张图（模拟）", "Image removed (sample)") })}</div>`).join("")}</div>`;
          if (scheme === "C") work += rise(`<div class="pending"${c.fresh(L("待发图片卡：新增；发之前能放大、能圈出要改的地方", "Pending image card: new; zoom and circle what to change before sending"))}><div class="pending__head">${ic("image", "sm")}<span class="grow">${L("要一起发的 2 张图", "2 images to send")}</span><span class="cap">${L("还没发", "Not sent yet")}</span></div><div class="pending__imgs">${shots.map((x, i) => `<figure>${thumb(x, i, 180)}<figcaption class="ell">${esc(x.name)} · ${x.big ? "12.4 MB" : x.size}</figcaption></figure>`).join("")}</div><div class="acts">${btn(L("圈出要改的地方", "Circle what to change"), { icon: "edit", act: "toast", arg: L("在图上圈画（模拟）", "Drawing on the image (sample)") })}${btn(L("全部去掉", "Remove all"), { v: "ghost", act: "toast", arg: L("去掉了（模拟）", "Removed (sample)") })}</div></div>`);
          boxCls = "is-drop";
        }
        let sendDisabled = false, sendNote = "";
        if (novision) {
          above += hint("wait", ic("eye-off", "sm"), L("MiniMax-M3 看不到图片：发出去它只收到文字", "MiniMax-M3 can't see images; it would get the text only"), btn(L("换成能看图的模型", "Use a model that sees images"), { v: "primary", act: "vision-model", loading: S.busy === "vision-model" }) + btn(L("不带图发", "Send without images"), { act: "toast", arg: L("图片留在这里，只发文字（模拟）", "Images kept here; sending text only (sample)") }));
          sendDisabled = true; sendNote = L("先选一种", "Choose one first");
        }
        if (s === "too-big") above += hint("wait", ic("circle-alert", "sm"), L("设计稿-首屏.png 有 12.4 MB，超过 5 MB 上限", "design-hero.png is 12.4 MB, over the 5 MB limit"), btn(L("缩小到 5 MB 内再发", "Shrink under 5 MB and send"), { v: "primary", act: "toast-done", arg: L("缩到 3.8 MB，尺寸不变（模拟）", "Shrunk to 3.8 MB, same dimensions (sample)") }));
        const model = S.v.model ? "Claude Sonnet 5.5" : "MiniMax-M3";
        const footExtra = `<span class="only-wide">${composing && !S.v.model && s === "no-vision" ? badge(L("看不到图", "No images"), "warning") : composing ? badge(L("能看图", "Sees images"), "success") : ""}</span>`;
        return frame({ head: { title: L("首页改版：换成新的首屏", "Home redesign: a new hero") }, dir: dirCol({ rows: [["folder-open", "design", 0], ["image", "hero-v2.png", 1], ["folder-open", "src", 0], ["file", "Hero.tsx", 1, "M"], ["file", "hero.css", 1, "M"], ["file", "AGENTS.md", 0]], selected: s === "ai-looked" ? "hero-v2.png" : "Hero.tsx" }), work, composer: composer({ above, tray, boxCls, sendDisabled, sendNote, model, footExtra, leading: btn(L("加图片或文件", "Add an image or file"), { icon: "paperclip", iconOnly: true, v: "ghost", act: "toast", arg: L("选图片，或直接粘贴、拖进来（模拟）", "Pick an image, or paste or drop one (sample)") }) }) });
      },

      // ---------------------------------------------------------------- 代码理解工具 (A4 tool acquisition, CLS-01～03)
      tools(c) {
        const { L, sch, st, ic, btn, badge, ring, rise, you, round, ai, recover, hint, fold, foldStep, frame, dirCol, composer, S, esc, OUT, openPop } = c;
        const s = st(), scheme = sch(), retried = !!S.v.retry;
        // [language, ring outcome, what, detail]
        const langs = [
          ["TypeScript", "ok", L("用本机的", "Local"), L("typescript-language-server 4.3 · 项目要 TS ^5.4，本机 5.6 合用", "typescript-language-server 4.3 · project needs TS ^5.4; local 5.6 fits")],
          s === "reuse" ? null
            : s === "download" ? ["Python", "run", L("下载中", "Downloading"), L("pyright 1.1.389 · 34 MB · 来自 npm 公开源 · 放进工具目录，不改你的环境", "pyright 1.1.389 · 34 MB · from the public npm registry · into the tools folder, your setup untouched")]
            : s === "offline" ? ["Python", "hold", L("没法下载", "Can't download"), L("本项目不允许联网；本机也没有 pyright", "This project is offline and there's no local pyright")]
            : s === "failed" ? (retried ? ["Python", "ok", L("好了", "Ready"), L("pyright 1.1.389 · 重新下载成功", "pyright 1.1.389 · downloaded on retry")] : ["Python", "err", L("下载失败", "Download failed"), L("下到 21/34 MB 断了；半截的没当成能用", "Stopped at 21/34 MB; the partial copy isn't treated as usable")])
            : ["Python", "ok", L("核对过", "Checked"), L("工具目录里的 pyright 1.1.389 完整，直接用", "pyright 1.1.389 in the tools folder is complete; reused")],
        ].filter(Boolean);
        const word = (k, w) => c.K.renderStatusMark({ label: w, state: OUT[k][0], tone: OUT[k][1], plain: k === "ok" });
        const problem = (s === "offline") || (s === "failed" && !retried);
        const summary = s === "download" ? L("准备代码理解 · Python 下载中", "Preparing code understanding · Python downloading") : problem ? L("代码理解 · Python 没准备好", "Code understanding · Python not ready") : L(`代码理解 · ${langs.length} 种语言好了`, `Code understanding · ${langs.length} languages ready`);
        const recs = {
          offline: { tone: "wait", title: L("Python 的代码理解没准备好：不允许联网", "Python code understanding isn't ready: offline"), body: L("能做的照常做：搜索、读文件、改 TypeScript 部分。Python 文件这次查不了定义和错误——不会把「没查」说成「没有错误」。", "Everything else continues: search, reading, the TypeScript part. For Python files this round can't look up definitions or errors — and won't call “not checked” “no errors”."), kept: [L("TypeScript 照常", "TypeScript still works")], acts: [["primary", "toast", L("这次允许下载 pyright", "Allow downloading pyright this time"), L("只为这次任务放行下载这个工具（模拟）", "Allowing this one tool for this task (sample)")]], tech: "pyright: not found on PATH or in project; download blocked by project network setting (offline)" },
          failed: retried ? null : { tone: "err", title: L("pyright 没下载完", "pyright didn't finish downloading"), body: L("下到 21 MB 时网络断了。半截的已经删掉，没当成能用；别的工作照常。", "The network dropped at 21 MB. The partial copy was removed, not treated as usable; other work continues."), kept: [L("TypeScript 照常", "TypeScript still works")], acts: [["primary", "retry-dl", L("重新下载", "Download again")], ["secondary", "toast", L("这次先不用", "Skip it this time"), L("这一轮 Python 文件不查错误；报告里会写明（模拟）", "No Python checks this round; the report says so (sample)")]], tech: "GET https://registry.npmjs.org/pyright/-/pyright-1.1.389.tgz — ECONNRESET after 21.0/34.2 MB · removed ~/.molis-work/tools/pyright/1.1.389.partial" },
        };
        let work = you(L("把 scripts/ 里的 Python 脚本也改成读新的配置格式。", "Update the Python scripts in scripts/ to read the new config format too.")) + round(L("执行", "Execute"));
        let above = "", footExtra = "", foot = "";
        const rowsHtml = langs.map(([lang, k, w, d]) => `<div class="row">${c.ring(OUT[k][0])}<span class="nm kv"><b>${lang}</b><span class="ell">${d}</span></span>${word(k, w)}</div>`).join("");
        if (scheme === "A") {
          work += rise(`<div class="proc">${fold(`${s === "download" ? ring("running", 12) + " " : ""}${summary}`, langs.map(([lang, k, w, d]) => foldStep(`${ring(OUT[k][0], 12)} <b>${lang}</b> · ${d}`)).join("") + (s === "download" ? `<div class="pf-line"><div class="meter" style="flex-basis:160px"><i style="width:44%"></i></div><span class="cap">15 / 34 MB</span></div>` : ""), { open: s !== "reuse", state: problem ? "failed" : undefined })}</div>`);
        } else if (scheme === "B") {
          footExtra = `<button type="button" class="mw-badge langchip${problem ? " is-warn" : ""}" data-act="lang-pop"${c.fresh(L("底栏的代码理解签：新增", "Code-understanding chip in the composer footer: new"))}>${s === "download" ? ring("running", 12) : ring(problem ? "blocked" : "done", 12)}<span class="long">${L("代码理解", "Code")} · </span>${langs.map(([lang, k]) => `${lang === "TypeScript" ? "TS" : "Py"}${k === "ok" ? "" : k === "run" ? " ↓" : " !"}`).join(" ")}</button>`;
          langsHtml = rowsHtml;
        } else {
          foot = `<div class="envp${problem ? " is-err" : ""}"${c.fresh(L("语言面板：文件栏底部，和 33 的环境面板同一处", "Languages panel: under the files, where 33's environment panel sits"))}><div class="envp__head">${ic("code", "xs")}<span class="grow">${L("代码理解", "Code understanding")}</span>${problem ? badge(L("1 种没好", "1 not ready"), "warning") : s === "download" ? ring("running", 12) : badge(L("好了", "Ready"), "success")}</div>${langs.map(([lang, k, w, d]) => `<div class="envp__row" title="${esc(d)}">${ring(OUT[k][0], 12)}<span class="ell"><b>${lang}</b> ${w}</span></div>`).join("")}${s === "download" ? `<div class="envp__row"><div class="meter" style="flex:1;margin:0"><i style="width:44%"></i></div><span class="cap">15/34 MB</span></div>` : ""}</div>`;
        }
        if (recs[s] && scheme === "A") work += rise(recover(recs[s]));
        if (recs[s] && scheme !== "A") above = hint(recs[s].tone, ic("circle-alert", "sm"), esc(recs[s].title), btn(recs[s].acts[0][2], { v: "primary", act: recs[s].acts[0][1], arg: recs[s].acts[0][3], loading: S.busy === recs[s].acts[0][1] }));
        if (s === "failed" && retried) work += rise(recover({ tone: "ok", landed: true, title: L("pyright 重新下载好了", "pyright downloaded on retry"), body: L("Python 文件也能查定义和错误了。", "Python files can be checked too."), acts: [] }));
        if (s === "restart") work += ai(`<p>${L("重启后核对了工具目录：pyright 是完整的，没有重下。", "After the restart I checked the tools folder: pyright is complete, nothing re-downloaded.")}</p>`);
        work += ai(`<p>${s === "download" ? L("先读 scripts/ 里的文件；pyright 下好后再查改动有没有新错误。", "Reading scripts/ first; once pyright is in, I'll check the changes for new errors.") : problem ? L("先改 TypeScript 那部分和能读懂的 Python；Python 的错误这次查不了，最后会写清楚。", "Doing the TypeScript part and the readable Python; Python errors can't be checked this time, and the report will say so.") : L("改了 3 个 Python 文件，没有新错误。", "Changed 3 Python files; no new errors.")}</p>`);
        return frame({ head: { title: L("配置换成新格式", "Move to the new config format"), changes: L("3 处改动", "3 changes") }, dir: dirCol({ rows: [["folder-open", "scripts", 0], ["file", "sync.py", 1, "M"], ["file", "report.py", 1, "M"], ["folder-open", "src", 0], ["file", "config.ts", 1, "M"], ["file", "AGENTS.md", 0]], selected: "sync.py", foot }), work, composer: composer({ above, footExtra }) });
      },

      // ---------------------------------------------------------------- 写后检查与格式化 (A4-2)
      checks(c) {
        const { L, sch, st, ic, btn, badge, rise, you, round, ai, frame, dirCol, composer, S } = c;
        const s = st(), scheme = sch();
        let work = you(L("首屏换成一句主张加订阅表单。", "Make the hero one claim plus the subscribe form.")) + round(L("修改", "Edit"));
        if (s === "fixed") work += ai(`<p>${L("写完有 2 个类型错误，我先修了，再给你看。", "There were 2 type errors after writing; I fixed them before showing you.")}</p>`);
        const after = s === "format-failed" ? AS_WRITTEN : AFTER;
        work += rise(reviewCard(c, { path: "src/components/Hero.tsx", before: BEFORE, after, state: s, scheme }));
        return frame({ head: { title: L("首页改版：换成新的首屏", "Home redesign: a new hero") }, dir: dirCol({ rows: [["folder-open", "src", 0], ["folder-open", "components", 1], ["file", "Hero.tsx", 2, "M"], ["file", "SubscribeForm.tsx", 2, "A"], ["file", ".prettierrc", 0], ["file", "AGENTS.md", 0]], selected: "Hero.tsx" }), work, composer: composer({}) });
      },
    },
    acts(c) {
      const { L, S, toast, busy, openPop, item, group, K, esc } = c;
      return {
        "use-arg": () => { S.v.arg = true; c.render(); },
        "use-cmd": (el) => { S.block = "commands"; S.state.commands = "args"; c.render(); toast(L(`用了 /${el.dataset.arg}`, `Using /${el.dataset.arg}`), "done"); },
        slash: (el) => slashMenu(c, el),
        palette: (el) => slashMenu(c, el, true),
        "vision-model": () => busy("vision-model", 700, () => { S.v.model = true; toast(L("这条换成 Claude Sonnet 5.5 发；之后的轮次不变", "This message goes with Claude Sonnet 5.5; later rounds unchanged"), "done"); }),
        zoom: (el) => toast(L("放大看图（组件板的看图放大）", "Zoomed in (the board's media zoom)")),
        "lang-pop": (el) => openPop(el, `<div class="mw-menu__label">${L("代码理解", "Code understanding")}</div><div class="list" style="box-shadow:none">${langsHtml}</div><div class="foot">${L("缺了就下载到 Molis 自己的工具目录，不改项目依赖和全局安装；遵守项目的联网限制。", "Missing tools go into Molis's own tools folder, never your project or global setup, within the project's network limits.")}</div>`, "wide"),
        "retry-dl": () => busy("retry-dl", 1200, () => { S.v.retry = true; toast(L("pyright 下载好了", "pyright is ready"), "done"); }),
        "see-unformatted": () => { S.v.raw = !S.v.raw; c.render(); },
        write: () => busy("write", 700, () => { S.v.written = true; toast(L("写进去了：就是你看到的这一版", "Written — exactly the version you saw"), "done"); }),
      };
    },
    onKey(c, e) {
      // Typing "/" at the start of an empty composer opens the slash menu (commands block).
      if (e.key === "/" && e.target.id === "draft" && !e.target.value && c.S.block === "commands") { e.preventDefault(); slashMenu(c, e.target); return true; }
      return false;
    },
    after(c) {
      const { S, st } = c;
      if (S.block === "commands" && st() === "menu" && !menuShown) { menuShown = true; const t = document.getElementById("draft"); if (t) setTimeout(() => slashMenu(c, t), 300); }
      if (!(S.block === "commands" && st() === "menu")) menuShown = false;
    },
  });

  function commandList(c) {
    const { L, st } = c;
    const broken = st() === "broken";
    return {
      builtin: [{ slash: "init", label: L("起草说明文件 AGENTS.md", "Draft an AGENTS.md"), kbd: "" }, { slash: "compact", label: L("整理上下文", "Compact the context") }, { slash: "materials", label: L("引用材料", "Reference materials") }, { slash: "model", label: L("换模型", "Change model") }],
      project: st() === "none" ? [] : [{ slash: "补测试", label: L("给一个文件补测试", "Add tests for a file"), arg: L("文件", "file") }, { slash: "发版检查", label: L("发版前检查一遍", "Pre-release check"), broken }],
      mine: [{ slash: "review-ui", label: L("按 DESIGN.md 看一遍界面", "Review the UI against DESIGN.md"), from: ".claude/commands" }],
    };
  }
  function slashMenu(c, anchor, palette = false) {
    const { L, item, group, openPop, sch, st, K, esc } = c;
    const l = commandList(c);
    const row = (x, src) => item({
      lead: `<span class="slash">/${esc(x.slash)}</span>`, label: x.label, sub: x.broken ? L("读不了：开头的设置写错了", "Can't read: malformed header") : x.from ? L(`我的 · 也读 ${x.from}`, `Mine · also read from ${x.from}`) : x.arg ? L(`要一个参数：${x.arg}`, `Takes an argument: ${x.arg}`) : "",
      act: x.broken ? "toast" : x.slash === "init" ? "toast-done" : "use-cmd", arg: x.broken ? L("打开 .molis/commands/发版检查.md（模拟）", "Opening the file (sample)") : x.slash === "init" ? L("切到「/init 起草说明文件」状态看结果", "Switch to the “/init” state to see the result") : x.slash, disabled: false,
      badge: x.broken ? K.renderBadge({ label: L("读不了", "Unreadable"), tone: "warning" }) : "",
    });
    const groups = sch() === "A" || palette
      ? group(L("内置", "Built-in"), l.builtin.map((x) => row(x)).join("")) + (l.project.length ? group(L("这个项目的 · .molis/commands", "This project · .molis/commands"), l.project.map((x) => row(x)).join("")) : group(L("这个项目的", "This project"), `<div class="foot">${L("还没有。在 .molis/commands/ 里放一个 .md，写好要 Coding 做的事，$ARGUMENTS 是你输入的参数。", "None yet. Put a .md in .molis/commands/ with what Coding should do; $ARGUMENTS is what you type after it.")}</div>`)) + group(L("我的 · 所有项目", "Mine · every project"), l.mine.map((x) => row(x)).join(""))
      : group("", [...l.project, ...l.mine].map((x) => row(x)).join(""));
    const foot = `<div class="foot">${L("命令只是一段提示文字，不带任何权限。同名时项目的优先。", "A command is only prompt text and carries no permission. On a name clash the project's wins.")}</div>`;
    openPop(anchor, (palette ? `<div class="palette-search"><input class="mw-input" type="search" placeholder="${esc(L("找命令", "Find a command"))}"></div>` : "") + groups + foot, "wide cmdmenu");
  }

  // The review card: the board's diff view, with the after-write checks placed by the scheme.
  function reviewCard(c, o) {
    const { L, S, ic, btn, badge, esc, K, P, sch } = c;
    const scheme = o.scheme || sch(), s = o.state;
    const side = (v) => ({ workspace_id: "w", workspace_name: "website", path: o.path, source_plugin_id: "coding", content_version: v });
    const showRaw = S.v.raw && s !== "format-failed";
    const view = K.compareChange("review", { before: side(3), after: side(4) }, { before: o.before, after: showRaw ? AS_WRITTEN : o.after, created: !!o.created });
    const T = Object.fromEntries(Object.entries(DIFF_WORDS).map(([k, v]) => [k, P(v)]));
    let diff = K.renderDiff({ view, primitives: { escape: K.escapeHtml, text: (k, vals = {}) => (T[k] || k).replace(/\{(\w+)\}/g, (_, n) => vals[n] ?? ""), icon: K.icon }, labels: Object.fromEntries(Object.keys(DIFF_WORDS).map((k) => [k, k])), sides: false, fold_context: 3 });
    const E = [{ line: 7, code: "TS2322", text: L("source 只能是 \"hero\" | \"footer\"，这里写成了 \"Hero\"", "source must be \"hero\" | \"footer\", got \"Hero\"") }, { line: 1, code: "TS2307", text: L("找不到 ./SubscribeForm 的导出 SubscribeForm", "Cannot find export SubscribeForm in ./SubscribeForm") }];
    const facts = {
      clean: [["done", L("没有新错误", "No new errors"), "tsc · Hero.tsx"], ["done", L("已格式化 · 3 处", "Formatted · 3 spots"), "prettier 3.3 · .prettierrc"]],
      errors: [["failed", L("2 个新错误", "2 new errors"), "tsc · Hero.tsx"], ["done", L("已格式化 · 3 处", "Formatted · 3 spots"), "prettier 3.3"]],
      fixed: [["done", L("没有新错误（修了 2 个）", "No new errors (2 fixed)"), "tsc · Hero.tsx"], ["done", L("已格式化 · 3 处", "Formatted · 3 spots"), "prettier 3.3"]],
      unavailable: [["idle", L("这次没查错误", "Errors not checked this time"), L("TypeScript 工具没准备好", "TypeScript tool not ready")], ["done", L("已格式化 · 3 处", "Formatted · 3 spots"), "prettier 3.3"]],
      "format-failed": [["done", L("没有新错误", "No new errors"), "tsc · Hero.tsx"], ["failed", L("格式化没成，按写的原样给你看", "Formatting failed; shown as written"), L(".prettierrc 第 3 行写错了", ".prettierrc line 3 is malformed")]],
    }[s];
    const writeBtn = o.created ? btn(L("写进仓库", "Write to the repo"), { v: "primary", act: "write", loading: S.busy === "write" }) : btn(s === "errors" ? L("先让 Coding 修", "Let Coding fix first") : L("写入", "Write"), { v: "primary", act: s === "errors" ? "toast-done" : "write", arg: L("交给 Coding 修（模拟）", "Handed to Coding (sample)"), loading: S.busy === "write" });
    const rawToggle = s && s !== "format-failed" && s !== "unavailable" ? btn(showRaw ? L("看格式化后的", "Show formatted") : L("看格式化前", "Show as written"), { v: "ghost", act: "see-unformatted" }) : "";
    const factLine = facts ? facts.map(([state, text, src]) => `<span class="fact">${K.renderStatusMark({ label: text, state, tone: state === "failed" ? "blocked" : state === "idle" ? "quiet" : "done" })}<small>${esc(src)}</small></span>`).join("") : "";
    let top = "", bottom = "";
    if (facts && scheme === "A") top = `<div class="rv__checks"${c.fresh(L("审查卡顶部的检查行：状态签是组件板的；这一行的组合是新的", "Check line at the top of the review card: board status marks; the line itself is new"))}>${factLine}</div>`;
    if (facts && scheme === "C") bottom = `<div class="rv__section"${c.fresh(L("审查卡底部的检查分区：新增", "Checks section at the bottom of the review card: new"))}><h3>${L("检查", "Checks")}</h3>${facts.map(([state, text, src]) => `<div class="chk">${c.ring(state, 14)}<span class="grow">${text}</span><small class="cap">${esc(src)}</small></div>`).join("")}${s === "errors" ? E.map((e) => `<div class="chk is-err">${ic("circle-alert", "xs")}<span class="grow"><b class="mono">${e.code}</b> ${L("第", "line")} ${e.line} ${L("行", "")} · ${esc(e.text)}</span></div>`).join("") : ""}</div>`;
    if (s === "errors" && scheme === "A") top += `<div class="rv__errs">${E.map((e) => `<div class="chk is-err">${ic("circle-alert", "xs")}<span class="grow"><b class="mono">${e.code}</b> ${L("第", "line")} ${e.line} ${L("行", "")} · ${esc(e.text)}</span></div>`).join("")}</div>`;
    if (s === "errors" && scheme === "B") {
      // Each error sits under the line it is about, inside the board's diff rows.
      for (const e of E) diff = diff.replace(new RegExp(`(<li data-kind="insert")(><span class="mw-diff-before"></span><span class="mw-diff-after">${e.line}</span>[\\s\\S]*?</li>)`), `$1 class="has-err"$2<li class="errnote"${c.fresh(L("差异里的错误行与说明：新增；差异视图本身有逐行评论的位置（line_feedback）", "Error rows in the diff: new; the diff view already has a per-line slot (line_feedback)"))}>${ic("circle-alert", "xs")}<b class="mono">${e.code}</b> ${esc(e.text)}</li>`);
    }
    if (facts && scheme === "B") top = `<div class="rv__checks is-quiet">${factLine}</div>`;
    const landed = S.v.written ? " data-craft-new" : "";
    return `<div class="rv"${landed}><div class="rv__head">${K.renderFileKind ? K.renderFileKind(o.path) : ""}<b class="ell">${esc(o.path)}</b>${o.created ? badge(L("新文件", "New file"), "info") : badge(L("改动", "Changed"), "neutral")}<span class="grow"></span>${S.v.written ? K.renderStatusMark({ label: L("已写入", "Written"), state: "done", tone: "done" }) : `${rawToggle}${writeBtn}`}</div>${top}${diff}${bottom}${S.v.written ? "" : `<div class="rv__foot">${L(s ? "你批的就是这一版：格式化在审查之前做完，写进去的和看到的一样。" : "写进仓库前要你看过。", s ? "What you approve is this exact version: formatting runs before review, so what's written is what you saw." : "You see it before it goes into the repo.")}</div>`}</div>`;
  }
})();
