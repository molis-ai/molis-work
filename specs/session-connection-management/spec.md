# 已知 Session 与项目关联管理

## 背景与目标

Molis Work 已能由 Runtime 宿主提供稳定工作入口 ID，并在当前 Runtime 对话中解析候选、确认绑定、切换或解绑。Web 项目设置页尚未展示这些已经确认过的关联，用户只能回到对应 Runtime Session 管理它们。

本 Work Item 让项目设置页管理 catalog 中已经存在的稳定工作入口关联，同时保持新 Session 的首次握手规则：候选不是绑定，只有 Runtime 与用户完成明确确认后才写入；打开网页、切换网页项目或查看设置都不会创建 Session 记录。

## 当前行为与问题证据

- `MolisWorkProjectCatalog` 已有 `resolveRuntimeContext`、`bindRuntimeContext`、`unbindRuntimeContext` 和绑定事件，但没有公开的只读活动绑定列表。
- Runtime MCP 已能解析当前宿主 Session、展示候选、确认绑定和解绑；现有测试证明未知 Session 不会按 Git、目录名、标题或聊天内容自动绑定。
- `/settings/projects` 可创建、导入、改名和打开项目，但明确说明 Session 管理留给后续 Work Item。
- Web 若直接暴露 `stable_work_context_id`，会把宿主内部标识写进 HTML/API；管理动作应使用 Molis Work 自己的 binding ID。

## 范围

- catalog 增加只读活动绑定列表，仍以已确认的 `runtime_context_bindings` 为唯一来源。
- 项目设置页增加“已关联的 Runtime Session”连续列表，显示 Runtime、安全短标签、当前项目和更新时间。
- 每条已知关联可明确选择另一个现有项目并确认切换，也可单独确认解绑。
- Web API 只接收 Molis Work binding ID，不向浏览器返回宿主 `stable_work_context_id`。
- Web 路由重新打开 catalog，通过现有 `bindRuntimeContext` / `unbindRuntimeContext` 完成写入，不直接更新 SQLite。
- 保持当前 Runtime 的 MCP 解析、候选确认、切换和解绑流程；补充跨入口回归，证明 UI 变更与 MCP 读取同一 catalog 事实。

## 非目标

- 不让网页创建、猜测或手填 Session / work-entry identity。
- 不把 workspace、路径、Git 仓库、Session 标题或聊天内容升级为身份。
- 不在网页展示未绑定候选；候选只在对应的新 Runtime Session 首次握手后由当前 Runtime 与用户确认。
- 不删除项目或 Runtime 配置。
- Origin、本地控制凭据和通用幂等防护由紧随其后的本地控制安全 Work Item 统一加在所有敏感写接口外层。

## 用户场景

1. 用户打开项目设置，看到 Codex / Claude Code 中已经确认关联过的 Session，以及它们当前连接的项目。
2. 用户把一条已知 Session 切换到另一个项目：先选择目标并勾选确认，catalog 记录 `context.rebound`；其他 Session 不受影响。
3. 用户停止某条 Session 使用 Molis Work：单独确认解绑后只删除该入口关联，项目和其他关联都保留。
4. 新 Session 第一次调用 Skill：Runtime 可读取宿主候选线索并询问用户，但在用户确认前，项目设置页不会出现新关联。

## 方案与关键决策

- catalog 暴露按更新时间排序的活动绑定快照；绑定历史继续由事件表保留。
- Web server 用 binding ID 查回内部 binding，再构造宿主声明稳定的 `RuntimeWorkContext` 调用原领域方法。浏览器永远不拿内部 work-context ID。
- 安全短标签由 Runtime 名称与不可逆摘要组成，例如 `Codex Session · A1B2C3`，只用于人眼区分，不作为身份输入。
- Session 关联属于项目配置，因此复用 `/settings/projects`，不新增第四个设置顶级页面。
- 切换和解绑各自要求独立确认；“打开项目”或选择下拉项本身不写入。

## 输入、输出与依赖

- 输入：binding ID、目标 project ID、明确确认。
- 输出：安全的关联摘要、切换/解绑结果、catalog 事件。
- 依赖：`MolisWorkProjectCatalog`、项目设置页、现有 Runtime context MCP。

## 文件与模块边界

- `src/projects/catalog.ts`：只读列出活动 binding，不改变解析与确认规则。
- `src/web/server.ts`：安全摘要、binding ID 路由和 catalog adapter。
- `src/web/render.ts`：项目设置中的 Session 关联列表与明确确认交互。
- `tests/project-catalog.test.ts`：列表与未知 Session 不落库回归。
- `tests/web.test.ts`：安全输出、切换、解绑和跨入口一致性。
- `DESIGN.md`：补充已知 Session 管理规则。

## 验收标准

- 未知 Session 在首次握手或候选解析前后都不会被预创建或自动绑定。
- Web 只列出已确认的活动关联，不返回或渲染 `stable_work_context_id`。
- 未明确确认的切换和解绑均不改变 catalog；确认后只影响目标 binding。
- UI 与当前 Runtime MCP 读取同一关联结果，切换/解绑后 Runtime 下一次解析立即看到新事实。
- 项目、其他 Session 关联和绑定历史保持完整。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/project-catalog.test.ts tests/mcp.test.ts tests/web.test.ts
pnpm test
```

另用本地浏览器在桌面和移动宽度验证关联列表、确认门槛和无横向溢出；真实 home 只做只读检查，不切换当前用户 Session。

## 假设与开放问题

- 当前 catalog 只保存稳定入口身份和关联，不保存可编辑的 Session 名称；首版用安全摘要区分。未来若 Runtime 宿主提供经过用户同意的显示名，应作为独立非身份字段进入 catalog。
