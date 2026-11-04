// 33 · Coding 任务与环境恢复 — design sample on the shared Coding frame (../coding-frame/coding-proto.js) and the component board's parts.
// All data is sample data; nothing reads a folder, runs a command or calls a model.
(() => {
  const Z = (zh, en) => [zh, en];
  const data = {
    blocks: [
      { id: "env", name: Z("环境与临时副本", "Environment and working copy") },
      { id: "budget", name: Z("预算与重试", "Budget and retries") },
      { id: "resume", name: Z("重启后接着做", "Picking up after a restart") },
      { id: "report", name: Z("本轮结果", "How a round ends") },
    ],
    decided: { env: "A", budget: "A", resume: "A", report: "A" },
    schemes: {
      env: { A: Z("A 本轮开头一张准备清单", "A A prep checklist at the round's start"), B: Z("B 过程里一行，展开看", "B One process line that opens"), C: Z("C 文件栏底部的环境面板", "C An environment panel under the files") },
      budget: { A: Z("A 任务卡上写第几次和额度", "A Attempt and budget on the task card"), B: Z("B 时间线里每次尝试一组", "B One group per attempt in the timeline"), C: Z("C 本轮抬头汇总，点开看", "C A summary in the round line") },
      resume: { A: Z("A 对话里一张接续卡", "A A resume card in the conversation"), B: Z("B 顶部横幅 + 计划上标停在哪", "B A banner + the stop marked on the plan"), C: Z("C 输入框上方一行接续条", "C A resume line above the composer") },
      report: { A: Z("A 结尾报告卡：交付、验证、没做完、接着做", "A A closing report: delivered, verified, open, next"), B: Z("B 五级状态阶梯", "B A five-rung status ladder"), C: Z("C 报告放进任务板顶部", "C The report at the top of the TaskBoard") },
    },
    states: {
      env: [["ready", "全部就绪（有 1 个改之前就有的失败）", "All ready (one failure that was there before)"], ["installing", "正在装依赖", "Installing dependencies"], ["blocked", "依赖装不上：项目关了联网", "Dependencies blocked: project is offline"], ["port", "端口被你自己的服务占着", "Port held by your own server"], ["config", "缺配置：要一个密钥", "Missing config: a secret is needed"], ["copy-start", "临时副本里启动失败", "The working copy fails to start"], ["cleanup", "本轮结束后的清理", "Clean-up after the round"]],
      budget: [["first", "第 1 次，正常进行", "First attempt, going normally"], ["retry-check", "第 2 次：上次测试没过", "Attempt 2: the tests failed last time"], ["retry-model", "模型服务出错，自动重试", "The model service failed; retrying"], ["last", "最后一次，额度快用完", "Last attempt, budget nearly spent"], ["spent", "用完了，停下说明", "Spent: stopped with a report"], ["asked", "你要求重做", "You asked for a redo"]],
      resume: [["mid-command", "重启时命令在跑（结果未知）", "A command was running (result unknown)"], ["between", "停在两步之间", "Stopped between steps"], ["copy", "临时副本还在、服务没了", "Copy still there, server gone"], ["push", "重启时在推送（远端未知）", "Was pushing (remote unknown)"], ["model", "模型出错停下", "Stopped on a model error"]],
      report: [["done", "做完了，等你接受", "Done, waiting for you"], ["partial", "部分完成", "Partly done"], ["blocked", "卡住了，要你给东西", "Blocked on you"], ["stale", "测试绿灯是改之前的", "The green tests are from before the change"], ["unverified", "写了但没法启动看", "Written but couldn't start it"]],
    },
  };

  window.codingProto({
    key: "molis-proto.coding-env-recovery.v1",
    data,
    defaults: () => {},
    blocks: {
      // ---------------------------------------------------------------- 环境与临时副本 (R6, CHO-13)
      env(c) {
        const { L, sch, st, ic, btn, ring, tag, badge, OUT, rise, you, round, ai, recover, hint, fold, foldStep, frame, dirCol, composer, S } = c;
        const scheme = sch(), raw = st();
        // Once a problem is resolved, the checklist reads as ready (the resolution itself lands in the recovery block).
        const fixed = (raw === "blocked" && S.v.net) || (raw === "config" && S.v.secret) || (raw === "copy-start" && S.v.start);
        const s = fixed && raw !== "copy-start" ? "ready" : raw;
        const inCopy = raw === "copy-start" || raw === "cleanup";
        // The checklist: [ring outcome, what, value, word, tone override]
        const rows = [
          ["ok", L("仓库与分支", "Repo and branch"), inCopy ? L("临时副本 subscribe-form · 从 main@a1b2c3", "Working copy subscribe-form · from main@a1b2c3") : "website · main"],
          ["ok", L("你的改动", "Your changes"), inCopy ? L("主目录 2 处没提交的改动不带进副本，原样保留", "2 uncommitted changes stay in the main folder, untouched") : L("2 处没提交，保留，不覆盖", "2 uncommitted, kept, never overwritten")],
          ["ok", L("规则", "Rules"), L("AGENTS.md 2 份", "2 AGENTS.md files")],
          s === "installing" ? ["run", L("依赖", "Dependencies"), L("按 pnpm-lock 下载 312 个公开包 · 来自 registry.npmjs.org", "Downloading 312 public packages from pnpm-lock · registry.npmjs.org")]
            : s === "blocked" ? ["err", L("依赖", "Dependencies"), L("装不上：本项目不允许联网", "Blocked: this project is offline")]
            : ["ok", L("依赖", "Dependencies"), inCopy ? L("复用主目录的包缓存，8 秒", "Reused the main folder's package cache, 8 s") : L("已装，和 lockfile 一致", "Installed, matches the lockfile")],
          [s === "installing" || s === "blocked" ? "wait" : "ok", L("测试命令", "Test command"), "pnpm test"],
          s === "port" ? ["warn", L("启动", "Start"), L("5173 被你开着的 dev 服务占着，本轮用 5174", "5173 is your own dev server; this round uses 5174")]
            : s === "config" ? ["hold", L("启动", "Start"), L("缺 .env.local 里的 STRIPE_KEY", "STRIPE_KEY in .env.local is missing")]
            : s === "copy-start" ? (fixed ? ["ok", L("启动", "Start"), L("pnpm dev · 端口 5174（先构建了 packages/ui）", "pnpm dev · port 5174 (built packages/ui first)")] : ["err", L("启动", "Start"), L("副本里 pnpm dev 起不来", "pnpm dev fails in the copy")])
            : s === "cleanup" ? ["cx", L("启动", "Start"), L("本次起的 5174 已关", "This round's 5174 was stopped")]
            : [s === "installing" || s === "blocked" ? "wait" : "ok", L("启动", "Start"), L("pnpm dev · 端口 5173", "pnpm dev · port 5173")],
          s === "installing" || s === "blocked" ? ["wait", L("已有失败", "Existing failures"), L("装好依赖后再查", "Checked after install")] : ["unk", L("已有失败", "Existing failures"), L("1 个：Nav.test.tsx 在改之前就红，记为基线，不算这次", "1: Nav.test.tsx was red before any change — the baseline, not this round")],
        ];
        const word = (k) => ({ ok: L("好了", "Ready"), run: L("进行中", "In progress"), err: L("没成", "Failed"), wait: L("等待前一步", "Waiting for the previous step"), warn: L("换了端口", "Moved"), hold: L("要你给", "Needs you"), unk: L("基线", "Baseline"), cx: L("已关", "Stopped") })[k];
        const rowHtml = ([k, what, value]) => { const [r, tone] = OUT[k]; return `<div class="row${k === "wait" ? " is-quiet" : ""}">${ring(r)}<span class="nm kv"><b>${what}</b><span class="ell">${value}</span></span>${k === "unk" ? badge(word(k), "neutral") : tag(word(k), r, tone)}</div>`; };
        const ready = rows.filter((r) => r[0] === "ok").length;
        // The recovery for each problem state (04 frame, recovery A)
        const recs = {
          blocked: { tone: "err", title: L("依赖装不上：本项目不允许联网", "Dependencies blocked: this project is offline"), body: L("pnpm install 要从 registry.npmjs.org 下载 312 个公开包，项目的联网限制挡住了。可以只为这次任务放行下载依赖；不会因此允许上传、登录或推送。", "pnpm install needs 312 public packages from registry.npmjs.org and the project's network limit stops it. You can allow dependency downloads for this task only; that never allows uploads, sign-ins or pushes."), kept: [L("读过的 14 个文件", "14 files read"), L("规则 2 份", "2 rules files")], acts: [["primary", "allow-net", L("这次允许下载依赖", "Allow downloads for this task")], ["secondary", "toast", L("只读代码、不跑测试", "Read code only, no tests"), L("改成只读代码；不跑测试和启动（模拟）", "Reading code only; no tests or start (sample)")]], tech: "ERR_PNPM_FETCH_BLOCKED  GET https://registry.npmjs.org/react — blocked by project network setting (offline)" },
          port: { tone: "info", title: L("5173 端口被你自己的 dev 服务占着", "Port 5173 is held by your own dev server"), body: L("那是你开着的服务（进程 4182），Coding 不关它；本轮改用 5174 启动，结束后只关自己起的。", "That is your server (process 4182); Coding leaves it alone, starts on 5174 and stops only what it started."), acts: [], tech: "lsof :5173 → node 4182 (started 09:12, not by Coding)" },
          config: { tone: "wait", title: L("启动要一个密钥：STRIPE_KEY", "Starting needs a secret: STRIPE_KEY"), body: L(".env.local 不在仓库里，副本和 Coding 都拿不到。选一个已存的密钥，Coding 只拿到引用，密钥不会写进文件、提示或报告。", ".env.local isn't in the repo, so Coding can't see it. Pick a stored secret: Coding gets a reference only — the value never lands in files, prompts or reports."), kept: [L("测试照常跑", "Tests still run")], acts: [["primary", "pick-secret", L("选一个密钥", "Pick a secret"), "", true], ["secondary", "toast", L("跳过启动验证", "Skip the start check"), L("跳过启动；报告里会写「没有实际打开」（模拟）", "Skipping start; the report will say it wasn't opened (sample)")]], tech: "pnpm dev → Error: STRIPE_KEY is not set (src/server/pay.ts:4)" },
          "copy-start": { tone: "err", title: L("临时副本里 pnpm dev 起不来", "pnpm dev fails in the working copy"), body: L("副本里缺本地包 @website/ui 的构建结果（主目录里有，副本是新的）。先构建 packages/ui 再启动就行。", "The copy lacks the build of the local package @website/ui (the main folder has one; the copy is new). Building packages/ui first fixes it."), kept: [L("副本和已写的 2 个文件", "The copy and 2 written files"), L("测试 12 个通过", "12 tests passed")], acts: [["primary", "fix-start", L("先构建再启动", "Build, then start")], ["secondary", "toast", L("看启动日志", "See the start log"), L("打开启动日志（模拟）", "Opening the start log (sample)")]], tech: "pnpm dev (cwd .worktrees/subscribe-form) → Error: Cannot find module '@website/ui/dist/index.js'" },
          cleanup: { tone: "ok", title: L("本轮结束，收拾好了", "Round ended, cleaned up"), body: L("关掉了本次起的 dev 服务（5174）和 2 个临时进程；你自己的 5173 没动。临时副本留着，里面 3 处改动等你看。", "Stopped this round's dev server (5174) and 2 temporary processes; your own 5173 is untouched. The working copy stays, with 3 changes for you to review."), acts: [["primary", "toast-done", L("看改动", "Review changes"), L("打开改动（模拟）", "Opening changes (sample)")], ["secondary", "toast", L("删掉副本", "Delete the copy"), L("会先确认再删（模拟）", "Asks before deleting (sample)")]], tech: "stopped: pid 5521 (pnpm dev :5174), 5530, 5531 · kept: .worktrees/subscribe-form" },
        };
        if (S.v.net && s === "blocked") recs.blocked = { tone: "ok", landed: true, title: L("只为这次任务放行了下载依赖", "Dependency downloads allowed for this task only"), body: L("依赖装好了，继续准备。项目的联网设置没改。", "Dependencies installed; prep continues. The project's network setting is unchanged."), acts: [] };
        if (S.v.secret && s === "config") recs.config = { tone: "ok", landed: true, title: L("用了已存的密钥「Stripe 测试」", "Using the stored secret “Stripe test”"), body: L("Coding 只拿到引用；启动成功，首页能打开。", "Coding holds a reference only; the app started and the home page opens."), acts: [] };
        if (S.v.start && s === "copy-start") recs["copy-start"] = { tone: "ok", landed: true, title: L("构建 packages/ui 后启动成功", "Started after building packages/ui"), body: L("副本里的首页在 5174 打开了。", "The copy's home page opens on 5174."), acts: [] };
        const rec = recs[raw] ? recover(recs[raw]) : "";
        const problem = ["blocked", "config", "copy-start"].includes(s) && !(S.v.net || S.v.secret || S.v.start);
        const summary = s === "installing" ? L("正在准备环境 · 装依赖", "Preparing · installing dependencies") : problem ? L(`准备环境 · ${ready}/${rows.length} 好了 · 1 处要处理`, `Preparing · ${ready}/${rows.length} ready · 1 needs attention`) : s === "cleanup" ? L("本轮结束 · 已收拾", "Round ended · cleaned up") : L(`环境好了 · ${rows.length - 1}/${rows.length} · 1 个已有失败`, `Environment ready · ${rows.length - 1}/${rows.length} · 1 existing failure`);
        let work = you(L("首页加一个订阅表单，跑测试，再打开首页看看。", "Add a subscribe form to the home page, run the tests, then open it.")) + round(L("执行", "Execute"), inCopy ? L(" · 在临时副本里", " · in a working copy") : L(" · 在 website", " · in website"));
        let above = "", foot = "";
        if (scheme === "A") {
          work += rise(`<div class="list"${c.fresh(L("准备清单：列表行用组件板的行与状态签；清单这种组合是新的", "Prep checklist: rows and status marks are the board's; the checklist as a whole is new"))}><div class="list__head"><span class="grow">${ic("settings", "sm")}${L("准备环境", "Preparing the environment")}</span><span class="cap">${summary}</span></div>${rows.map(rowHtml).join("")}</div>`);
          if (rec) work += rise(rec);
        } else if (scheme === "B") {
          const state = problem ? "failed" : undefined;
          const steps = rows.map(([k, what, value]) => foldStep(`${ring(OUT[k][0], 12)} ${what} · ${value}`)).join("");
          work += rise(`<div class="proc">${fold(`${s === "installing" ? ring("running", 12) + " " : ""}${summary}`, steps, { open: problem || s === "installing", state })}</div>`);
          if (rec) work += rise(rec);
        } else {
          const tone = problem ? "is-err" : s === "port" || s === "config" ? "is-wait" : "";
          foot = `<div class="envp ${tone}"${c.fresh(L("环境面板：文件栏底部的新区域，行是组件板的目录行", "Environment panel: a new area under the files; rows are the board's directory rows"))}><div class="envp__head">${ic("settings", "xs")}<span class="grow">${L("环境", "Environment")}</span>${problem ? badge(L("1 处要处理", "1 to fix"), "warning") : s === "installing" ? ring("running", 12) : badge(L("好了", "Ready"), "success")}</div>${rows.map(([k, what, value]) => `<div class="envp__row" title="${value}">${ring(OUT[k][0], 12)}<span class="ell"><b>${what}</b> ${value}</span></div>`).join("")}</div>`;
          if (rec && (problem || s === "port" || s === "cleanup" || S.v.net || S.v.secret || S.v.start)) {
            const r = recs[raw];
            const first = r.acts && r.acts[0] ? btn(r.acts[0][2], { v: "primary", act: r.acts[0][1], arg: r.acts[0][3], loading: S.busy === r.acts[0][1], menu: r.acts[0][4] }) : "";
            above = hint(r.tone === "err" ? "err" : r.tone === "wait" ? "wait" : r.tone === "ok" ? "ok" : "info", ic(r.tone === "ok" ? "check" : r.tone === "info" ? "info" : "circle-alert", "sm"), r.title, first);
          }
          work += ai(`<p>${s === "installing" ? L("先把依赖装上，再写表单。", "Installing dependencies first, then the form.") : problem ? L("我先看了现有首页和测试；环境那一处处理好之前，不跑测试。", "I read the current home page and tests; no tests run until the environment issue is sorted.") : L("我先看了现有首页和测试，接下来写 SubscribeForm。", "I read the current home page and tests; writing SubscribeForm next.")}</p>`);
        }
        if (scheme !== "C" && !problem && s !== "cleanup" && s !== "installing") work += ai(`<p>${L("环境好了。Nav.test.tsx 本来就红，这次只看新增的失败。", "Ready. Nav.test.tsx was red before; this round only counts new failures.")}</p>`);
        return frame({ head: inCopy ? { branch: "subscribe-form", changes: L("副本 · 3 处改动", "copy · 3 changes") } : {}, dir: dirCol({ folder: inCopy ? "subscribe-form" : "website", note: inCopy ? `<div class="dir-note tone tone-info">${L("本轮在临时副本里做，完成后经你审查交回", "This round works in a temporary copy, returned after your review")}</div>` : "", foot }), work, composer: composer({ above }) });
      },

      // ---------------------------------------------------------------- 预算与重试 (R5, CHO-11; the retry's source)
      budget(c) {
        const { L, sch, st, ic, btn, ring, tag, badge, rise, you, round, ai, recover, hint, fold, foldStep, frame, dirCol, composer, S, esc } = c;
        const s = st(), scheme = sch();
        const N = { first: 1, "retry-check": 2, "retry-model": 2, last: 3, spent: 3, asked: 2 }[s];
        const max = S.v.more ? 6 : 3;
        const used = { first: 22, "retry-check": 62, "retry-model": 48, last: 86, spent: 100, asked: 40 }[s];
        const why = {
          first: null,
          "retry-check": L("上一次 pnpm test 有 2 个失败（客观验证没过）", "Last time pnpm test had 2 failures (the check didn't pass)"),
          "retry-model": L("模型服务超时，自动重试；已经跑过的命令不再跑", "The model service timed out; retrying without re-running finished commands"),
          last: L("第 2 次还剩 1 个失败：邮箱校验", "Attempt 2 left one failure: email validation"),
          spent: L("3 次都没让邮箱校验的测试通过", "Three attempts and the email test still fails"),
          asked: L("你说「按钮放到右边」", "You said “put the button on the right”"),
        }[s];
        const source = { "retry-check": L("验证没过", "Check failed"), "retry-model": L("模型出错", "Model error"), last: L("验证没过", "Check failed"), spent: L("验证没过", "Check failed"), asked: L("你要求", "You asked") }[s];
        const attempts = [];
        for (let i = 1; i <= N; i++) {
          const cur = i === N;
          const res = cur ? (s === "spent" ? ["failed", L("1 个失败", "1 failure")] : ["running", L("进行中", "In progress")])
            : s === "retry-model" ? ["interrupted", L("模型超时", "Model timed out")] : s === "asked" ? ["done", L("测试通过", "Tests passed")] : i === 1 ? ["failed", L("2 个失败", "2 failures")] : ["failed", L("1 个失败", "1 failure")];
          attempts.push({ i, cur, res });
        }
        const meter = `<div class="meter" role="img" aria-label="${esc(L(`这一项的额度用了 ${used}%`, `${used}% of this task's budget used`))}"${c.fresh(L("额度条：组件板只有页面级进度，没有任务额度条", "Budget meter: the board has page progress, not a task budget meter"))}><i style="width:${Math.min(used, 100)}%"${used >= 85 ? ' class="hot"' : ""}></i></div>`;
        const budgetLine = L(`第 ${N} 次 · 最多 ${max} 次 · 额度用了 ${used}%`, `Attempt ${N} of ${max} · ${used}% of budget`);
        const spentRec = S.v.more
          ? { tone: "ok", landed: true, title: L("又给了 3 次和同样的额度", "Granted 3 more attempts and the same budget"), body: L("从第 4 次接着修邮箱校验；前面的结果都留着。", "Attempt 4 picks up the email check; earlier results stay."), acts: [] }
          : { tone: "err", title: L("停下了：部分完成", "Stopped: partly done"), body: L("3 次都没让 SubscribeForm.test 的邮箱校验通过。表单、样式、其余 11 个测试都好了。卡在：正则不接受带「+」的邮箱，改了以后另一个用例又失败。", "Three attempts and the email check in SubscribeForm.test still fails. The form, styles and the other 11 tests are done. Stuck on: the pattern rejects addresses with “+”, and fixing it breaks another case."), kept: [L("3 个文件的改动", "Changes in 3 files"), L("11 个测试通过", "11 tests pass")], acts: [["primary", "more", L("再给 3 次", "Give it 3 more")], ["secondary", "toast", L("我来看", "I'll look"), L("打开失败的测试（模拟）", "Opening the failing test (sample)")]], tech: "SubscribeForm.test.tsx › accepts plus addressing — expected valid, got invalid (attempt 3/3, budget 100%)" };
        const modelRec = { tone: "info", title: L("模型服务超时，正在自动重试（第 1 次，最多 2 次）", "The model service timed out; retrying (1 of 2)"), body: L("已经跑过的 pnpm test 不会再跑；写好的 2 个文件留着。", "pnpm test, already run, won't run again; the 2 written files stay."), acts: [], tech: "MiniMax-M3 · 504 after 60 s · retry 1/2 in 4 s" };
        // The task board (scheme A carries the attempt on the card).
        const T = [[L("读现有首页与测试", "Read the home page and tests"), "done"], [L("写 SubscribeForm", "Write SubscribeForm"), "done"], [L("让订阅表单的测试通过", "Make the form's tests pass"), "cur"], [L("打开首页看一眼", "Open the home page"), "wait"]];
        const card = ([name, k], i) => {
          const cur = k === "cur";
          const r = cur ? (s === "spent" && !S.v.more ? ["failed", "blocked", L("停下了", "Stopped")] : s === "retry-model" ? ["interrupted", "attention", L("重试中", "Retrying")] : ["running", "progress", L("进行中", "In progress")]) : k === "done" ? ["done", "done", L("完成", "Done")] : ["waiting", "idle", L("等待前一步", "Waiting for the previous step")];
          let extra = "";
          if (cur && scheme === "A") {
            extra = `<div class="attempt"${c.fresh(L("任务卡上的尝试与额度：新增", "Attempt and budget on the task card: new"))}><div class="attempt__line">${ic("refresh", "xs")}<span class="grow">${budgetLine}</span>${source ? badge(source, s === "asked" ? "info" : s === "retry-model" ? "neutral" : "warning") : ""}</div>${meter}${why ? `<div class="attempt__why">${esc(why)}</div>` : ""}${N > 1 ? `<details class="tech"><summary>${ic("chevron-right", "xs")}${L(`前 ${N - 1} 次`, `Earlier ${N - 1}`)}</summary>${attempts.filter((a) => !a.cur).map((a) => `<div class="attempt__past">${ring(a.res[0], 12)}${L(`第 ${a.i} 次`, `Attempt ${a.i}`)} · ${a.res[1]}</div>`).join("")}</details>` : ""}${s === "spent" && !S.v.more ? `<div class="acts">${btn(L("再给 3 次", "Give it 3 more"), { v: "primary", act: "more" })}</div>` : ""}</div>`;
          }
          return `<div class="bcard${cur ? (s === "spent" && !S.v.more ? " is-err" : " is-cur") : ""}"><div class="row${k === "wait" ? " is-quiet" : ""}"><span class="num${cur ? " is-cur" : ""}">${i + 1}</span><span class="nm">${name}</span>${K_mark(r)}</div>${extra}</div>`;
        };
        const K_mark = ([state, tone, label]) => c.K.renderStatusMark({ label, state, tone, plain: tone === "idle" || tone === "done" });
        const board = `<aside class="c-board" aria-label="${L("任务板", "TaskBoard")}"><div class="c-board__head">${ic("list-ordered", "sm")}${L("任务板", "TaskBoard")}<span class="cap">· ${L("4 步", "4 steps")}</span><span class="grow"></span>${btn(L("关闭", "Close"), { icon: "x", iconOnly: true, v: "ghost", act: "toggle-board", cls: "only-board-narrow" })}</div><div class="c-board__list">${T.map(card).join("")}</div></aside>`;
        let work = you(s === "asked" ? L("按钮放到右边。", "Put the button on the right.") : L("首页加一个订阅表单，测试要全过。", "Add a subscribe form; all tests must pass.")) + round(L("执行", "Execute"), scheme === "C" ? ` · <span class="sumchip"${c.fresh(L("抬头里的尝试汇总签：新增", "Attempt summary chip in the round line: new"))}><button type="button" class="mw-badge" data-act="budget-pop">${ic("refresh", "xs")}${budgetLine}</button></span>` : "");
        if (scheme === "B") {
          work += attempts.map((a) => rise(`<div class="proc">${fold(`${ring(a.res[0], 12)} ${L(`第 ${a.i} 次`, `Attempt ${a.i}`)} · ${a.res[1]}${a.cur && source ? ` · ${L("因为", "because")}${source}` : ""}`, foldStep(a.cur ? esc(why || L("按计划写表单与测试", "Writing the form and tests per plan")) : L("改了 SubscribeForm.tsx、表单样式；跑了 pnpm test", "Changed SubscribeForm.tsx and styles; ran pnpm test")) + (a.cur ? `<div class="pf-line">${meter}<span class="cap">${budgetLine}</span></div>` : ""), { open: a.cur, state: a.res[0] === "failed" ? "failed" : undefined })}</div>`)).join("");
        } else {
          work += ai(`<p>${s === "first" ? L("先写表单，再跑测试。", "Writing the form, then the tests.") : esc(why)}</p>`);
        }
        if (s === "retry-model") work += rise(recover(modelRec));
        if (s === "spent") work += rise(recover(spentRec));
        else if (s === "last" && scheme !== "A") work += rise(hint("wait", ic("circle-alert", "sm"), L("这是最后一次；再不过就停下，说清楚卡在哪。", "This is the last attempt; if it fails, Coding stops and says where it's stuck.")));
        let above = "";
        if (s === "last" && scheme === "A") above = hint("wait", ic("circle-alert", "sm"), L("第 3 次是最后一次：额度剩 14%，再不过就停下说明。", "Attempt 3 is the last: 14% budget left; if it fails, Coding stops and explains."));
        return frame({ head: {}, dir: dirCol({}), work, board, composer: composer({ above }) });
      },

      // ---------------------------------------------------------------- 重启后接着做 (R5 restart, CHO-12)
      resume(c) {
        const { L, sch, st, ic, btn, ring, tag, badge, rise, you, round, ai, recover, hint, frame, dirCol, composer, S, esc, OUT } = c;
        const s = st(), scheme = sch(), v = !!S.v.checked;
        const stopAt = { "mid-command": 3, between: 4, copy: 3, push: 5, model: 3 }[s];
        const steps = [L("读现有首页与测试", "Read the home page and tests"), L("写 SubscribeForm", "Write SubscribeForm"), L("跑测试并修好", "Run and fix the tests"), L("打开首页看一眼", "Open the home page"), L("推送到分支 subscribe-form", "Push to branch subscribe-form")];
        const what = {
          "mid-command": { tone: "wait", title: L("Molis Work 重启了：那时 pnpm test 在跑", "Molis Work restarted while pnpm test was running"), body: L("不知道测试跑完没有。先核对测试报告和进程，不会自动重跑。", "It may not have finished. Check the test report and processes first; nothing re-runs by itself."), act: ["primary", "check", L("先核对", "Check first")], after: { title: L("核对过：测试在重启前跑完了，2 个失败", "Checked: the tests finished before the restart, 2 failures"), body: L("接着修这 2 个。", "Fixing those 2 next."), act: ["primary", "continue", L("接着做", "Continue")] }, tech: "round 7f3a · last event 10:43:58 pnpm test (running) · host restarted 10:51 · report written 10:44:20" },
          between: { tone: "info", title: L("Molis Work 重启了：停在第 3 步和第 4 步之间", "Molis Work restarted between steps 3 and 4"), body: L("前 3 步都做完并核对过；第 4 步还没开始，可以直接接着做。", "Steps 1–3 are done and checked; step 4 hadn't started, so it can simply continue."), act: ["primary", "continue", L("接着做第 4 步", "Continue with step 4")], tech: "round 7f3a · step 3 done 10:47 · step 4 not started · host restarted 10:51" },
          copy: { tone: "wait", title: L("临时副本还在，本轮起的 dev 服务没了", "The working copy is still there; this round's dev server is gone"), body: L("副本里 3 处改动都在。接着做之前要先重新启动它（只启动本轮自己的，不碰你的服务）。", "All 3 changes are in the copy. Continuing restarts this round's own server first, never yours."), act: ["primary", "continue", L("重新启动并接着做", "Restart it and continue")], tech: ".worktrees/subscribe-form intact · pid 5521 (pnpm dev :5174) not found after restart" },
          push: { tone: "wait", title: L("重启时正在推送到 subscribe-form", "It was pushing to subscribe-form when Molis Work restarted"), body: L("不知道远端收到没有。先看远端分支是不是已经是这次的提交，不会重推。", "The remote may or may not have it. Check whether the remote branch already has this commit; it won't push again."), act: ["primary", "check", L("先核对远端", "Check the remote first")], after: { title: L("核对过：远端已经是 4f2c1e0，推送其实成功了", "Checked: the remote is already at 4f2c1e0 — the push went through"), body: L("这一步算完成，不用再推。", "This step counts as done; no second push."), act: ["primary", "toast-done", L("看本轮结果", "See the round's result"), L("打开本轮结果（模拟）", "Opening the result (sample)")] }, tech: "git push origin subscribe-form · started 10:50:41 · no exit received · host restarted 10:51" },
          model: { tone: "err", title: L("模型服务连续出错，这一轮停在第 3 步", "The model service kept failing; the round stopped at step 3"), body: L("自动重试了 2 次都超时。已写的改动和测试结果都留着；可以稍后重试这一步，或换一个模型接着做。", "Two automatic retries timed out. Written changes and test results stay; retry this step later or continue with another model."), act: ["primary", "continue", L("重试这一步", "Retry this step")], act2: ["secondary", "toast", L("换个模型接着做", "Continue with another model"), L("打开模型选择（模拟）", "Opening the model picker (sample)")], tech: "MiniMax-M3 · 504 ×3 (10:48:02, 10:48:40, 10:49:31) · round 7f3a paused at step 3" },
        }[s];
        const done = v && what.after ? what.after : null;
        const rec = done ? { tone: "ok", landed: true, title: done.title, body: done.body, acts: [done.act], tech: what.tech }
          : { tone: what.tone, title: what.title, body: what.body, kept: [L("2 个文件的改动", "Changes in 2 files"), L("计划和前面的结果", "The plan and earlier results"), ...(s === "copy" ? [L("临时副本", "The working copy")] : [])], acts: [what.act, ...(what.act2 ? [what.act2] : [])], tech: what.tech, carry: false };
        const kOf = (i) => (i + 1 < stopAt ? "ok" : i + 1 === stopAt ? (done ? (s === "push" ? "ok" : "err") : s === "between" ? "wait" : s === "model" ? "err" : "unk") : "wait");
        const plan = `<div class="list plan"><div class="list__head"><span class="grow">${ic("list-ordered", "sm")}${L("计划", "Plan")}</span><span class="cap">${L(`停在第 ${stopAt} 步`, `Stopped at step ${stopAt}`)}</span></div>${steps.map((name, i) => {
          const k = kOf(i), [r, tone] = OUT[k];
          const here = i + 1 === stopAt && scheme === "B" ? `<span class="stop-at"${c.fresh(L("「停在这里」标记：新增", "“Stopped here” marker: new"))}>${ic("pause", "xs")}${L("停在这里", "Stopped here")}</span>` : "";
          const word = k === "ok" ? L("完成", "Done") : k === "wait" ? (i + 1 === stopAt ? L("还没开始", "Not started") : L("等待前一步", "Waiting for the previous step")) : k === "unk" ? L("结果未知，待核对", "Result unknown — check it") : L("没做完", "Not finished");
          return `<div class="row${k === "wait" ? " is-quiet" : ""}"><span class="num${i + 1 === stopAt ? " is-cur" : ""}">${i + 1}</span><span class="nm">${steps[i]}</span>${here}${c.K.renderStatusMark({ label: word, state: r, tone, plain: k === "ok" || k === "wait" })}</div>`;
        }).join("")}</div>`;
        let work = you(L("首页加一个订阅表单，测试全过后推到 subscribe-form 分支。", "Add a subscribe form; once the tests pass, push to branch subscribe-form.")) + round(L("执行", "Execute"), L(" · 10:51 重启后", " · after the 10:51 restart"));
        let top = "", above = "";
        work += rise(plan);
        if (scheme === "A") work += rise(recover(rec));
        if (scheme === "B") {
          top = `<div class="banner tone-${done ? "ok" : what.tone === "err" ? "err" : what.tone === "info" ? "info" : "wait"}">${ic(done ? "check" : "history", "sm")}<span class="grow">${esc(done ? done.title : what.title)}</span><span class="acts">${btn((done ? done.act : what.act)[2], { v: "primary", act: (done ? done.act : what.act)[1], arg: (done ? done.act : what.act)[3], loading: S.busy === (done ? done.act : what.act)[1] })}</span></div>`;
          work += ai(`<p>${esc(done ? done.body : what.body)}</p>`);
        }
        if (scheme === "C") {
          const a = done ? done.act : what.act;
          above = hint(done ? "ok" : what.tone === "err" ? "err" : what.tone === "info" ? "info" : "wait", ic(done ? "check" : "history", "sm"), esc(done ? done.title : what.title), btn(a[2], { v: "primary", act: a[1], arg: a[3], loading: S.busy === a[1] }) + btn(L("怎么回事", "What happened"), { act: "resume-pop", menu: true }));
        }
        c.S._resumeRec = rec;
        return frame({ top, head: s === "copy" ? { branch: "subscribe-form", changes: L("副本 · 3 处改动", "copy · 3 changes") } : {}, dir: dirCol({ folder: s === "copy" ? "subscribe-form" : "website" }), work, composer: composer({ above }) });
      },

      // ---------------------------------------------------------------- 本轮结果 (R5: round ended ≠ written ≠ tests pass ≠ task done ≠ accepted)
      report(c) {
        const { L, sch, st, ic, btn, ring, tag, badge, rise, you, round, ai, recover, hint, frame, dirCol, composer, S, esc } = c;
        const s = st(), scheme = sch(), accepted = !!S.v.accepted, ran = !!S.v.ran;
        const stale = s === "stale" && !ran;
        // The five facts, each said apart (R5): [label, on?, note]
        const rungs = [
          [L("本轮结束", "Round ended"), true, "10:58"],
          [L("代码已写入", "Code written"), true, L("3 个文件", "3 files")],
          [L("测试通过", "Tests pass"), s === "done" || s === "unverified" || (s === "stale" && ran), stale ? L("绿灯是改之前的", "green is from before") : s === "partial" ? L("1 个失败", "1 failing") : s === "blocked" ? L("没跑", "not run") : L("在 4f2c1e0 上", "on 4f2c1e0")],
          [L("任务完成", "Task done"), s === "done" || (s === "stale" && ran), s === "unverified" ? L("没打开看过", "not opened") : s === "partial" ? "3/4" : s === "blocked" ? L("卡住", "blocked") : stale ? L("待重跑", "re-run first") : L("4/4 条标准", "4/4 criteria")],
          [L("你已接受", "You accepted"), accepted, accepted ? L("刚才", "just now") : L("等你", "waiting")],
        ];
        const ver = (t, when) => `<span class="ver"${c.fresh(L("验证结果后标代码版本：新增，防止旧绿灯冒充当前", "A code version on each check: new, so an old green can't pass for the current one"))}>${ic("hash", "xs")}${t}${when ? ` · ${when}` : ""}</span>`;
        const checks = {
          done: [["done", L("pnpm test · 13 个通过（Nav.test.tsx 本来就红，不算）", "pnpm test · 13 passed (Nav.test.tsx was already red; not counted)"), ver("4f2c1e0", "10:55")], ["done", L("pnpm build 通过", "pnpm build passed"), ver("4f2c1e0", "10:56")], ["done", L("打开首页、提交了一次表单（截图 1 张）", "Opened the home page and submitted the form once (1 screenshot)"), ver("4f2c1e0", "10:57")]],
          partial: [["failed", L("pnpm test · 12 个通过、1 个失败：带「+」的邮箱", "pnpm test · 12 passed, 1 failed: addresses with “+”"), ver("4f2c1e0", "10:55")], ["done", L("pnpm build 通过", "pnpm build passed"), ver("4f2c1e0", "10:56")], ["idle", L("没打开首页：测试没过就先不看", "Didn't open the page: tests come first"), ""]],
          blocked: [["blocked", L("测试没跑：订阅接口要 STRIPE_KEY", "Tests not run: the subscribe API needs STRIPE_KEY"), ""], ["idle", L("构建、打开首页都在等它", "Build and opening wait on it"), ""]],
          stale: ran ? [["done", L("pnpm test · 13 个通过", "pnpm test · 13 passed"), ver("4f2c1e0", L("刚才", "just now"))], ["done", L("pnpm build 通过", "pnpm build passed"), ver("4f2c1e0", "10:56")]] : [["verify", L("pnpm test 的绿灯来自改动之前，不算", "pnpm test's green is from before the change; it doesn't count"), ver("a1b2c3d", "10:31")], ["done", L("pnpm build 通过", "pnpm build passed"), ver("4f2c1e0", "10:56")]],
          unverified: [["done", L("pnpm test · 13 个通过", "pnpm test · 13 passed"), ver("4f2c1e0", "10:55")], ["done", L("pnpm build 通过", "pnpm build passed"), ver("4f2c1e0", "10:56")], ["blocked", L("没打开看：5173 被占、5174 起不来", "Not opened: 5173 taken, 5174 failed to start"), ""]],
        }[s];
        const open = { done: [], partial: [L("让带「+」的邮箱通过校验", "Accept addresses with “+”")], blocked: [L("选一个 STRIPE_KEY 的密钥引用", "Pick a stored secret for STRIPE_KEY")], stale: ran ? [] : [L("在这次改动上重跑 pnpm test", "Re-run pnpm test on this change")], unverified: [L("启动并实际打开首页", "Start it and open the home page")] }[s];
        const next = { done: accepted ? null : ["primary", "accept", L("接受这一轮", "Accept this round")], partial: ["primary", "toast-done", L("接着修", "Keep fixing"), L("交给 Coding 接着修（模拟）", "Handed back to Coding (sample)")], blocked: ["primary", "toast", L("选一个密钥", "Pick a secret"), L("打开密钥选择（模拟）", "Opening the secret picker (sample)")], stale: ran ? (accepted ? null : ["primary", "accept", L("接受这一轮", "Accept this round")]) : ["primary", "rerun", L("现在重跑测试", "Re-run the tests now")], unverified: ["primary", "toast", L("换个端口再启动", "Start on another port"), L("改用 5175 启动（模拟）", "Starting on 5175 (sample)")] }[s];
        const headWord = accepted ? [L("你已接受", "You accepted"), "done", "done"] : s === "done" || (s === "stale" && ran) ? [L("做完了，等你接受", "Done — waiting for you"), "verify", "attention"] : s === "partial" ? [L("部分完成", "Partly done"), "failed", "blocked"] : s === "blocked" ? [L("卡住了", "Blocked"), "blocked", "hold"] : stale ? [L("还没验证这次改动", "This change isn't verified yet"), "verify", "attention"] : [L("写好了，没打开看过", "Written, not opened"), "verify", "attention"];
        const checkRows = checks.map(([state, text, v2]) => `<div class="chk">${ring(state, 14)}<span class="grow">${text}</span>${v2}</div>`).join("");
        const delivered = `<div class="chk">${ring("done", 14)}<span class="grow">${L("SubscribeForm.tsx（新）、Hero.tsx、form.css", "SubscribeForm.tsx (new), Hero.tsx, form.css")}</span>${btn(L("看改动", "Review"), { v: "ghost", act: "toast", arg: L("打开改动（模拟）", "Opening changes (sample)") })}</div>`;
        const openRows = open.length ? open.map((t) => `<div class="chk">${ring("idle", 14)}<span class="grow">${t}</span></div>`).join("") : `<div class="chk is-quiet">${L("没有", "Nothing")}</div>`;
        const nextBtn = next ? btn(next[2], { v: next[0], act: next[1], arg: next[3], loading: S.busy === next[1] }) : "";
        const reportA = `<div class="report${accepted ? " is-accepted" : ""}"${accepted || ran ? " data-craft-new" : ""}${c.fresh(L("结尾报告卡：分区沿用列表与状态环，四段的组合是新的", "Closing report: sections use the board's list and rings; the four-part layout is new"))}><div class="report__head">${c.K.renderStatusMark({ label: headWord[0], state: headWord[1], tone: headWord[2] })}<span class="grow"></span><span class="cap">${L("本轮结束 · 10:58", "Round ended · 10:58")}</span></div>
          <section><h3>${L("交付了什么", "Delivered")}</h3>${delivered}</section><section><h3>${L("验证", "Checks")}</h3>${checkRows}</section><section><h3>${L("没做完的", "Still open")}</h3>${openRows}</section>${next ? `<div class="acts">${nextBtn}${s === "done" || (s === "stale" && ran) ? btn(L("还要改", "Needs changes"), { act: "toast", arg: L("在输入框里说要改什么（模拟）", "Say what to change in the composer (sample)") }) : ""}</div>` : ""}</div>`;
        const ladder = `<div class="ladder"${c.fresh(L("五级状态阶梯：新增；每级各说一件事，不合并成「完成」", "Five-rung ladder: new; each rung says one fact, never merged into “done”"))}>${rungs.map(([label, on, note], i) => `<div class="rung${on ? " is-on" : ""}">${ring(on ? "done" : i === rungs.length - 1 ? "waiting" : s === "partial" && i >= 2 ? "failed" : s === "blocked" && i >= 2 ? "blocked" : "verify", 14)}<span><b>${label}</b><small>${note}</small></span></div>`).join("")}</div>`;
        let work = you(L("首页加一个订阅表单，测试和构建要过，打开看一眼。", "Add a subscribe form; tests and build must pass; open it once.")) + round(L("执行", "Execute"));
        work += ai(`<p>${s === "done" ? L("表单写好了，测试和构建在这次改动上都过了，也打开首页提交过一次。", "The form is in; tests and build pass on this change, and I submitted it once on the home page.") : s === "partial" ? L("表单写好了，还剩 1 个测试没过。", "The form is in; one test still fails.") : s === "blocked" ? L("表单写好了，但订阅接口要一个密钥才能测。", "The form is in, but the subscribe API needs a secret to test.") : stale ? L("表单写好了。", "The form is in.") : L("表单写好了，测试和构建都过了。", "The form is in; tests and build pass.")}</p>`);
        let board = "", above = "";
        if (scheme === "A") work += rise(reportA);
        if (scheme === "B") work += rise(`${ladder}<div class="list">${checkRows ? `<div class="list__head"><span class="grow">${L("验证", "Checks")}</span></div>` : ""}${checks.map(([state, text, v2]) => `<div class="row">${ring(state)}<span class="nm">${text}</span>${v2}</div>`).join("")}${open.length ? open.map((t) => `<div class="row is-quiet">${ring("idle")}<span class="nm">${t}</span>${badge(L("没做完", "Open"), "warning")}</div>`).join("") : ""}</div>${next ? `<div class="acts" style="margin-top:12px">${nextBtn}</div>` : ""}`);
        if (scheme === "C") {
          board = `<aside class="c-board" aria-label="${L("任务板", "TaskBoard")}"><div class="c-board__head">${ic("list-ordered", "sm")}${L("任务板", "TaskBoard")}<span class="grow"></span>${btn(L("关闭", "Close"), { icon: "x", iconOnly: true, v: "ghost", act: "toggle-board", cls: "only-board-narrow" })}</div><div class="c-board__list"><div class="bcard is-cur"${c.fresh(L("任务板顶部的本轮结果：新增", "The round's result at the top of the TaskBoard: new"))}><div class="row">${c.K.renderStatusMark({ label: headWord[0], state: headWord[1], tone: headWord[2] })}</div>${checkRows}${open.length ? `<div class="chk-sub">${L("没做完：", "Open: ")}${open.join(L("；", "; "))}</div>` : ""}${next ? `<div class="acts">${nextBtn}</div>` : ""}</div>${[L("读现有首页与测试", "Read the home page and tests"), L("写 SubscribeForm", "Write SubscribeForm"), L("跑测试与构建", "Run tests and build"), L("打开首页看一眼", "Open the home page")].map((n, i) => `<div class="bcard"><div class="row"><span class="num">${i + 1}</span><span class="nm">${n}</span>${c.K.renderStatusMark({ label: i < 2 || s === "done" ? L("完成", "Done") : L("见上", "See above"), state: i < 2 || s === "done" ? "done" : "idle", tone: i < 2 || s === "done" ? "done" : "quiet", plain: true })}</div></div>`).join("")}</div></aside>`;
          work += rise(`<div class="round">${ic("history", "sm")}<span class="ell"><b>${L("本轮结束", "Round ended")}</b> · ${esc(headWord[0])} · ${L("结果在任务板顶部", "result at the top of the TaskBoard")}</span></div>`);
        }
        return frame({ dir: dirCol({}), work, board, composer: composer({ above }) });
      },
    },
    acts(c) {
      const { L, S, toast, busy, openPop, recover } = c;
      return {
        "allow-net": () => busy("allow-net", 900, () => { S.v.net = true; toast(L("只为这次任务放行了下载依赖", "Downloads allowed for this task only"), "done"); }),
        "pick-secret": (el) => openPop(el, c.group(L("已存的密钥", "Stored secrets"), c.item({ icon: "lock", label: L("Stripe 测试", "Stripe test"), sub: "STRIPE_KEY · ••••4242", act: "use-secret" }) + c.item({ icon: "lock", label: L("Stripe 正式", "Stripe live"), sub: L("正式密钥，这次不建议用", "Live key; not advised here"), act: "toast", arg: L("正式密钥要另外确认（模拟）", "A live key needs its own confirmation (sample)") })) + `<div class="foot">${L("Coding 只拿到引用，看不到密钥本身。", "Coding gets a reference, never the value.")}</div>`, "wide"),
        "use-secret": () => busy("pick-secret", 700, () => { S.v.secret = true; toast(L("用了「Stripe 测试」的引用；启动成功", "Using the “Stripe test” reference; started"), "done"); }),
        "fix-start": () => busy("fix-start", 1100, () => { S.v.start = true; toast(L("构建 packages/ui 后，副本在 5174 启动了", "Built packages/ui; the copy runs on 5174"), "done"); }),
        more: () => busy("more", 700, () => { S.v.more = true; toast(L("又给了 3 次和同样的额度", "Granted 3 more attempts"), "done"); }),
        "budget-pop": (el) => openPop(el, `<div class="body"><b>${L("这一项为什么在重试", "Why this task is retrying")}</b><br>${L("每次重试都说来源：验证没过、模型出错、你要求。额度用完就停下说明，不会无限重试。", "Each retry names its source: a failed check, a model error, or you. When the budget runs out it stops and explains; it never loops forever.")}</div>`, "wide"),
        check: () => busy("check", 900, () => { S.v.checked = true; toast(L("核对完，没有重跑任何东西", "Checked; nothing was re-run"), "done"); }),
        continue: () => toast(L("接着做（模拟）", "Continuing (sample)"), "done"),
        "resume-pop": (el) => openPop(el, recover(S._resumeRec), "wide"),
        accept: () => busy("accept", 600, () => { S.v.accepted = true; toast(L("已接受这一轮；Goal 的验收不会因此自动改", "Round accepted; the Goal's acceptance doesn't change by itself"), "done"); }),
        rerun: () => busy("rerun", 1100, () => { S.v.ran = true; toast(L("在 4f2c1e0 上重跑：13 个通过", "Re-ran on 4f2c1e0: 13 passed"), "done"); }),
      };
    },
  });
})();
