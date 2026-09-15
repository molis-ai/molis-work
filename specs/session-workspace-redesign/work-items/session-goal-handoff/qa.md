# Session Goal Handoff QA 记录

## 结论

- 完成等级：**3（功能可用）**。
- 本 Work Item 的定向测试、类型检查、构建、diff 格式检查及真实浏览器布局/交互检查均通过。
- 本记录不宣称达到完成等级 5「可发布」；未执行全仓测试，也未在浏览器中实际向 Runtime 发送 Handoff。

## 已验证命令与结果

| 验证 | 结果 |
| --- | --- |
| `node --import tsx --test tests/session-adapters.test.ts tests/session-handoff.test.ts tests/session-handoff-recovery.test.ts tests/session-directory.test.ts tests/session-web.test.ts` | 通过，20/20（Handoff/Adapter/API 17/17：Adapter 5、Handoff/API 4、recovery 8；Session directory 2、Session Web 1） |
| `node --import tsx --test tests/session-adapters.test.ts tests/session-handoff.test.ts tests/session-handoff-recovery.test.ts tests/session-registry.test.ts tests/session-migration.test.ts tests/session-content.test.ts tests/session-resume.test.ts tests/session-content-privacy.test.ts tests/session-directory.test.ts tests/session-web.test.ts` | 扩展 Session 回归通过，31/31 |
| `node --import tsx --test tests/web.test.ts` | 50/51；唯一失败是既存 Decision Center 对 Feed mobile CSS 的正则断言差异，不属于本 Work Item |
| `pnpm typecheck` | 通过 |
| `pnpm build` | 通过 |
| `git diff --check` | 通过 |

未运行全仓 `tests`：当前工作树包含大量并行改动。完整 `tests/web.test.ts` 已运行，但结果为 50/51，不能写成全通过；唯一失败是既存 Decision Center 对 Feed mobile CSS 的正则断言差异，不属于本 Work Item。该边界不影响上述定向证据，但也是本次不宣称发布级完成的原因之一。

## 真实浏览器检查

- 已检查暗色、浅色主题，以及默认宽度和约 `344 × 675` 的窄屏视口。
- `body` 横向溢出为 `0`；窄屏 Handoff section 的 `clientWidth = scrollWidth = 344`，页面可纵向滚动。
- 执行内容仍占主页面最大比重，Handoff 审阅面没有抢占主工作区。
- 弹窗可以生成草稿并复用已有草稿；未勾选确认时，发送按钮保持禁用。
- 最终代码已在 `4187` 重启；Handoff 草稿恢复成功：`state = 草稿`、`contentLength = 3030`、`sendDisabled = true`、`overflowX = 0`、`theme = system`。
- 浏览器检查未实际点击发送。真实发送链路由 Web API 与 Adapter 定向测试覆盖，包括 Codex 先 create/`thread/start`，拿到真实 native ID 后持久化目标 lineage，再执行 `turn/start`；同时覆盖 fallback、失败恢复、并发发送与重复请求。

## 验收标准映射

1. **通过。** `Handoff package uses the canonical Goal and a minimal Session context...` 验证 package 使用 canonical Goal、保留最小用户上下文并排除 tool 内容；package 列出状态为 `started` 或 `blocked` 的当前 Run，包含全部 effective Evidence 及其结果状态。prepare 阶段只读取来源 thread，确认前未创建或发送目标 Session；Web API 测试验证草稿可编辑。
2. **通过。** native Handoff 与 Adapter 测试验证 Codex 先 create/`thread/start`，拿到真实 native ID 后持久化目标 lineage，再以 `turn/start` 发送用户确认后的正文；目标 Molis Work `session_id` 与来源不同，重复或并发发送不会创建第二个目标。
3. **通过。** `unsupported Runtime receives an honest Molis Work fallback Session...` 验证不支持 native Handoff 的 Runtime 创建 `molis_work_fallback` Session，目标无伪造 native ID，且 package 可从目标 Session 内容读取。
4. **通过。** recovery 测试验证 `thread/start` 的明确失败不产生虚假目标 Session；`turn/start` 的明确拒绝保留真实目标与 package，重启后只补发 `turn/start`；并发 send 不会创建第二目标。只有 Runtime 显式返回 `deliveryAccepted: false, retryable: true` 的明确拒绝才允许自动重试。`thread/start` / `turn/start` 超时、断线等不确定结果均记为 `retryable = false`：保留 package 与已知目标，并阻止重复发送；定向测试分别覆盖 ambiguous create 与 ambiguous delivery。Runtime 的 `thread/start` 即使返回成功对象，只要缺少原生 Session ID，也会判定为创建结果不确定、不可自动重试；第二次 send 被阻止，且整个场景只调用一次 `thread/start`。发送租约验证表明：5 分钟租约内，第二个 Registry 连接不会把 active `sending` 改为 `failed`；fake clock 推进到 6 分钟后才恢复 `failed`，且保留已知 destination。
5. **通过。** `session-web` 验证 Session Hero 的 Handoff 入口、弹窗、正文与确认控件存在；无当前 Goal 的定向测试验证禁止 prepare。真实浏览器检查覆盖固定 Project/Goal 信息、Runtime/workspace、可编辑正文、草稿生成/复用及未确认时禁用发送按钮，并验证桌面/窄屏布局。
6. **通过。** Handoff Web API、Session Web、Registry 与 content privacy 定向测试共同覆盖来源/目标 Project 隔离、绝对工作目录约束、显式确认、已发送记录幂等复用，以及正文加密和敏感 metadata 不落盘的边界；Project 前缀下的 Handoff mutation 在缺少本地 control token 时返回 `403`。Runtime 若返回来源 native ID，发送会失败且不会覆盖既有来源/目标关系。

## Remaining risk / later

- 其他 Runtime 只有各自实现并验证 Adapter 后，才能声称 native Handoff；当前受控 fallback 不等同于 Runtime 原生送达。
- Codex `thread/start` 超时但实际已创建 thread 时，现协议缺少可验证的 correlation/idempotency 对账能力；当前会保留 package、标记为不可自动重试并阻止重复发送，自动发现与对账留作 later。
