// PA-22: base SDK adoption behavior and retained review/budget boundaries.
import assert from "node:assert/strict";
import nodeTest from "node:test";
import { installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";

installHostUiText();
const test = (name: string, run: () => void | Promise<void>) => nodeTest(name, () => runWithLocale("zh", run));

import {
  isDecidable,
  leakedMarkup,
  renderAgentReviewSurface,
  reviewPhase,
  reviewSourceSummary,
  type AgentReviewPrimitives,
  type AgentReviewRow,
} from "@molis-ai/molis-work-app-workbench";

/** C4 的验收：批准不等于已发生，已决定的不能再决定一次。 */

const p: AgentReviewPrimitives = {
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  formatDate: (value) => value.slice(0, 10),
};

function row(overrides: Partial<AgentReviewRow> = {}): AgentReviewRow {
  return {
    decisions: { approve: { available: true }, reject: { available: true } },
    request: {
      review_id: "r1",
      reference: { owner: { kind: "agent-review", project_id: "board-a", plugin_id: "io.molis.work.coding", install_id: "fixture" }, id: "r1", version: "shown-version" },
      run: { run_id: "run-1", session_id: "s-1" },
      project_id: "board-a",
      plugin_id: "io.molis.work.coding",
      kind: "text-edit",
      document: {
        kind: "text-edit",
        target_path: "apps/local-host/src/connect.ts",
        exists: true,
        before_text: "old",
        after_text: "new",
      },
      requested_at: "2026-09-19T14:00:00Z",
      expires_at: null,
    },
    ...overrides,
  };
}

function receipt(overrides: Partial<AgentReviewRow["receipt"] & object> = {}) {
  return {
    review_id: "r1",
    status: "approved" as const,
    decided_by: "user",
    decided_at: "2026-09-19T14:05:00Z",
    note: null,
    effect_settled: false,
    effect_error: null,
    ...overrides,
  };
}

test("APR-12: persisted person and policy sources are distinct; historical actor text cannot invent a person source", () => {
  const personRow = row({ receipt: receipt({ source: { kind: "person", actor_id: "user" } }) });
  const person = renderAgentReviewSurface({ rows: [personRow], primitives: p });
  assert.match(person, /data-review-source="person"/); assert.match(person, /本人决定/);
  assert.equal(reviewSourceSummary(personRow).person, "user");
  assert.equal(reviewSourceSummary(row({ receipt: receipt() })).person, null);
  const policy = renderAgentReviewSurface({ rows: [row({ receipt: receipt({ source: { kind: "policy", owner: "agent.session-rule", id: "rule", revision: 1, set_by: "user", set_at: "2026-09-19T14:00:00Z" } }) })], primitives: p });
  assert.match(policy, /data-review-source="policy"/); assert.match(policy, /自动策略/); assert.doesNotMatch(policy, /本人决定/);
  const history = renderAgentReviewSurface({ rows: [row({ receipt: receipt({ note: "approved by a human" }) })], primitives: p });
  assert.match(history, /data-review-source="unrecorded"/); assert.match(history, /来源未记录/);
  assert.match(person, /data-agent-review-version="shown-version"/);
});

test("APR-12: approval history shows the recorded automatic source in both languages", () => {
  const delegation = { id: "grant", revision: 2, work_epoch: "work-epoch", grantor_id: "original-grantor" };
  const sources = [
    [{ kind: "delegation", delegation }, "沿用授权", "Delegated authority"],
    [{ kind: "policy", owner: "agent.session-rule", id: "rule", revision: 1, set_by: "original-grantor", set_at: "2026-09-19T14:00:00Z" },
      "自动策略", "Automatic policy"],
    [{ kind: "ai", delegation, assessment: { id: "assessment", version: "assessment-version", provider_id: "fixture.evaluator", model_id: "fixture-model" },
      reason: "Recorded low-risk assessment" }, "AI 代批", "AI approval"],
  ] as const;
  for (const [source, zh, en] of sources) {
    const recorded = row({ receipt: receipt({ source, decided_by: "original-grantor" }) });
    for (const [locale, label] of [["zh", zh], ["en", en]] as const) runWithLocale(locale, () => {
      const summary = reviewSourceSummary(recorded);
      assert.equal(summary.person, null, source.kind);
      assert.equal(summary.source, label);
      const html = renderAgentReviewSurface({ rows: [recorded], primitives: p });
      assert.ok(html.includes(`data-review-source="${source.kind}">${label}</span>`));
    });
  }
});

test("批准之后、真实回执之前，是「已批准，执行结果待确认」，不是「已完成」", () => {
  const approved = row({ receipt: receipt() });
  assert.equal(reviewPhase(approved), "approved");
  const html = renderAgentReviewSurface({ rows: [approved], primitives: p });
  assert.match(html, /已批准，执行结果待确认/);
  assert.doesNotMatch(html, /已完成/);
});

test("拿到真实回执才是已完成", () => {
  const done = row({ receipt: receipt({ effect_settled: true }) });
  assert.equal(reviewPhase(done), "done");
  assert.match(renderAgentReviewSurface({ rows: [done], primitives: p }), /已完成/);
});

test("批准了但执行失败，如实显示失败而不是成功", () => {
  const failed = row({ receipt: receipt({ effect_error: "磁盘只读" }) });
  assert.equal(reviewPhase(failed), "failed");
  const html = renderAgentReviewSurface({ rows: [failed], primitives: p });
  assert.match(html, /已批准，但执行未完成/);
  assert.match(html, /磁盘只读/);
});

test("只有待决定的条目才给动作按钮：已决定的不能换个入口再批一次", () => {
  const pending = row();
  assert.equal(isDecidable(pending), true);
  assert.match(renderAgentReviewSurface({ rows: [pending], primitives: p }), /data-agent-review-approve="r1"/);

  for (const status of ["approved", "rejected", "cancelled", "expired"] as const) {
    const settled = row({ receipt: receipt({ status }) });
    assert.equal(isDecidable(settled), false, `${status} 不该还能决定`);
    const html = renderAgentReviewSurface({ rows: [settled], primitives: p });
    assert.doesNotMatch(html, /data-agent-review-approve/, `${status} 不该有批准按钮`);
    assert.doesNotMatch(html, /data-agent-review-reject/, `${status} 不该有拒绝按钮`);
  }
});

test("W5-01-CODING-48 a round's proposal from any plugin offers the feedback field, and a Host operation with no round does not", () => {
  const feedback = /data-agent-review-feedback/;
  const documents: AgentReviewRow["request"]["document"][] = [
    row().request.document,
    { kind: "command", command: "npm", args: ["test"], cwd: ".", timeout_ms: 30000, escalate: false },
    { kind: "tool-operation", tool: "dispatch-subagent", summary: "派出一个子任务", fields: [] },
    { kind: "mcp", server: "docs", tool: "search", arguments_json: "{}" },
  ];
  for (const plugin_id of ["io.molis.work.coding", "io.example.reviewer"]) {
    for (const document of documents) {
      const proposal = row();
      proposal.request = { ...proposal.request, plugin_id, kind: document.kind, document };
      assert.match(renderAgentReviewSurface({ rows: [proposal], primitives: p }), feedback, `${plugin_id} ${document.kind}`);
      const settled = row({ receipt: receipt({ status: "rejected" }) });
      settled.request = proposal.request;
      assert.doesNotMatch(renderAgentReviewSurface({ rows: [settled], primitives: p }), feedback, "a decided one offers nothing");
    }
    // A Git or worktree operation a plugin started has no round to return a comment to.
    const hostOperation = row();
    hostOperation.request = { ...hostOperation.request, plugin_id, run: null, kind: "tool-operation",
      operation: { operation_id: "op-1", workspace_id: "main", kind: "git-worktree" },
      document: { kind: "tool-operation", tool: "git-worktree-create", summary: "创建独立工作树", fields: [] } };
    assert.doesNotMatch(renderAgentReviewSurface({ rows: [hostOperation], primitives: p }), feedback, plugin_id);
  }
});

test("待审内容里的标记被转义", () => {
  const nasty = row();
  nasty.request.document = {
    kind: "text-edit",
    target_path: "<script>x</script>.ts",
    exists: false,
    before_text: null,
    after_text: '<img src=x onerror="alert(1)">',
  };
  const html = renderAgentReviewSurface({ rows: [nasty], primitives: p });
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<script>x</script>"), false);
  assert.match(html, /&lt;img src=x/);
});

test("展不开的操作类型照样列出来，不会被悄悄丢掉", () => {
  const unknown = row();
  unknown.request.document = { kind: "rewind" } as never;
  const html = renderAgentReviewSurface({ rows: [unknown], primitives: p });
  assert.match(html, /data-agent-review-kind="rewind"/);
  assert.match(html, /暂不能批准/);
  assert.doesNotMatch(html, /data-agent-review-approve/);
});

test("没有待决定的操作时给出干净的空状态", () => {
  assert.match(renderAgentReviewSurface({ rows: [], primitives: p }), /没有待决定的操作/);
});


test("review renders both file versions and exact command arguments, never only the executable", () => {
  const edit = row();
  const html = renderAgentReviewSurface({ rows: [edit], primitives: p });
  assert.match(html, /修改前/); assert.match(html, /old/); assert.match(html, /new/);
  const command = row();
  command.request.document = { kind: "command", command: "node", args: ["--test", "a b.test.js"], cwd: "src", timeout_ms: 15000 };
  const commandHtml = renderAgentReviewSurface({ rows: [command], primitives: p });
  assert.match(commandHtml, /--test/); assert.match(commandHtml, /a b.test.js/);
  assert.match(commandHtml, /src/); assert.match(commandHtml, /15000/);
  const unknownDelivery = row({ receipt: receipt({ delivery_error: "连接中断" }) });
  const deliveryHtml = renderAgentReviewSurface({ rows: [unknownDelivery], primitives: p });
  assert.match(deliveryHtml, /执行方尚未确认收到/);
  assert.doesNotMatch(deliveryHtml, /尚未发生|执行未完成/);
});

test("PA-29 an after-write check's card names the checker and its configuration version; a card whose note is malformed cannot be approved", () => {
  const check = row();
  check.request.kind = "command";
  check.request.document = { kind: "command", command: "node", args: ["--check", "a.js"], cwd: ".", timeout_ms: 15000,
    after_write_check: { checker_id: "node-check", display_name: "<b>Node</b> 语法", version: 3 } };
  const html = renderAgentReviewSurface({ rows: [check], primitives: p });
  assert.match(html, /<p class="agent-review-meta" data-agent-review-check>写后检查：&lt;b&gt;Node&lt;\/b&gt; 语法（配置 v3）<\/p>/);
  assert.equal(isDecidable(check), true);
  assert.doesNotMatch(renderAgentReviewSurface({ rows: [row()], primitives: p }), /data-agent-review-check/);
  for (const note of [null, { checker_id: "node-check", display_name: "Node 语法", version: "3" }, { checker_id: "node-check", version: 3 }]) {
    const malformed = row();
    malformed.request.kind = "command";
    malformed.request.document = { kind: "command", command: "node", args: ["--check", "a.js"], cwd: ".", timeout_ms: 15000, after_write_check: note } as never;
    assert.equal(isDecidable(malformed), false, JSON.stringify(note));
    const shown = renderAgentReviewSurface({ rows: [malformed], primitives: p });
    assert.match(shown, /审查内容不完整，暂不能批准/);
    assert.doesNotMatch(shown, /data-agent-review-approve|data-agent-review-check/);
  }
});

test("manual rewind shows both full versions, distinguishes empty/deleted files and refuses incomplete previews", () => {
  const item=row();item.request.run=null;item.request.operation={operation_id:'op',session_id:'s',kind:'checkpoint-rewind'};
  item.request.kind='rewind';item.request.document={kind:'rewind',checkpoint_id:'cp',files:[
    {path:'a.ts',change:'restore',before_text:'<old>',after_text:'<new>'},
    {path:'empty',change:'delete',before_text:'',after_text:null},
  ]};
  const html=renderAgentReviewSurface({rows:[item],primitives:p});
  assert.match(html,/&lt;old&gt;/);assert.match(html,/&lt;new&gt;/);assert.match(html,/（空文件）/);assert.match(html,/文件将不存在/);assert.match(html,/不撤销命令/);assert.equal(isDecidable(item),true);
  item.receipt=receipt({effect_uncertain:'执行回执暂不可读'});assert.equal(reviewPhase(item),'reconcile');assert.equal(isDecidable(item),false);
  assert.match(renderAgentReviewSurface({rows:[item],primitives:p}),/执行回执暂不可读/);
  item.receipt=undefined;delete (item.request.document.files[0] as any).before_text;assert.equal(isDecidable(item),false);
});

test('current decisions precede collapsed history without hiding execution failures', () => {
  const done=row({receipt:receipt({effect_settled:true})});done.request.review_id='older';
  const pending=row();pending.request.review_id='action';
  const failed=row({receipt:receipt({effect_error:'changed after preview'})});failed.request.review_id='conflict';
  const html=renderAgentReviewSurface({rows:[done,failed,pending],primitives:p});
  assert.ok(html.indexOf('data-agent-review-item="action"')<html.indexOf('data-agent-review-item="conflict"'));
  assert.ok(html.indexOf('data-agent-review-item="conflict"')<html.indexOf('data-agent-review-item="older"'));
  assert.match(html,/<details data-review-detail="history"><summary>/);assert.doesNotMatch(html,/<details data-review-detail="history" open/);
  assert.match(html,/changed after preview/);
});

test('Git unknown results show a separate recovery entry, and content equality never reads as successful execution', async () => {
  const { renderAgentReviewRecovery } = await import('@molis-ai/molis-work-app-workbench');
  const item = row({ receipt: receipt({ effect_uncertain: '回执不可读' }) });
  item.request.kind = 'git-index'; item.request.run = null;
  item.request.operation = { kind: 'git-index', operation_id: 'op', workspace_id: 'w' };
  item.request.document = { kind: 'git-index', action: 'stage', workspace_name: 'workspace', files: [{ path: 'note', before_text: 'before', after_text: 'after', before_mode: '100644', after_mode: '100644' }] };
  const html = renderAgentReviewSurface({ rows: [item], primitives: p });
  assert.match(html, /data-agent-review-inspect/); assert.doesNotMatch(html, /data-agent-review-approve/);
  const recovery = renderAgentReviewRecovery({ review_id: 'r1', receipt: item.receipt!, observation: { revision: 'v1', observed_at: 'now', matches_before: false, matches_after: true, files: [{ path: '<note>', text: '<img src=x>', mode: '100644' }] }, can_confirm_not_happened: false, message: '仍需原执行回执' }, p.escape);
  assert.match(recovery, /data-review-confirm-not disabled/); assert.match(recovery, /&lt;img src=x&gt;/); assert.doesNotMatch(recovery, /<img src=x>/);
  item.receipt = receipt({ effect_error: '原操作未发生', reconciliation: { actor_id: 'user', at: '2026-09-22', reason: '<evidence>' } });
  const settled = renderAgentReviewSurface({ rows: [item], primitives: p });
  assert.match(settled, /已核对：原操作未发生/); assert.match(settled, /&lt;evidence&gt;/); assert.doesNotMatch(settled, /data-agent-review-inspect|已完成/);
});

test("a text edit reads as a unified diff with context and counts; a command reads as one shell line", () => {
  const edit = row();
  const before = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
  const after = before.replace("line 10\n", "line ten\n").replace("line 18\n", "");
  edit.request.document = { kind: "text-edit", target_path: "src/app.ts", exists: true, before_text: before, after_text: after };
  const html = renderAgentReviewSurface({ rows: [edit], primitives: p });
  assert.match(html, /<span class="agent-review-count" data-added>\+1<\/span><span class="agent-review-count" data-removed>−2<\/span>/);
  assert.match(html, /<tr data-diff="delete"><td class="agent-review-ln">10<\/td><td class="agent-review-ln"><\/td>/);
  assert.match(html, /<tr data-diff="insert"><td class="agent-review-ln"><\/td><td class="agent-review-ln">10<\/td>/);
  assert.match(html, /⋯ 6 行未变/, "unchanged lines far from a change collapse into one gap row");
  assert.doesNotMatch(html, />line 1<\/td>/, "context is limited to three lines around each change");
  const command = row();
  command.request.document = { kind: "command", command: "node", args: ["--test", "a b.test.js", "it's"], cwd: ".", timeout_ms: 15000 };
  const commandHtml = renderAgentReviewSurface({ rows: [command], primitives: p });
  assert.match(commandHtml, /\$<\/span> node --test (&#39;|')a b\.test\.js(&#39;|') (&#39;|')it(&#39;|')\\(&#39;|')(&#39;|')s(&#39;|')</);
  assert.match(commandHtml, /在 工作区根目录 运行/);
});

test("only an in-boundary command offers 'allow for this session', and a rule's approval says so", () => {
  const inside = row();
  inside.request.kind = "command";
  inside.request.document = { kind: "command", command: "npm", args: ["test"], cwd: ".", timeout_ms: 30000, escalate: false };
  assert.match(renderAgentReviewSurface({ rows: [inside], primitives: p }), /data-agent-review-remember/);
  const outside = row();
  outside.request.kind = "command";
  outside.request.document = { kind: "command", command: "npm", args: ["publish"], cwd: ".", timeout_ms: 30000, escalate: true };
  assert.doesNotMatch(renderAgentReviewSurface({ rows: [outside], primitives: p }), /data-agent-review-remember/);
  assert.doesNotMatch(renderAgentReviewSurface({ rows: [row()], primitives: p }), /data-agent-review-remember/, "a file edit is always read");
  const ruled = row({ receipt: receipt({ status: "approved", effect_settled: true, decided_by: "alice", standing_rule: { set_by: "alice", set_at: "2026-09-24T00:00:00.000Z" } }) });
  ruled.request.kind = "command";
  ruled.request.document = inside.request.document;
  assert.match(renderAgentReviewSurface({ rows: [ruled], primitives: p }), /按本会话规则批准 · alice 设定于/);
});

test("a command that names extra paths or the network shows exactly what it asks for and offers no session rule", () => {
  const widened = row();
  widened.request.kind = "command";
  widened.request.document = { kind: "command", command: "npm", args: ["install"], cwd: ".", timeout_ms: 30000, escalate: false,
    grants: { paths: [{ path: "/Users/me/.npmrc", access: "read" }, { path: "/tmp/cache", access: "write" }], network: true } };
  const html = renderAgentReviewSurface({ rows: [widened], primitives: p });
  assert.match(html, /data-agent-review-grants/);
  assert.match(html, /读取<\/span> <code>\/Users\/me\/\.npmrc<\/code>/);
  assert.match(html, /读写<\/span> <code>\/tmp\/cache<\/code>/);
  assert.match(html, /联网/);
  assert.match(html, /超出宿主执行边界/);
  assert.doesNotMatch(html, /在宿主执行边界内/, "it does not say it stays inside the boundary");
  assert.doesNotMatch(html, /data-agent-review-remember/, "the extra access is never remembered");
});

test("命令里混有像工具调用标记的文本时，审查卡提醒一句；正常命令不提醒", () => {
  assert.equal(leakedMarkup(`node -e 'console.log(1);</argml:arbgt></item>'`), true, "the MiniMax leak seen in a real round");
  assert.equal(leakedMarkup("run </invoke> now"), true);
  for (const clean of ["npm test", "node --version", "git log --oneline -3", "echo 'a < b > c'", "grep -n '<div' src/a.html"]) assert.equal(leakedMarkup(clean), false, clean);
});

// RING-07: decisions and effects have separate, explicit states.
test("RING-07 review rings distinguish approval, pending effect, success, failure and uncertain result", () => {
  const cases: Array<[AgentReviewRow, string]> = [
    [row(), "approval"], [row({ receipt: receipt() }), "waiting"],
    [row({ receipt: receipt({ effect_settled: true }) }), "done"],
    [row({ receipt: receipt({ effect_error: "磁盘只读" }) }), "failed"],
    [row({ receipt: receipt({ effect_uncertain: "回执不可读" }) }), "verify"],
    [row({ receipt: receipt({ status: "rejected" }) }), "cancelled"],
    [row({ receipt: receipt({ status: "cancelled" }) }), "cancelled"],
    [row({ receipt: receipt({ status: "expired" }) }), "stale"],
  ];
  for (const [item, state] of cases) {
    const html = renderAgentReviewSurface({ rows: [item], primitives: p });
    assert.match(html, new RegExp(`data-mw-state="${state}"`));
    assert.match(html, /data-ring-segments/);
    assert.doesNotMatch(html, /data-icon="(?:clock|circle-alert|check|x|alert)"/);
  }
});

test("BL-360: current decisions hide approval after revocation and both choices without an owner", () => {
  const denied = { available: false as const, code: "agent.review_not_permitted", reason: { owner: "workbench", key: "workbench.agent-review.authority-ended" } };
  const onlyReject = row({ decisions: { approve: denied, reject: { available: true } } });
  const html = renderAgentReviewSurface({ rows: [onlyReject], primitives: p });
  assert.doesNotMatch(html, /data-agent-review-approve|data-agent-review-remember/);
  assert.match(html, /data-agent-review-reject="r1"/); assert.match(html, /原授权已经失效/);
  const neither = row({ decisions: { approve: denied, reject: denied } });
  assert.equal(isDecidable(neither), false);
  assert.doesNotMatch(renderAgentReviewSurface({ rows: [neither], primitives: p }), /data-agent-review-approve|data-agent-review-reject/);
});

// A4-2 (docs/design/coding-daily-basics scheme A): the file card shows the check before review under its title; new errors make
// handing them back the first choice, with the errors as the reason; formatting can be compared with the text as written; a check
// that did not run says so with its cause, never as no errors.
test("A4-2: the file card's check line, the fix-first refusal and the text as written", () => {
  const withChecks = (checks: object) => row({ request: { ...row().request, document: { ...row().request.document, after_text: "new\n", checks } as never } });
  const errors = renderAgentReviewSurface({ rows: [withChecks({
    diagnostics: { state: "errors", source: "tsc", errors: [{ code: "TS2322", line: 18, text: "string 不能赋给 number" }], more: 1 },
    formatting: { state: "formatted", source: "tsc", lines: 2, as_written: "new  \n" },
  })], primitives: p });
  assert.match(errors, /data-agent-review-checks/);
  assert.match(errors, /2 个新错误/, "the count includes the ones not listed");
  assert.match(errors, /TS2322<\/b><span>第 18 行 · string 不能赋给 number/);
  assert.match(errors, /已格式化 · 2 处/);
  assert.match(errors, /class="mw-btn mw-btn--primary" type="button" data-agent-review-reject="r1" data-agent-review-note="写入前的检查发现 2 个新错误，先修好再写这个文件：\napps\/local-host\/src\/connect.ts:18 TS2322 string 不能赋给 number" data-agent-review-fix>先让它修好/);
  assert.match(errors, /class="mw-btn" type="button" data-agent-review-approve="r1"/, "writing as it is stays possible, no longer primary");
  assert.match(errors, /data-review-detail="as-written"><summary>看格式化前/);
  const unchecked = renderAgentReviewSurface({ rows: [withChecks({ diagnostics: { state: "unchecked", cause: "missing", reason: "gopls is not on this machine" }, formatting: { state: "unavailable", cause: "missing", reason: "x" } })], primitives: p });
  assert.match(unchecked, /这次没查错误：检查工具不在这台电脑上/);
  assert.doesNotMatch(unchecked, /没有新错误|data-agent-review-fix|as-written/);
  assert.match(unchecked, /mw-btn mw-btn--primary" type="button" data-agent-review-approve/, "nothing to fix: approving stays first");
  const none = renderAgentReviewSurface({ rows: [row()], primitives: p });
  assert.doesNotMatch(none, /data-agent-review-checks/, "a card the check did not see has no line");
});
