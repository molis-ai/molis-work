import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { coding, openCoding } from "./fixtures/coding-browser.js";
import { CODING_COMPOSER, codingAdd } from "./fixtures/coding-composer.js";
import { shouldSaveReviewScreenshots } from "./fixtures/review-evidence.js";

// Screen polish, first round, P4 (specs/screen-polish/p4-coding.md; both halves): the Coding page as a person meets it, in the
// project's running instance. The session and its workspace are real; the one round on show is given to the page as the
// service would answer it (a round needs a model), with its change set.

const LONG_TITLE = "把导出改成按周汇总并补上回归用例再整理发布说明";
const RUN = "run-polish";

test("POLISH-23 POLISH-24 POLISH-26 POLISH-27: 目录列让名字说话，准备信息收成一行，回合结束一行，结果面板先说改了什么", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, current, click, afterAStateRead, homeDirectory } = opened;
  const workspace = homeDirectory + "/coding-first-read";
  const first = await start("把导出改成按周汇总");
  // 「新会话」 reuses a session that holds nothing: the first one's words are saved before the second is made.
  await waitFor(`patches.some(one=>one.path.endsWith('/sessions/'+${JSON.stringify(encodeURIComponent(first))})&&JSON.parse(one.body).draft===${JSON.stringify("把导出改成按周汇总")})`, 20_000);
  const run = {
    ref: { run_id: RUN }, phase: "completed", started_at: "2026-11-18T10:00:00.000Z", ended_at: "2026-11-18T10:00:12.000Z",
    turns: [
      { turn_id: "t1", kind: "user", text: "把导出改成按周汇总", sequence: 1 },
      { turn_id: "t2", kind: "assistant", text: "已经改成按周汇总。", html: "<p>已经改成按周汇总。</p>", sequence: 2 },
    ],
    activity: [
      { call_id: "c1", name: "edit", target: "src/export.ts", state: "completed" },
      { call_id: "c2", name: "write", target: "src/week.ts", state: "completed" },
    ],
    frozen: {
      model_id: "fixture-model", role_id: "writer", role_version: 1, skills: [], directory: { canonical_path: workspace },
      action_tools: [{ capability_id: "knowledge.read", version: 1, provider_id: "io.molis.work.knowledge" }],
      text_materials: [{ material_id: "m1", title: "spec.md", delivery: "inline" }, { material_id: "m2", title: "notes.md", delivery: "inline" }],
    },
    usage: { tokens: { input: 1200, output: 300 } },
  };
  const written = (path: string, kind: string, added: number, removed: number) => ({ path, kind, added_lines: added, removed_lines: removed, review: { decision: "approved", execution: "applied" } });
  // The first session answers with the round above; it is named at length, in the page's state and in its own read alike (a
  // read that named it otherwise would look like a rename, and the host answers a rename by selecting the session again, which
  // closes the results panel); its changes are a fixed set.
  await evaluate(`(()=>{const real=window.fetch,id=${JSON.stringify(encodeURIComponent(first))};window.changeReads=0;
    window.changeReadPaths=[];
    window.fetch=async(input,init)=>{const path=String(input?.url||input),get=(init?.method||'GET')==='GET';
      if(get&&path.includes('/runs/${RUN}/changeset')){changeReads++;changeReadPaths.push(path.slice(path.indexOf('/changeset')));}
      const answer=async change=>{const res=await real(input,init);if(!res.ok)return res;const data=await res.json();change(data);return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});};
      if(get&&path.includes('/sessions/'+id+'?'))return answer(data=>{data.runs=[${JSON.stringify(run)}];if(data.session)data.session.title=${JSON.stringify(LONG_TITLE)};});
      if(get&&/\\/state(\\?|$)/.test(path))return answer(data=>{for(const session of data.sessions||[])if(session.session_id===${JSON.stringify(first)})session.title=${JSON.stringify(LONG_TITLE)};});
      return real(input,init);};
    fakes.push({method:'GET',path:'/runs/${RUN}/changeset',body:${JSON.stringify({
      html: "", change: { files: [written("src/export.ts", "modified", 20, 6), written("src/week.ts", "added", 4, 0)] },
      reference: { artifact_id: "artifact-fixed", version: 1 }, saved_at: "2026-11-18T10:00:12.000Z", view_mode: "write", net_groups: [], output: null,
      // What the counts-only read answers (`?stats=1`); the reader's own read of the same round takes the rest.
      stats: { added_lines: 24, removed_lines: 6, files: [{ path: "src/export.ts", added_lines: 20, removed_lines: 6 }, { path: "src/week.ts", added_lines: 4, removed_lines: 0 }] },
    })}});})()`);

  // 6.2: a second session has no round yet. Its welcome says the environment is ready in one line; nothing is amber.
  await start("另一个任务");
  await waitFor(`![${JSON.stringify(first)}, undefined].includes(document.querySelector('${coding} [data-coding-session][aria-current=true]')?.dataset.codingSession)`, 20_000);
  const second = await current();
  assert.notEqual(second, first);
  await waitFor(`!!document.querySelector('${coding} [data-coding-turns] > [data-coding-prep]')`, 20_000);
  const welcome = await evaluate<{ open: boolean; height: number; text: string; attention: string; cards: number; kinds: string[] }>(`(()=>{
    const fold=document.querySelector('${coding} [data-coding-turns] > [data-coding-prep]');
    return {open:fold.open,height:fold.getBoundingClientRect().height,text:fold.querySelector('.coding-prep-text').textContent,attention:fold.dataset.attention,
      cards:fold.querySelectorAll('[data-coding-env-checklist] .mw-rec-list').length,kinds:[...document.querySelectorAll('${coding} .coding-starter small')].map(node=>getComputedStyle(node).color)};})()`);
  assert.equal(welcome.open, false, "POLISH-24 全部就绪时收成一行");
  assert.ok(welcome.height <= 36, `POLISH-24 这一行只占一行的高度：${welcome.height}`);
  assert.match(welcome.text, /^环境就绪 · coding-first-read/, "这一行说出就绪和所在目录");
  assert.equal(welcome.attention, "false", "POLISH-26 没有要处理的事就不上琥珀");
  assert.equal(welcome.cards, 1, "清单还在这一行里面，点开就看得到");
  assert.equal(new Set(welcome.kinds).size, 1, "建议卡的模式标签是同一种灰");

  // 6.1: the directory column at 240px. The name has the line; a state that asks nothing is its ring alone.
  await evaluate(`(()=>{const style=document.createElement('style');style.textContent='.coding-layout{grid-template-columns:240px minmax(0,1fr) !important}';document.head.append(style);})()`);
  await afterAStateRead();
  await waitFor(`document.querySelector('${coding} [data-coding-session="${first}"] .coding-session-title')?.textContent === ${JSON.stringify(LONG_TITLE)}`, 20_000);
  const row = await evaluate<{ column: number; chars: number; quiet: string; word: boolean; chip: number; ring: boolean; title: string; adds: number; archivedBelow: boolean; faces: string[] }>(`(()=>{
    const root=document.querySelector('${coding}'),link=root.querySelector('[data-coding-session="${first}"]'),name=link.querySelector('.coding-session-title'),mark=link.querySelector('.coding-session-state');
    const list=root.querySelector('[data-coding-sessions]').getBoundingClientRect(),archived=root.querySelector('[data-coding-archived]').getBoundingClientRect();
    return {column:root.querySelector('.coding-directory').getBoundingClientRect().width,chars:name.getBoundingClientRect().width/parseFloat(getComputedStyle(name).fontSize),
      quiet:mark.dataset.quiet,word:mark.hasAttribute('data-word'),chip:mark.getBoundingClientRect().width,ring:!!mark.querySelector(':scope > svg.mw-state-ring'),title:mark.title,
      adds:[...root.querySelectorAll('.coding-directory [data-coding-new]')].filter(node=>node.getBoundingClientRect().width>0).length,archivedBelow:archived.width>0&&archived.top>=list.bottom-1,
      faces:[...root.querySelectorAll('.coding-face')].filter(face=>face.querySelector('.coding-face-name').getBoundingClientRect().width>0).map(face=>face.dataset.codingFace)};})()`);
  assert.equal(Math.round(row.column), 240);
  assert.ok(row.chars >= 10, `POLISH-23 240px 的目录列里会话名至少显示十个字：${row.chars.toFixed(1)}`);
  assert.deepEqual([row.quiet, row.word], ["true", false], "POLISH-23 常态不显示状态词");
  assert.ok(row.ring && row.chip <= 24 && row.title, `状态只剩一个点，词在提示里：${row.chip}`);
  assert.equal(row.adds, 1, "目录列只有列头一个新建");
  assert.ok(row.archivedBelow, "「已归档」在列底");
  assert.deepEqual(row.faces, ["sessions"], "图标页签只有当前项带名字");

  // 6.3: the first session's round. What it was prepared with is one line above the answer; the round's end is one line.
  await click(`${coding} [data-coding-session="${first}"]`);
  await waitFor(`!!document.querySelector('${coding} [data-run="${RUN}"] .coding-run-card .coding-change-counts')`, 30_000);
  const round = await evaluate<{ prepOpen: boolean; prepHeight: number; prepText: string; attention: string; answerSeen: boolean; prepAbove: boolean; card: number; head: string; primary: string[]; more: boolean; whole: number;
    count: string; meter: boolean; note: boolean }>(`(()=>{
    const root=document.querySelector('${coding}'),block=root.querySelector('[data-run="${RUN}"]'),fold=block.querySelector(':scope > [data-coding-prep]'),answer=block.querySelector('.coding-turn[data-kind=assistant]');
    const turns=root.querySelector('[data-coding-turns]').getBoundingClientRect(),at=answer.getBoundingClientRect(),card=block.querySelector('.coding-run-card'),head=card.querySelector('header');
    return {prepOpen:fold.open,prepHeight:fold.getBoundingClientRect().height,prepText:fold.querySelector('.coding-prep-text').textContent,attention:fold.dataset.attention,
      answerSeen:at.top>=turns.top-1&&at.top<turns.bottom,prepAbove:fold.getBoundingClientRect().bottom<=at.top+1,card:head.getBoundingClientRect().height,head:head.textContent.replace(/\\s+/g,' ').trim(),
      primary:[...card.querySelectorAll('.mw-btn--primary')].map(node=>node.textContent.trim()),more:card.querySelector('.coding-run-more').hidden&&card.querySelector('[data-coding-run-more]').getAttribute('aria-expanded')==='false',whole:card.getBoundingClientRect().height,
      count:root.querySelector('[data-coding-results-count]').hidden?'':root.querySelector('[data-coding-results-count]').textContent,
      meter:root.querySelector('[data-coding-meter]').hidden,note:root.querySelector('[data-coding-model-note]').hidden};})()`);
  assert.equal(round.prepOpen, false, "POLISH-24 回答出来以后准备信息收起");
  assert.ok(round.prepHeight <= 36, `POLISH-24 回答上方的准备信息只占一行：${round.prepHeight}`);
  assert.match(round.prepText, /^准备 · 目录、2 份材料$/, "这一行说出准备了什么");
  assert.equal(round.attention, "false", "POLISH-26 没有要处理的事就不上琥珀");
  assert.ok(round.prepAbove && round.answerSeen, "POLISH-24 回答在首屏可见，准备信息在它上面");
  assert.ok(round.card <= 40 && round.whole <= 52, `回合结束卡是一行：卡头 ${round.card}，整张 ${round.whole}`);
  assert.match(round.head, /本轮结束.*12 秒 · 修改 2 个文件 \+24−6/, "这一行写出改了几个文件和增减行");
  assert.deepEqual(round.primary, ["看改动"], "主操作是「看改动」");
  assert.ok(round.more, "文件清单收在卡头末尾的「明细」里");
  assert.equal(round.count, "2", "「结果与审查」带上改动的文件数");
  assert.ok(round.meter && round.note, "POLISH-26 用量条和「本轮：模型」平时不显示");
  // The chevron opens the round's details under its line, and a later draw of the round leaves them open.
  await click(`${coding} [data-run="${RUN}"] [data-coding-run-more]`);
  await afterAStateRead();
  const laidOpen = await evaluate<{ shown: boolean; expanded: string | null; files: number }>(`(()=>{const card=document.querySelector('${coding} [data-run="${RUN}"] .coding-run-card'),more=card.querySelector('.coding-run-more');
    return {shown:!more.hidden&&more.getBoundingClientRect().height>0,expanded:card.querySelector('[data-coding-run-more]').getAttribute('aria-expanded'),files:more.querySelectorAll('.coding-run-files li').length};})()`);
  assert.deepEqual(laidOpen, { shown: true, expanded: "true", files: 2 }, "点开以后明细留在卡头下面");

  // 6.4: 「标为优先」 is in the header's ⋯ menu; Escape closes it.
  const more = `document.querySelector('${coding} [data-coding-head-more]')`;
  assert.equal(await evaluate<boolean>(`${more}.hidden`), false);
  await click(`${coding} [data-coding-head-more] > summary`);
  await waitFor(`${more}.open`);
  assert.equal(await evaluate<string>(`${more}.querySelector('[data-coding-priority]').textContent.trim()`), "标为优先");
  await evaluate(`${more}.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
  assert.equal(await evaluate<boolean>(`${more}.open`), false, "Escape 收起菜单");
  const head = await evaluate<{ where: string; full: string; title: number; outlined: string[] }>(`(()=>{const root=document.querySelector('${coding}'),label=root.querySelector('[data-coding-workspace-label]');
    const lined=node=>parseFloat(getComputedStyle(node).borderTopWidth)>0&&getComputedStyle(node).borderTopColor!=='rgba(0, 0, 0, 0)';
    return {where:label.textContent.trim(),full:label.title,title:root.querySelector('[data-coding-title]').getBoundingClientRect().height,
      outlined:[...root.querySelectorAll('.coding-head-actions :is(button,summary)')].filter(node=>node.getBoundingClientRect().width>0&&lined(node)).map(node=>node.textContent.trim().replace(/\\d+$/,''))};})()`);
  assert.equal(head.where, "coding-first-read", "头部只写目录名（不是仓库就没有分支）");
  assert.ok(head.full.endsWith("/coding-first-read") && head.full.startsWith("/"), "完整路径在提示里");
  assert.ok(head.title <= 28, `标题单行：${head.title}`);
  assert.deepEqual(head.outlined, ["结果与审查"], "头部只有「结果与审查」一个描边键");

  // 6.5: the results panel. What changed comes first; paths and capability ids are folded at the foot.
  await click(`${coding} [data-coding-results-open]`);
  await waitFor(`document.querySelector('${coding}').dataset.codingResults === 'true' && document.querySelectorAll('${coding} [data-coding-results-jump]').length > 1`, 20_000);
  const results = await evaluate<{ first: string; files: string[]; chips: string[]; current: string[]; group: boolean; details: boolean; seen: string; folded: string }>(`(()=>{
    const root=document.querySelector('${coding}'),tools=root.querySelector('[data-coding-tools]'),box=tools.getBoundingClientRect();
    const shown=[...tools.children].filter(node=>!node.hidden&&node.matches('.coding-result,[data-coding-change-reader]')&&node.getBoundingClientRect().height>0);
    const firstScreen=[...tools.querySelectorAll('*')].filter(node=>node.children.length===0&&node.checkVisibility()&&node.getBoundingClientRect().height>0&&node.getBoundingClientRect().top<box.bottom).map(node=>node.textContent).join(' ');
    return {first:shown[0]?.getAttribute('aria-labelledby')||shown[0]?.getAttribute('aria-label')||'',
      files:[...tools.querySelectorAll('.coding-changed-file')].map(node=>node.textContent.replace(/\\s+/g,' ').trim()),
      chips:[...tools.querySelectorAll('[data-coding-results-jump]')].map(node=>node.textContent),current:[...tools.querySelectorAll('[data-coding-results-jump].is-current')].map(node=>node.textContent),
      group:tools.querySelector('[data-coding-results-index]').classList.contains('mw-toggle-group'),details:tools.querySelector('[data-coding-run-details]').open,seen:firstScreen,
      folded:tools.querySelector('[data-coding-run-details]').textContent};})()`);
  assert.equal(results.first, "coding-changed-title", "POLISH-27 结果与审查先说改了什么");
  assert.deepEqual(results.files, ["src/export.ts+20−6", "src/week.ts+4−0"], "每个文件带自己的增减行");
  assert.ok(results.group && results.chips[0] === "改了什么" && results.chips.at(-1) === "运行详情", `分区页签是分段控件，顺序从「改了什么」到「运行详情」：${results.chips.join(" / ")}`);
  assert.deepEqual(results.current, ["改了什么"]);
  assert.ok(results.chips.every(text => !/[A-Za-z]{4,}/.test(text)), "POLISH-27 分区没有未翻译的英文标题");
  assert.equal(results.details, false, "运行详情默认收起");
  const leaked = [workspace, "knowledge.read"].filter(text => results.seen.includes(text)).map(text => results.seen.slice(Math.max(0, results.seen.indexOf(text) - 40), results.seen.indexOf(text) + text.length + 10));
  assert.deepEqual(leaked, [], "POLISH-27 绝对路径和能力编号不在首屏");
  assert.ok(results.folded.includes("coding-first-read"), "它们还在「运行详情」里，点开就看得到");
  assert.deepEqual(await evaluate<string[]>("changeReadPaths"), ["/changeset?stats=1"], "增减行只读一次这一轮的变更，读的是只带行数的那一种；重画和打开面板都不再读");
  // UIV-19: even with the 320px results panel open, the dialogue reading column aligns with --mw-bar-left (within 1px).
  const align = await evaluate<{ barLeft: number; turnLeft: number }>(`(()=>{
    const root=document.querySelector('${coding}'), barLeft=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mw-bar-left'));
    const turnLeft=root.querySelector('[data-run="${RUN}"] .coding-turn[data-kind=assistant]').getBoundingClientRect().left;
    return { barLeft: Math.round(barLeft), turnLeft: Math.round(turnLeft) };
  })()`);
  assert.ok(Number.isFinite(align.barLeft) && Math.abs(align.turnLeft - align.barLeft) <= 1, `UIV-19 结果面板打开时对话正文左缘仍对齐底部输入框（${JSON.stringify(align)}）`);
  // Clicking the second changed file in 「改了什么」 opens that specific file in the diff reader, not always file 0.
  await click(`${coding} .coding-changed-file[data-coding-change-path="src/week.ts"]`);
  await waitFor(`document.querySelector('${coding} [data-coding-change-body]')?.dataset.codePath === 'src/week.ts'`, 15_000);
  await click(`${coding} [data-coding-change-close]`);
  await waitFor(`document.querySelector('${coding} [data-coding-change-reader]').hidden`, 10_000);

  // 6.6: the task graph. The view switch is the way back; nothing planned yet is the shared empty state.
  await click(`${coding} [data-coding-results-close]`);
  await click(`${coding} [data-coding-view=board]`);
  await waitFor(`!!document.querySelector('${coding} [data-coding-board] .mw-empty')`, 20_000);
  const board = await evaluate<{ title: string; empty: string; body: string; back: boolean; columns: string; note: string }>(`(()=>{const board=document.querySelector('${coding} [data-coding-board]'),empty=board.querySelector('.mw-empty');
    return {title:board.querySelector('[data-coding-board-title]').textContent,empty:empty.querySelector('h2').textContent,body:empty.querySelector('p').textContent,back:!!board.querySelector('[data-coding-board-close]'),
      columns:getComputedStyle(board.querySelector('.coding-board-columns')).display,note:board.querySelector('[data-coding-board-status]').textContent};})()`);
  assert.equal(board.title, "任务板", "POLISH-27 任务图的标题不是英文原文");
  assert.deepEqual([board.empty, board.note], ["还没有任务", ""], "空状态是一块，不再是表格下面的一行小字");
  assert.ok(board.body.length <= 28, `空状态的说明不超过 28 个字：${board.body.length}`);
  assert.equal(board.back, false, "不再有和分段控件重复的「回到对话」");
  assert.equal(board.columns, "none", "没有任务时不摆表头");
  await click(`${coding} [data-coding-view=dialogue]`);
  await waitFor(`document.querySelector('${coding} [data-coding-board]').hidden`);
});

test("POLISH-26: 环境有要处理的事时准备行展开并上琥珀；人收起后同一件事不再自动打开；处理完收回一行，新的事再打开", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, click, afterAStateRead } = opened;
  await start("先看看环境");
  // The environment is what the page's state read says. The test turns one row on and off in that answer: the folder
  // names a package manager and its dependencies are not installed, which waits on the person.
  await evaluate(`(()=>{const real=window.fetch;window.envAsks=false;
    window.fetch=async(input,init)=>{const path=String(input?.url||input);
      if((init?.method||'GET')!=='GET'||!/\\/state(\\?|$)/.test(path))return real(input,init);
      const res=await real(input,init);if(!res.ok)return res;const data=await res.json();
      if(window.envAsks&&data.environment_readiness)Object.assign(data.environment_readiness,{status:'attention',deps_manager:'pnpm',deps_installed:false});
      return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});};})()`);
  const fold = `document.querySelector('${coding} [data-coding-turns] > [data-coding-prep]')`;
  // `tall`: the fold takes more than its one line, so the checklist under it is on show (it opens to its natural height).
  const look = () => evaluate<{ open: boolean; attention: string; text: string; wash: string; tall: boolean; chevron: number }>(`(()=>{const fold=${fold},line=fold.querySelector(':scope > summary');
    return {open:fold.open,attention:fold.dataset.attention,text:fold.querySelector('.coding-prep-text').textContent,wash:getComputedStyle(line).backgroundColor,
      tall:fold.getBoundingClientRect().height>line.getBoundingClientRect().height+40,chevron:line.querySelector(':scope > svg:last-child')?.getBoundingClientRect().width??0};})()`);
  await waitFor(`!!${fold}`, 20_000);
  const calm = await look();
  assert.deepEqual([calm.open, calm.attention, calm.tall], [false, "false", false], "没有要处理的事：一行，不上琥珀");
  assert.equal(calm.chevron, 12, "折叠行的箭头和别处的折叠一样是 12px");

  await evaluate("window.envAsks=true");
  await waitFor(`${fold}?.dataset.attention==='true'`, 20_000);
  await waitFor(`${fold}.getBoundingClientRect().height>${fold}.querySelector(':scope > summary').getBoundingClientRect().height+40`, 10_000);
  const asking = await look();
  assert.equal(asking.open, true, "POLISH-26 有要处理的事就展开");
  assert.equal(asking.tall, true, "要处理的那一行就在下面");
  assert.match(asking.text, /^本轮环境准备 · 1 项待处理$/, "这一行说出有几项要处理");
  assert.notEqual(asking.wash, calm.wash, "POLISH-26 这一行上琥珀");

  // The person closes it. The same thing still waiting does not open it again, read after read; the line stays amber.
  await click(`${coding} [data-coding-turns] > [data-coding-prep] > summary`);
  await waitFor(`!${fold}.open`);
  await new Promise(resolve => setTimeout(resolve, 400));
  await afterAStateRead();
  await afterAStateRead();
  const closed = await look();
  assert.deepEqual([closed.open, closed.attention, closed.wash], [false, "true", asking.wash], "人收起以后，同一件事不再自动打开；琥珀还在");

  // Handled: the line is the quiet one again, and stays as the person left it.
  await evaluate("window.envAsks=false");
  await waitFor(`${fold}?.dataset.attention==='false'`, 20_000);
  const done = await look();
  assert.deepEqual([done.open, done.wash], [false, calm.wash], "处理完收回一行，琥珀退掉");
  assert.match(done.text, /^环境就绪/);

  // Something to handle again is news: it opens once more.
  await evaluate("window.envAsks=true");
  await waitFor(`${fold}?.dataset.attention==='true'&&${fold}.open`, 20_000);
});

test("POLISH-25 POLISH-28: 对话阅读列在 1440 不窄于 720 且左缘仍对齐输入框；输入框底行最多四个控件，模型与规则在「本轮设置」里", { timeout: 240_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, start, afterAStateRead, owner, command, sessionId, homeDirectory } = opened;
  const first = await start("把导出改成按周汇总");
  const long = "已经改成按周汇总。导出的每一行现在是一周的合计，周一为一周的开始；跨年的那一周按周一所在的年份归档，和报表页的口径一致。原来按天导出的入口还在，只是默认值换了。";
  const run = {
    ref: { run_id: RUN }, phase: "completed", started_at: "2026-11-18T10:00:00.000Z", ended_at: "2026-11-18T10:00:12.000Z",
    turns: [{ turn_id: "t1", kind: "user", text: "把导出改成按周汇总", sequence: 1 }, { turn_id: "t2", kind: "assistant", text: long, html: `<p>${long}</p>`, sequence: 2 }],
    activity: [{ call_id: "c1", name: "edit", target: "src/export.ts", state: "completed" }, { call_id: "c2", name: "write", target: "src/week.ts", state: "completed" }],
    frozen: { model_id: "fixture-model", role_id: "writer", role_version: 1, skills: [], directory: { canonical_path: homeDirectory + "/coding-first-read" }, action_tools: [], text_materials: [] },
    usage: { tokens: { input: 1200, output: 300 } },
  };
  await evaluate(`(()=>{const real=window.fetch,id=${JSON.stringify(encodeURIComponent(first))};
    window.fetch=async(input,init)=>{const path=String(input?.url||input);
      if((init?.method||'GET')!=='GET'||!path.includes('/sessions/'+id+'?'))return real(input,init);
      const res=await real(input,init);if(!res.ok)return res;const data=await res.json();data.runs=[${JSON.stringify(run)}];
      return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});};
    fakes.push({method:'GET',path:'/runs/${RUN}/changeset',body:${JSON.stringify({ stats: { added_lines: 24, removed_lines: 6, files: [{ path: "src/export.ts", added_lines: 20, removed_lines: 6 }, { path: "src/week.ts", added_lines: 4, removed_lines: 0 }] } })}});})()`);
  await afterAStateRead();
  await evaluate(`document.querySelector('${coding} [data-coding-session="${first}"]').click()`);
  await waitFor(`!!document.querySelector('${coding} [data-run="${RUN}"] .coding-run-card .coding-change-counts')`, 40_000);

  // 6.3 (POLISH-25): the reading column. `column` is the answer's own box; `bar` is the workbench input's left edge and width as the frame is told them.
  const column = () => evaluate<{ left: number; width: number; barLeft: number; bar: number; room: number; card: number; line: number; prose: number }>(`(()=>{
    const root=document.querySelector('${coding}'),block=root.querySelector('[data-run="${RUN}"]'),turn=block.querySelector('.coding-turn[data-kind=assistant]').getBoundingClientRect(),told=getComputedStyle(document.documentElement);
    const card=block.querySelector('.coding-run-card'),dialogue=root.querySelector('.coding-dialogue').getBoundingClientRect();
    return {left:Math.round(turn.left),width:Math.round(turn.width),barLeft:Math.round(parseFloat(told.getPropertyValue('--mw-bar-left'))),bar:Math.round(parseFloat(told.getPropertyValue('--mw-bar-column'))),
      room:Math.round(dialogue.right-turn.left-12),card:Math.round(card.getBoundingClientRect().height),line:Math.round(card.querySelector('header').getBoundingClientRect().height),
      prose:Math.round(block.querySelector('.coding-turn[data-kind=assistant] p').getBoundingClientRect().width)};})()`);
  const at = async (width: number, height: number) => {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    // The frame hears the bar's new place after the window settles: wait for the column to be laid from it.
    await waitFor(`(()=>{const told=getComputedStyle(document.documentElement),turn=document.querySelector('${coding} [data-run="${RUN}"] .coding-turn[data-kind=assistant]').getBoundingClientRect();
      return innerWidth<=${width}&&innerWidth>${width}-80&&Math.abs(turn.left-parseFloat(told.getPropertyValue('--mw-bar-left')))<=1;})()`, 20_000);
    return column();
  };
  /** A review screenshot of the whole window (opt-in), for the walk-through of 36A-4b. */
  const look = async (name: string) => {
    if (!shouldSaveReviewScreenshots()) return;
    const directory = join(process.cwd(), ".impeccable/qa/review/screen-polish/p4b/after"); await mkdir(directory, { recursive: true });
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  const wide = await at(1440, 900);
  await look("zh-light-1440");
  assert.ok(wide.bar < 720, `1440 宽时底部输入框本身不到 720：${wide.bar}`);
  assert.ok(wide.width >= 720, `POLISH-25 1440 宽时对话阅读列不窄于 720px：${wide.width}`);
  assert.ok(Math.abs(wide.left - wide.barLeft) <= 1, `POLISH-25 阅读列加宽以后左缘仍对齐底部输入框（UIV-19）：${JSON.stringify(wide)}`);
  assert.ok(wide.prose >= 560, `POLISH-25 正文段落跟着阅读列变宽，不被 52 字的上限卡住：${wide.prose}`);
  assert.ok(wide.line <= 40 && wide.card <= 52, `回合结束卡在 1440 是一行：${JSON.stringify(wide)}`);

  // What sits over the box in the page (the next round's tags, 工作区与目标, 打开模型设置) is the box's: as wide, from the same left edge.
  const overBox = () => evaluate<{ rows: number; widest: number; off: number; bar: number }>(`(()=>{const told=getComputedStyle(document.documentElement),left=parseFloat(told.getPropertyValue('--mw-bar-left')),bar=parseFloat(told.getPropertyValue('--mw-bar-column'));
    const rows=[...document.querySelectorAll('${coding} .coding-composer > *')].map(node=>node.getBoundingClientRect()).filter(box=>box.width>0&&box.height>0);
    return {rows:rows.length,widest:Math.round(Math.max(0,...rows.map(box=>box.width))),off:Math.round(Math.max(0,...rows.map(box=>Math.abs(box.left-left)))),bar:Math.round(bar)};})()`);
  const wideOver = await overBox();
  assert.ok(wideOver.rows >= 1 && wideOver.widest <= wideOver.bar + 1 && wideOver.off <= 1, `1440 宽时输入框上方那几行与输入框同宽、左缘对齐输入框：${JSON.stringify(wideOver)}`);
  // 6.7 (POLISH-28): the bar's bottom row at 1440. Four controls a person can press: ＋, the receiver, the way of working, 发送.
  const foot = await owner.evaluate<{ controls: string[]; receiver: string; ids: string[]; above: boolean }>(`(()=>{const shell=document.querySelector(${JSON.stringify(CODING_COMPOSER)}),row=shell.querySelector('.mw-composer__foot');
    const seen=node=>{const box=node.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(node).visibility!=='hidden';};
    const name=node=>node.dataset.composerControl||node.getAttribute('aria-label')||node.title||node.textContent.trim();
    const line=row.getBoundingClientRect();
    return {controls:[...row.querySelectorAll('button,select,.mw-tag')].filter(seen).filter(node=>!node.closest('.mw-tag')||node.classList.contains('mw-tag')).map(name),
      receiver:row.querySelector('[data-composer-chip], .mw-tag')?.textContent.replace(/\s+/g,' ').trim()??'',ids:[...shell.querySelectorAll('[data-composer-control]')].map(node=>node.dataset.composerControl),
      // What batch 35 put in the bar (pictures, the command chip, the notice line) is mounted over the box's text, never in this row.
      above:!row.querySelector('[data-composer-chip], [data-composer-notice], img')&&[...shell.querySelectorAll('[data-composer-chip], [data-composer-notice]')].every(node=>!seen(node)||node.getBoundingClientRect().bottom<=line.top+1)};})()`);
  assert.ok(foot.controls.length <= 4, `POLISH-28 输入框底行最多四个控件：${JSON.stringify(foot.controls)}`);
  assert.deepEqual(foot.ids, ["intent"], "POLISH-28 底行里 Coding 只放「任务方式」一个控件，模型、规则和下一轮带上的都不在这一行");
  assert.ok(foot.receiver && !/Coding|会话：|模型/.test(foot.receiver), `POLISH-28 收件人只写会话名：${foot.receiver}`);
  assert.ok(foot.above, "第 35 批的图片条、指令标签和提示行在输入框上方，不占底行");
  // 「本轮设置」 is one of ＋'s rows, saying the model and the rules beside its name; it opens the model's choice and the rules together.
  await owner.evaluate(`document.querySelector(${JSON.stringify(CODING_COMPOSER)}).querySelector('[data-composer-add]').click()`);
  const rows = `[...document.querySelectorAll(${JSON.stringify(CODING_COMPOSER + " [data-composer-command]")})].map(row=>row.textContent.replace(/\\s+/g,' ').trim())`;
  await owner.waitFor(`${rows}.some(text=>text.includes('/settings'))`, 10_000);
  const offered = await owner.evaluate<string>(`${rows}.find(text=>text.includes('/settings'))??''`);
  assert.equal(await owner.evaluate<boolean>(`(()=>{const row=[...document.querySelectorAll(${JSON.stringify(CODING_COMPOSER + " [data-composer-command]")})].find(row=>row.textContent.includes('/settings')),menu=row.closest('[data-compose-menu]'),
    at=row.getBoundingClientRect(),box=menu.getBoundingClientRect();return menu.scrollTop===0&&at.top>=box.top-1&&at.bottom<=box.bottom+1&&at.height>0;})()`), true, "POLISH-28 打开 ＋ 不用滚动就看得到「本轮设置」");
  await look("zh-light-1440-plus-menu");
  assert.match(offered, /^本轮设置.+ · 规则/, `POLISH-28 ＋ 里的「本轮设置」一行写出当前模型和规则：${offered}`);
  await owner.evaluate(codingAdd("settings"));
  await waitFor(`document.querySelector('${coding} [data-coding-rules-dialog]').open`, 10_000);
  const settings = await evaluate<{ title: string; model: boolean; modelAbove: boolean; rules: string; groups: number; fits: boolean }>(`(()=>{const dialog=document.querySelector('${coding} [data-coding-rules-dialog]'),model=dialog.querySelector('[data-coding-round-model] [data-coding-model]')?.closest('.mw-setting-row'),
    label=dialog.querySelector('[data-coding-rules-label]'),box=dialog.getBoundingClientRect();
    return {title:dialog.querySelector('h2')?.textContent.trim()??'',model:!!model&&model.getBoundingClientRect().height>0,modelAbove:!!model&&model.getBoundingClientRect().bottom<=label.getBoundingClientRect().top,
      rules:label.textContent.trim(),groups:dialog.querySelectorAll('[data-coding-rules-body] .mw-file-group').length,fits:box.top>=0&&box.bottom<=innerHeight&&box.width<=innerWidth};})()`);
  assert.deepEqual(settings, { title: "本轮设置", model: true, modelAbove: true, rules: "规则", groups: 2, fits: true }, "POLISH-28 模型和规则合进「本轮设置」：先是模型，再是规则的两组");
  await evaluate(`document.querySelector('${coding} [data-coding-rules-dialog] [data-coding-rules-close]').click()`);

  // 1024: the bar is narrower still; the column keeps its edge and the round's end stays one line, its actions not wrapping.
  const middle = await at(1024, 768);
  assert.ok(Math.abs(middle.left - middle.barLeft) <= 1 && middle.width >= Math.min(720, middle.room) - 1, `POLISH-25 1024 宽时阅读列左缘对齐输入框，宽到 720 或对话区右缘：${JSON.stringify(middle)}`);
  assert.ok(middle.line <= 40 && middle.card <= 52, `POLISH-25 1024 宽时回合结束卡的操作不折行：${JSON.stringify(middle)}`);
  const footCount = () => owner.evaluate<number>(`(()=>{const row=document.querySelector(${JSON.stringify(CODING_COMPOSER)}).querySelector('.mw-composer__foot');
    return [...row.querySelectorAll('button,select,.mw-tag')].filter(node=>{const box=node.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(node).visibility!=='hidden'&&(!node.closest('.mw-tag')||node.classList.contains('mw-tag'));}).length;})()`);
  await look("zh-light-1024");
  const narrowFoot = await footCount();
  assert.ok(narrowFoot <= 4, `POLISH-28 1024 宽时底行也不超过四个控件：${narrowFoot}`);
  // What sits over the box in the page keeps the box's own width, so its right end stays clear of the workbench's 帮助 at this width.
  const narrowOver = await overBox();
  assert.ok(narrowOver.rows >= 1 && narrowOver.widest <= narrowOver.bar + 1 && narrowOver.off <= 1, `1024 宽时输入框上方那几行与输入框同宽、左缘对齐输入框，不跟着阅读列放到 720：${JSON.stringify(narrowOver)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 1, mobile: false }, sessionId);
  await owner.waitFor("innerWidth<=390", 20_000);
  await look("zh-light-390");
  const phoneFoot = await footCount();
  assert.ok(phoneFoot >= 1 && phoneFoot <= 4, `POLISH-28 390 宽时底行也不超过四个控件：${phoneFoot}`);
  assert.deepEqual(await evaluate("(window.codingTestErrors || [])"), []);
});
