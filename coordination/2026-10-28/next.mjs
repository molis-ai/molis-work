#!/usr/bin/env node
// What is one role's to do now in the cross-device anti-corruption flow (coordination/2026-10-28/README.md).
// All state comes from GitHub: the board on the coordination branch, task/* branches, task PRs with their stage comments
// and checks, and the coordination issue. Nothing is written except the --new state file.
//
//   node next.mjs --role dev-a|dev-b|codex|review|coord|status [--wait] [--max <min>] [--interval <s>] [--new <file>] [--json]
//
//   --wait      poll until there is something to do (or --max minutes pass, default 240), then print and exit
//   --new FILE  only items not printed before wake --wait; FILE keeps the keys already printed
//   --board-file FILE  read the board from a local file (to try one before pushing it)
//
// Run it from any checkout of the repository (needs git and gh). Other devices fetch it first:
//   git fetch -q origin coordination/handoff-2026-10-14 &&
//   git show origin/coordination/handoff-2026-10-14:coordination/2026-10-28/next.mjs > "${TMPDIR:-/tmp}/next.mjs"
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const COORD = "coordination/handoff-2026-10-14";
const BOARD = "coordination/2026-10-28/BOARD.md";
const ISSUE = 1332;
const STALE_HOURS = 2;
const DEPTH = 3;
const PUSH_MINUTES = 60;
const SUFFIX = { A: "a", B: "b", Codex: "cx", 本机: "m" };
const DEVICE = { a: "A", b: "B", cx: "Codex", m: "本机" };
const SIGNATURE = { a: "DeepSeek（设备 A）", b: "DeepSeek（设备 B）", cx: "Codex（设备 A）", m: "Claude" };
const STAGES = "方案|交接|一审|验证|修复|二审|问统筹|统筹答|合入|空闲|阻塞|main 红|设备";
const HEADER = new RegExp(`^【(${STAGES})(?:\\s*(T-\\d{3}))?】\\s*(.*)$`);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const role = value("--role");
const ROLES = ["dev-a", "dev-b", "codex", "review", "coord", "status"];
if (!ROLES.includes(role)) {
  console.error(`--role 要写 ${ROLES.join("、")} 之一`);
  process.exit(2);
}

const run = (cmd, args, input) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20, input, stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] });
const ghJson = (args) => JSON.parse(run("gh", args));
const ghLines = (args) => run("gh", args).split("\n").filter(Boolean).map((line) => JSON.parse(line));

function parseStage(comment) {
  const lines = comment.body.trim().split(/\r?\n/);
  const m = lines[0].match(HEADER);
  if (!m) return null;
  const [, kind, task, rest] = m;
  let verdict = null;
  let fixedAt = null;
  if (kind === "一审") {
    fixedAt = rest.match(/已小修\s*@([0-9a-f]{7,40})/)?.[1] ?? null;
    verdict = fixedAt ? "已小修" : /要改/.test(rest) ? "要改" : /可进二审/.test(rest) ? "可进二审" : null;
  } else if (kind === "验证") verdict = /失败/.test(rest) ? "失败" : /通过/.test(rest) ? "通过" : null;
  else if (kind === "二审") verdict = /要改/.test(rest) ? "要改" : /可合/.test(rest) ? "可合" : null;
  return {
    kind,
    task: task ?? null,
    at: rest.match(/@([0-9a-f]{7,40})/)?.[1] ?? null,
    fixedAt,
    verdict,
    full: comment.body.match(/full\s*=\s*(true|false)/)?.[1] ?? null,
    sig: lines.at(-1).match(/^—\s*(.+)$/)?.[1]?.trim() ?? "",
    time: comment.createdAt,
    url: comment.url,
    id: String(comment.id),
  };
}

function parseBoard(text) {
  const rows = [];
  const standingLocks = [];
  const urgent = new Set();
  let header = null;
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) {
      header = null;
      const listed = line.match(/^加急[:：](.*)$/);
      if (listed) for (const m of listed[1].matchAll(/T-\d{3}/g)) urgent.add(m[0]);
      continue;
    }
    const cells = line.slice(1, -1).split("|").map((c) => c.trim());
    if (!header) {
      header = cells;
      continue;
    }
    if (/^-+$/.test(cells[0].replace(/:/g, ""))) continue;
    const col = (name) => cells[header.indexOf(name)] ?? "";
    const locks = [...col("锁定的文件").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (/^T-\d{3}$/.test(cells[0])) {
      rows.push({
        id: cells[0],
        title: col("标题"),
        tier: col("档"),
        owner: col("派给"),
        order: Number(col("顺位")) || 99,
        deps: [...col("依赖").matchAll(/T-\d{3}/g)].map((m) => m[0]),
        locks,
      });
    } else if (header.includes("锁定的文件")) standingLocks.push(...locks);
  }
  return { rows, standingLocks, urgent };
}

function checkState(pr, test) {
  const runs = (pr.statusCheckRollup ?? []).filter((c) => test(c.name ?? c.context ?? ""));
  if (runs.length === 0) return "none";
  const states = runs.map((c) =>
    c.status && c.status !== "COMPLETED" ? "pending" : (c.conclusion ?? c.state ?? "").toUpperCase() === "SUCCESS" ? "success" : (c.conclusion ?? c.state ?? "").toLowerCase(),
  );
  if (states.includes("pending")) return "pending";
  if (states.every((s) => s === "success" || s === "skipped" || s === "neutral")) return "success";
  return states.includes("failure") ? "failure" : states.find((s) => s !== "success");
}

function fixtureSnapshot(file) {
  const f = JSON.parse(readFileSync(file, "utf8"));
  const taskOf = (ref) => ref.match(/^task\/T(\d{3})-(a|b|cx|m)$/);
  return {
    board: parseBoard(f.board),
    boardSha: "fixture",
    boardTime: f.boardTime ?? new Date(0).toISOString(),
    mainSha: "fixture",
    branches: f.branches.map((b) => (typeof b === "string" ? { branch: b } : b)).map((b) => ({ ...b, m: taskOf(b.branch) })).map(({ m, time }) => ({ id: `T-${m[1]}`, suffix: m[2], branch: m[0], time })),
    open: f.open.map((pr) => ({ ...pr, m: taskOf(pr.headRefName) })).map((pr) => ({ ...pr, id: `T-${pr.m[1]}`, suffix: pr.m[2] })),
    merged: new Set(f.merged),
    issue: f.issue.map(parseStage).filter(Boolean),
    mainRuns: f.mainRuns ?? [],
    fullsRunning: f.fullsRunning ?? 0,
    carrierRunning: f.carrierRunning ?? 0,
  };
}

function snapshot() {
  // --fixture replays a saved state, to check the rules without GitHub.
  if (value("--fixture")) return fixtureSnapshot(value("--fixture"));
  run("git", ["fetch", "-q", "origin", "main", COORD, "+refs/heads/task/*:refs/remotes/origin/task/*"]);
  // --board-file reads a local board instead, to try a board before it is pushed.
  const boardFile = value("--board-file");
  const board = parseBoard(boardFile ? readFileSync(boardFile, "utf8") : run("git", ["show", `origin/${COORD}:${BOARD}`]));
  const boardSha = boardFile ? "local" : run("git", ["log", "-1", "--format=%h", `origin/${COORD}`, "--", BOARD]).trim();
  const boardTime = boardFile ? new Date(0).toISOString() : run("git", ["log", "-1", "--format=%cI", `origin/${COORD}`, "--", BOARD]).trim();
  const mainSha = run("git", ["rev-parse", "--short=9", "origin/main"]).trim();
  const taskOf = (ref) => ref.match(/^task\/T(\d{3})-(a|b|cx|m)$/);
  const branches = run("git", ["ls-remote", "--heads", "origin", "task/*"])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t")[1].replace("refs/heads/", ""))
    .map(taskOf)
    .filter(Boolean)
    .map((m) => ({ id: `T-${m[1]}`, suffix: m[2], branch: m[0] }));
  // When each claim was last pushed: a claim with no pushes or comments for hours is one the coordinator asks about.
  const pushed = new Map(
    run("git", ["for-each-ref", "--format=%(refname:short) %(committerdate:iso-strict)", "refs/remotes/origin/task/"])
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(" "))
      .map(([ref, time]) => [ref.replace(/^origin\//, ""), time]),
  );
  for (const b of branches) b.time = pushed.get(b.branch);
  const prFields = "number,title,url,headRefName,headRefOid,isDraft,createdAt,labels,statusCheckRollup,files,comments";
  const open = ghJson(["pr", "list", "--state", "open", "--limit", "100", "--json", prFields])
    .map((pr) => ({ ...pr, m: taskOf(pr.headRefName) }))
    .filter((pr) => pr.m)
    .map((pr) => ({ ...pr, id: `T-${pr.m[1]}`, suffix: pr.m[2] }));
  const merged = new Set(
    ghJson(["pr", "list", "--state", "merged", "--limit", "300", "--json", "headRefName"])
      .map((pr) => taskOf(pr.headRefName))
      .filter(Boolean)
      .map((m) => `T-${m[1]}`),
  );
  const issue = ghLines(["api", "--paginate", `repos/{owner}/{repo}/issues/${ISSUE}/comments`, "--jq", ".[] | {id, body, createdAt: .created_at, url: .html_url} | @json"])
    .map(parseStage)
    .filter(Boolean);
  const mainRuns = ghJson(["run", "list", "--branch", "main", "--limit", "20", "--json", "databaseId,workflowName,conclusion,status,event,createdAt,url"]);
  const fulls = ghJson(["run", "list", "--workflow", "full-suite.yml", "--limit", "20", "--json", "status,headBranch"]).filter((r) => r.status !== "completed");
  const fullsRunning = fulls.length;
  const carrierRunning = fulls.filter((r) => r.headBranch.startsWith("integration/")).length;
  return { board, boardSha, boardTime, mainSha, branches, open, merged, issue, mainRuns, fullsRunning, carrierRunning };
}

const patchIds = new Map();
function patchId(sha) {
  if (!patchIds.has(sha)) {
    let id = null;
    try {
      const full = run("git", ["rev-parse", "--verify", `${sha}^{commit}`]).trim();
      const base = run("git", ["merge-base", "origin/main", full]).trim();
      id = run("git", ["patch-id", "--stable"], run("git", ["diff", base, full])).split(" ")[0] || null;
    } catch {
      id = null; // the commit is not here (never pushed to the branch): the review cannot carry over
    }
    patchIds.set(sha, id);
  }
  return patchIds.get(sha);
}
// A review made at `at` holds for `head` when it is the same commit, or when head only merged main in cleanly (same patch).
const holdsAt = (at, head) => Boolean(at) && (head.startsWith(at) || (patchId(at) !== null && patchId(at) === patchId(head)));

const last = (list) => list.at(-1);
const hoursSince = (time) => (Date.now() - Date.parse(time)) / 3_600_000;
const SECURITY_FILES = /^(tests\/security-invariants|docs\/system\/SECURITY-INVARIANTS\.md)/;

function analyse(pr, issueStages, tier) {
  const fromPr = (pr.comments ?? [])
    .map((c) => parseStage({ ...c, id: c.id ?? c.url }))
    .filter(Boolean)
    .map((s) => ({ ...s, task: pr.id }));
  const stages = [...fromPr, ...issueStages.filter((s) => s.task === pr.id)].sort((x, y) => x.time.localeCompare(y.time));
  const head = pr.headRefOid;
  const of = (kind, verdicts) => stages.filter((s) => s.kind === kind && (!verdicts || verdicts.includes(s.verdict)));
  const lastDev = last(stages.filter((s) => s.kind === "交接" || s.kind === "修复"));
  // A 【验证 失败】 that a later 【验证 通过】 on the same head overturns (CI reran, no new code) asks nobody to change anything.
  const sameHead = (a, b) => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));
  const overturned = (f) => of("验证", ["通过"]).some((s) => s.time > f.time && sameHead(s.at, f.at));
  const lastChange = last([...of("一审", ["要改"]), ...of("二审", ["要改"]), ...of("验证", ["失败"]).filter((f) => !overturned(f))].sort((x, y) => x.time.localeCompare(y.time)));
  const fresh = (s) => !lastChange || s.time > lastChange.time;
  const passed = (kind, verdicts) => last(of(kind, verdicts).filter((s) => fresh(s) && holdsAt(s.fixedAt ?? s.at, head)));
  // Codex's own tasks, the local lines and 丙 get no 一审: 二审 reviews them with the 一审 list too, Codex only verifies.
  const needYi = pr.suffix !== "m" && pr.suffix !== "cx" && tier !== "丙";
  const yi = needYi ? passed("一审", ["可进二审", "已小修"]) : null;
  const yan = passed("验证", ["通过"]);
  const er = passed("二审", ["可合"]);
  const lastAsk = last(of("问统筹"));
  const lastAnswer = last(of("统筹答"));
  const lastPlan = last(of("方案"));
  // A 【统筹答】 is for whoever asked last before it (a 【问统筹】 or 【方案】), else for the developer; it is read once they comment again.
  const asked = lastAnswer && last(stages.filter((s) => (s.kind === "问统筹" || s.kind === "方案") && s.time < lastAnswer.time));
  const audience = asked?.sig || SIGNATURE[pr.suffix];
  let phase;
  if (!lastDev) phase = "开发中";
  else if (lastChange && lastChange.time > lastDev.time) phase = "要改";
  else if ((needYi && !yi) || !yan) phase = "待一审";
  else if (!er) phase = "待二审";
  else phase = "待合";
  const since = { 开发中: pr.createdAt, 要改: lastChange?.time, 待一审: lastDev?.time, 待二审: last([yi?.time, yan?.time].filter(Boolean).sort()), 待合: er?.time }[phase];
  return {
    pr,
    phase,
    label: phase === "待一审" && (!needYi || yi) ? "待验证" : phase,
    since,
    head9: head.slice(0, 9),
    needYi,
    yi,
    yan,
    er,
    lastDev,
    lastChange,
    full: last(stages.filter((s) => s.full))?.full ?? null,
    verify: checkState(pr, (n) => n === "Verify"),
    fullRun: checkState(pr, (n) => n === "Full suite"),
    security: (pr.files ?? []).some((f) => SECURITY_FILES.test(f.path)) ? checkState(pr, (n) => n.startsWith("Security invariants")) : null,
    askOpen: lastAsk && (!lastAnswer || lastAnswer.time < lastAsk.time) ? lastAsk : null,
    planOpen: lastPlan && (!lastAnswer || lastAnswer.time < lastPlan.time) ? lastPlan : null,
    answerUnread: lastAnswer && !stages.some((s) => s.sig.startsWith(audience) && s.time > lastAnswer.time) ? lastAnswer : null,
    audience,
  };
}

function plan(snap) {
  const { board, open, merged, branches, issue } = snap;
  const tasks = new Map(board.rows.map((r) => [r.id, r]));
  const states = open.map((pr) => analyse(pr, issue, tasks.get(pr.id)?.tier));
  // A branch holds its task only while the board still gives the task to that branch's device: moving the row takes the task back.
  const fits = (b) => {
    const row = tasks.get(b.id);
    return !row || row.owner === "池" || SUFFIX[row.owner] === b.suffix;
  };
  const claims = branches.filter(fits);
  const claimedIds = new Set([...claims.map((b) => b.id), ...open.map((p) => p.id), ...merged]);
  const urgent = (id) => board.urgent.has(id);
  const tierOf = (s) => tasks.get(s.pr.id)?.tier;
  const lastTouch = (b) => [b.time, ...issue.filter((s) => s.task === b.id).map((s) => s.time)].filter(Boolean).sort().at(-1);
  const inflightLocks = new Set(board.standingLocks);
  for (const row of board.rows) if (claimedIds.has(row.id) && !merged.has(row.id)) row.locks.forEach((l) => inflightLocks.add(l));
  const lockHeld = (row) => row.locks.some((l) => [...inflightLocks].some((held) => held === l || l.startsWith(held.endsWith("/") ? held : `${held}/`)));
  const claimable = (owner) =>
    board.rows
      .filter((r) => r.owner === owner || (r.owner === "池" && (owner === "A" || owner === "B")))
      .sort((x, y) => (x.owner === "池") - (y.owner === "池") || x.order - y.order)
      .filter((r) => !claimedIds.has(r.id) && r.deps.every((d) => merged.has(d)) && !lockHeld(r));
  const issueOpen = (task, kind) => {
    const asks = issue.filter((s) => s.kind === kind && s.task === task);
    const answers = issue.filter((s) => s.kind === "统筹答" && s.task === task);
    return asks.filter((a) => !answers.some((b) => b.time > a.time));
  };
  const item = (key, text, url, order = 5) => ({ key, text, url, order });
  const ref = (s) => `${s.pr.id} #${s.pr.number} @${s.head9}`;
  const out = [];

  if (role === "dev-a" || role === "dev-b" || role === "codex") {
    const suffix = role === "codex" ? "cx" : role.slice(4);
    const device = DEVICE[suffix];
    const me = SIGNATURE[suffix];
    const mine = states.filter((s) => s.pr.suffix === suffix);
    for (const s of mine) {
      const first = urgent(s.pr.id) ? 0 : 1;
      const tag = urgent(s.pr.id) ? "（加急，先做）" : "";
      if (s.phase === "要改") out.push(item(`fix:${s.pr.number}:${s.lastChange.id}`, `修：${ref(s)} 的【${s.lastChange.kind} ${s.lastChange.verdict}】${tag}`, s.lastChange.url, first));
      else if (s.verify === "failure") out.push(item(`verify:${s.pr.number}:${s.head9}`, `修：${ref(s)} 的 Verify 红了${tag}`, s.pr.url, first));
    }
    for (const s of states)
      if (s.answerUnread && s.audience === me) out.push(item(`answer:${s.answerUnread.id}`, `读：${s.pr.id} 的【统筹答】`, s.answerUnread.url, 1));
    const unopened = branches.filter((b) => b.suffix === suffix && !open.some((p) => p.id === b.id) && !merged.has(b.id));
    for (const b of unopened.filter((x) => !fits(x)))
      out.push(item(`reclaimed:${b.branch}`, `${b.id} 已收回，看板改派给 ${tasks.get(b.id).owner}：不再推 ${b.branch}，在 #${ISSUE} 说一句推到了哪个提交；远端分支留着，不删`, null, 1));
    const myBranches = unopened.filter(fits);
    for (const b of myBranches) {
      for (const a of issue.filter((s) => s.kind === "统筹答" && s.task === b.id)) {
        const mineAfter = issue.some((s) => s.task === b.id && s.sig === me && s.time > a.time);
        if (!mineAfter) out.push(item(`answer:${a.id}`, `读：${b.id} 的【统筹答】（#${ISSUE}）`, a.url, 1));
      }
      const twin = claims.find((o) => o.id === b.id && o.suffix !== suffix);
      if (twin && twin.suffix < suffix) out.push(item(`twin:${b.branch}`, `${b.id} 已被设备 ${DEVICE[twin.suffix]} 先领：删掉 ${b.branch}，领下一项`, null, 1));
    }
    const blocked = (id) => issueOpen(id, "方案").length > 0 || issueOpen(id, "问统筹").length > 0;
    const developing = myBranches.filter((b) => !blocked(b.id)).length;
    for (const b of myBranches.filter((x) => !blocked(x.id) && x.time)) {
      const minutes = (Date.now() - Date.parse(b.time)) / 60_000;
      if (minutes > PUSH_MINUTES) out.push(item(`push:${b.branch}:${b.time}`, `推一次进度：${b.branch} 已 ${Math.round(minutes)} 分钟没推（推一个写明做到哪里的提交；卡住了在 #${ISSUE} 贴【阻塞】）`, null, 5));
    }
    const fixing = mine.some((s) => s.phase === "要改" || s.verify === "failure");
    if (role === "codex") {
      const rank = (x) => (urgent(x.pr.id) ? 0 : x.lastDev.kind === "修复" ? 1 : 2);
      for (const s of states.filter((x) => x.phase === "待一审").sort((x, y) => rank(x) - rank(y) || x.lastDev.time.localeCompare(y.lastDev.time))) {
        const what = [s.needYi && !s.yi ? "一审" : null, !s.yan ? "验证" : null].filter(Boolean).join("、");
        const note = s.verify === "pending" ? "（Verify 未出，验证结论等它）" : s.verify === "failure" ? "（Verify 红，退回开发）" : "";
        if (s.verify !== "failure") out.push(item(`review1:${s.pr.number}:${s.head9}`, `${what}：${ref(s)}（${s.lastDev.kind}，档 ${tierOf(s) ?? "?"}${urgent(s.pr.id) ? "，加急" : ""}）${note}`, s.lastDev.url, urgent(s.pr.id) ? 1 : s.lastDev.kind === "修复" ? 2 : 3));
      }
      const reported = issue.filter((s) => s.kind === "main 红");
      for (const wf of ["CI", "Full suite"]) {
        const r = snap.mainRuns.find((x) => x.workflowName === wf && x.status === "completed" && x.conclusion !== "cancelled");
        if (r?.conclusion === "failure" && !reported.some((s) => s.time > r.createdAt)) out.push(item(`mainred:${r.databaseId}`, `main 红：${wf}（${r.event}）`, r.url, 4));
      }
    }
    if (!fixing && developing === 0 && !(role === "codex" && out.some((o) => o.order <= 4))) {
      const next = claimable(device)[0];
      if (next) out.push(item(`claim:${next.id}`, `领：${next.id} ${next.title}（档 ${next.tier}）`, null, 6));
      else if (role !== "codex" && out.length === 0) {
        const saidIdle = issue.some((s) => s.kind === "空闲" && s.sig === me && s.time > snap.boardTime);
        if (!saidIdle) out.push(item(`idle:${device}:${snap.boardSha}`, `空闲：在 #${ISSUE} 贴【空闲】`, null, 7));
      }
    }
  }

  if (role === "review") {
    for (const s of states.filter((x) => x.phase === "待二审").sort((x, y) => urgent(y.pr.id) - urgent(x.pr.id) || x.since.localeCompare(y.since)))
      out.push(item(`review2:${s.pr.number}:${s.head9}`, `二审：${ref(s)}（档 ${tierOf(s) ?? "?"}，${s.pr.files?.length ?? "?"} 个文件${urgent(s.pr.id) ? "，加急" : ""}${s.needYi ? "" : "，没有一审：连一审的清单一起看"}）`, s.pr.url, urgent(s.pr.id) ? 2 : 3));
  }

  if (role === "coord") {
    const { fullsRunning, carrierRunning } = snap;
    // README 第 9 节的 runner 预算：承载分支在排或在跑时不排 PR Full；晚高峰（UTC 10～15 点）最多一个，平时最多两个。
    const utcHour = new Date().getUTCHours();
    const fullCap = utcHour >= 10 && utcHour < 15 ? 1 : 2;
    const fullWait = carrierRunning > 0 ? "承载分支的 Full 在排或在跑" : fullsRunning >= fullCap ? `已有 ${fullsRunning} 个 Full（现在最多 ${fullCap} 个）` : null;
    for (const s of states) {
      if (s.askOpen) out.push(item(`ask:${s.askOpen.id}`, `答：${s.pr.id} 的【问统筹】`, s.askOpen.url, 1));
      if (s.planOpen) out.push(item(`plan:${s.planOpen.id}`, `批：${s.pr.id} 的【方案】`, s.planOpen.url, 1));
      if (s.full === "true" && (!s.needYi || s.yi) && s.fullRun === "failure")
        out.push(item(`fullred:${s.pr.number}:${s.head9}`, `Full 在这个头上红了：${ref(s)}：先归因（第 9 节）；无关的偶发只重跑失败的作业 gh run rerun <run> --failed，不重加标签`, s.pr.url, 2));
      else if (s.full === "true" && (!s.needYi || s.yi) && s.fullRun !== "success" && s.fullRun !== "pending") {
        if (s.verify !== "success") out.push(item(`fullverify:${s.pr.number}:${s.head9}:${s.verify}`, `待排 Full：${ref(s)}：等 Verify 绿（现在 ${s.verify}）`, s.pr.url, 8));
        else if (fullWait) out.push(item(`fullwait:${s.pr.number}:${s.head9}`, `待排 Full：${ref(s)}：${fullWait}`, s.pr.url, 6));
        else out.push(item(`full:${s.pr.number}:${s.head9}`, `排 Full：${ref(s)}（在跑 ${fullsRunning} 个）：gh pr edit ${s.pr.number} --remove-label full-suite; gh pr edit ${s.pr.number} --add-label full-suite`, s.pr.url, 2));
      }
      if (s.phase === "待合") {
        const missing = [
          s.verify !== "success" ? `Verify ${s.verify}` : null,
          s.full === "true" && s.fullRun !== "success" ? `Full ${s.fullRun}` : null,
          s.security && s.security !== "success" ? `security-invariants ${s.security}` : null,
          s.askOpen ? "有未答的【问统筹】" : null,
        ].filter(Boolean);
        if (missing.length === 0)
          out.push(item(`merge:${s.pr.number}:${s.head9}`, `合并：${ref(s)}${s.security ? "（先手查 security-invariants 作业）" : ""}：gh pr merge ${s.pr.number} --match-head-commit ${s.pr.headRefOid}`, s.pr.url, 2));
        else out.push(item(`wait:${s.pr.number}:${s.head9}:${missing.join(",")}`, `待合但差：${ref(s)}：${missing.join("；")}`, s.pr.url, 8));
      }
      if (s.since && hoursSince(s.since) > STALE_HOURS && s.phase !== "开发中")
        out.push(item(`stale:${s.pr.number}:${s.head9}:${s.phase}`, `${ref(s)} 在「${s.label}」等了 ${hoursSince(s.since).toFixed(1)} 小时`, s.pr.url, 4));
    }
    for (const id of new Set(issue.filter((s) => s.task).map((s) => s.task))) {
      if (open.some((p) => p.id === id)) continue;
      for (const a of issueOpen(id, "问统筹")) out.push(item(`ask:${a.id}`, `答：${id} 的【问统筹】（#${ISSUE}）`, a.url, 1));
      for (const p of issueOpen(id, "方案")) out.push(item(`plan:${p.id}`, `批：${id} 的【方案】（#${ISSUE}）`, p.url, 1));
    }
    const lastCoord = last(issue.filter((s) => s.sig === "Claude 统筹"))?.time ?? "";
    for (const s of issue.filter((x) => ["空闲", "阻塞", "main 红", "设备"].includes(x.kind) || (x.kind === "问统筹" && !x.task)))
      if (s.time > lastCoord) out.push(item(`issue:${s.id}`, `#${ISSUE}：【${s.kind}】${s.sig}`, s.url, 3));
    const asking = (id) => issueOpen(id, "方案").length > 0 || issueOpen(id, "问统筹").length > 0;
    // A device develops one task at a time: a claim parked while the same device pushes another is waiting its turn, not stalled.
    const busy = (suffix) => claims.some((x) => x.suffix === suffix && x.time && hoursSince(x.time) <= STALE_HOURS);
    for (const b of claims.filter((x) => !open.some((p) => p.id === x.id) && !merged.has(x.id) && !asking(x.id) && !busy(x.suffix))) {
      const touched = lastTouch(b);
      if (touched && hoursSince(touched) > STALE_HOURS)
        out.push(item(`stalled:${b.branch}:${touched}`, `${b.id} ${b.branch} 已 ${hoursSince(touched).toFixed(1)} 小时没有推送或评论：在 #${ISSUE} 问一声；问后 1 小时仍没回音，可以在看板改派给收回`, null, 4));
    }
    for (const device of ["A", "B", "池"]) {
      const left = board.rows.filter((r) => r.owner === device && !claimedIds.has(r.id) && r.deps.every((d) => merged.has(d))).length;
      if (left < DEPTH) out.push(item(`depth:${device}:${left}`, `补任务书：${device === "池" ? "公共池" : `设备 ${device}`} 能领的只剩 ${left} 份（常备 ${DEPTH} 份）`, null, 5));
    }
  }
  return { out: out.sort((x, y) => x.order - y.order), states, tasks, claimedIds };
}

function status(snap, { states, claimedIds }) {
  const lines = [];
  for (const row of snap.board.rows.sort((x, y) => x.id.localeCompare(y.id))) {
    const s = states.find((x) => x.pr.id === row.id);
    const phase = snap.merged.has(row.id)
      ? "已合"
      : s
        ? `${s.label} #${s.pr.number} @${s.head9}${s.since ? ` ${hoursSince(s.since).toFixed(1)}h` : ""}`
        : claimedIds.has(row.id)
          ? `开发中（${snap.branches.filter((b) => b.id === row.id).map((b) => b.branch).join("、")}）`
          : row.deps.every((d) => snap.merged.has(d))
            ? "待领"
            : `等 ${row.deps.filter((d) => !snap.merged.has(d)).join("、")}`;
    lines.push(`${row.id}  ${row.owner.padEnd(5)} ${row.tier}  ${phase}  ${row.title}`);
  }
  return lines;
}

function once() {
  const snap = snapshot();
  const result = plan(snap);
  return { snap, ...result };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stateFile = value("--new");
const seen = new Set(stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : []);
const deadline = Date.now() + Number(value("--max", "240")) * 60_000;
const interval = Number(value("--interval", "180")) * 1000;

for (;;) {
  let result = null;
  try {
    result = once();
  } catch (error) {
    console.error(`读不到 GitHub 或 git：${error.message.split("\n")[0]}`);
    if (!flag("--wait")) process.exit(2);
  }
  if (result) {
    const fresh = result.out.filter((o) => !seen.has(o.key));
    const wake = stateFile ? fresh : result.out;
    if (role === "status" || !flag("--wait") || wake.length > 0) {
      if (flag("--json")) console.log(JSON.stringify(role === "status" ? status(result.snap, result) : result.out, null, 2));
      else {
        console.log(`${role}  main ${result.snap.mainSha}  看板 ${result.snap.boardSha}  ${new Date().toISOString().slice(0, 16)}Z`);
        if (role === "status") console.log(status(result.snap, result).join("\n"));
        else if (result.out.length === 0) console.log("无事");
        else for (const o of result.out) console.log(`${stateFile && !seen.has(o.key) ? "新 " : ""}${o.text}${o.url ? `  ${o.url}` : ""}`);
      }
      if (stateFile) writeFileSync(stateFile, JSON.stringify([...new Set([...seen, ...result.out.map((o) => o.key)])]));
      break;
    }
  }
  if (Date.now() > deadline) {
    console.log(`${role}：等到上限，无事`);
    break;
  }
  await sleep(interval);
}
