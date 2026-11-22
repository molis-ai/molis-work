# 三天复核修复（2026-11-21）

状态：已实现，等 CI 与评审（2026-11-21）。分支 `fix/main-review-1121`，一个 PR。复核报告见 [`docs/reviews/main-review-2026-11-21.md`](../../docs/reviews/main-review-2026-11-21.md)（11-18～11-21 合入的 75 个 PR 与全部已合入批次）。

## 范围

用户 2026-11-21 弹窗定：P1 与 P2 一起修；D-1 登记为保留机制例外；D-2 改 AGENTS.md 对齐[决定 58](../post-anticorruption-roadmap/reference/decisions.md#decision-58)，并让预算表的归属变化也被门禁拦住；D-3 追认 #2156 并补洞；D-4（删除项目接管没有回执的旧暂存目录）按「不留兼容」删。

与同时在审的 #2199（已合）、#2200、#2201 分工：它们改的不在本片重复做。本片在它们之后变基。

## 验收标准

| 编号 | 要求 | 证明 |
| --- | --- | --- |
| MR21-01 | 定时任务的一轮只发起各项目的 tick、不等它们结束：一个项目长时间的唤醒不挡别的项目下一轮；tick 还在跑的项目不被放去休眠，等它最后一个 tick 结束再问（第 103 批休眠）；停止时仍等所有在跑的 tick | `tests/project-scheduler-retry.test.ts`「MR21-01」 |
| MR21-02 | 待核对插件事件的确认可以不写理由；工作台不再把界面译文当理由存进记录；写了理由才存（去空白，最多 2000 字） | `tests/plugin-event-recovery.test.ts`「MR21-02」 |
| MR21-03 | 个人同步云端清理后的本机最终清理接上生产调用方 | 未做，[BL-mr21-personal-purge-finalize](../backlog/BL-mr21-personal-purge-finalize.md)；`PCSYNC-OPT-16` 改为「部分」 |
| MR21-04 | 一次放置同时改归属与事项时，先在主线核对事项（可见、权限、上限），核不过就整次拒绝，主人那边什么都不写 | `tests/mainline-items.test.ts` B36F-06 里的 MR21-04 断言 |
| MR21-05 | 页面资源预算只许收紧：已有路由不能少计任何资源，新路由只能列确切资源（不能用前缀、后缀兜住一片） | `tests/page-assets-budget.test.ts` 的 MR21-05 段 |
| MR21-06 | 资料的阅读位置只读调用者自己的；删除项目不再接管没有回执的暂存目录，原样保留 | `tests/system-materials-actions.test.ts`「MR21-06」、`tests/project-deletion-processes.test.ts`「ARF-1/MR21-06」；[ARF-1](../architecture-review-fixes/spec.md) 同步改 |
| MR21-07 | 外壳里 Feed/Inbox 的名字分支随外壳整改搬走 | 外壳一侧随 H4 搬走；Goals 画框里剩下的分支记 [BL-shell-goals-leftovers](../backlog/BL-shell-goals-leftovers.md) ⑥ |
| MR21-08 | AGENTS.md 的页面资源规则与决定 58 一致（预算表、只许收紧、调高或移出路由先问） | 文档 |
| MR21-09 | 补回丢失的证据：PWA-137 由托盘的「已停止」状态承担，两种语言下都不与运行中、重连中同词；EVD-13 标注；EVD-16 一份报告里多项引用同一轮同一组命令只问平台一次（随 #2155 退化，已修）；EVD-18 随 `acceptance.reports.submit@1` 去掉幂等键而失效，记入后续 | `apps/desktop/adapters/tauri/src/native_language.rs`「pwa137」、`tests/acceptance-requirements.test.ts`「EVD-13」「EVD-16 / MR21-09」 |
| MR21-10 | 日程的命令成功后告诉打开的页面失败（插件正在停用）不会把成功变成失败 | `tests/schedule-task-grants.test.ts`「MR21-10」 |
| MR21-11 | 公网地址只有一张表：`packages/contracts/src/platform/public-address.ts`，沙箱代理、宿主公网 HTTPS、资料来源读取与 RSS 都用它；`198.18.0.0/15` 只给声明 `fakeIpProxy` 的调用方；`3fff::/16`、`2001:10::/28` 一律拒，`192.0.0.0/16` 只拒两段 | `tests/security-invariants-urls.test.ts` S-10 首个用例（MR21-11）与共用表 `tests/fixtures/public-address-policy.ts` |
| MR21-12 | 子进程输出按流解码：跨块的字不被拆成乱码（连接器工具安装、创作台依赖解包与类型检查） | 代码（`setEncoding`） |
| MR21-13 | `/api/skills` 只有草稿路由收 256 KB 正文，其余 64 KB | 代码 |
| MR21-14 | #2156 删掉的 `design-system-giants`（RAC-370～372）与 `ui-audit-browser.e2e`（ASR-13）恢复；`ui-audit-2026-09-22` 只恢复走公开入口的两例（收件箱行的 Tab 顺序、修饰键回车），另三例要伸进工作台内部、门禁不许；两处按 CSS 原文写的正则（测试卫生规则不许，且那条样式已改）去掉，标题宽度由浏览器用例实量。追认记在 [ci-acceleration](../ci-acceleration/spec.md#非目标) | 三个测试文件 |
| MR21-15 | visual-audit 覆盖宿主渲染的页面 | 未做，[BL-mr21-review-followups](../backlog/BL-mr21-review-followups.md) ⑧ |
| MR21-16 | Assistant 与知识整理里给人和模型看的文字按整字截断（SDK `cutHead`），不留半个字 | 代码 |
| MR21-17 | 账号弹层的触发按钮不再宣告它不是的弹出类型：弹层是不抢焦点的区域（`region`），按钮按展开/收起宣告（`aria-expanded` + `aria-controls`），不写 `aria-haspopup=menu` | 代码；`tests/dialog-submit-rules.e2e.test.ts` VUX-29 仍只把模态层当对话框 |
| MR21-18 | `molis-work:attention-refresh` 的 `{ reconnected: true }` 写进页面事件登记 | `packages/contracts/src/platform/dom-events.ts` |

D-1 的例外写在 [CONTRACT-CHANGES「当前保留机制」](../../docs/system/CONTRACT-CHANGES.md#当前保留机制)。没改的 P2 记在 [BL-mr21-review-followups](../backlog/BL-mr21-review-followups.md)。
