# Workspace 与项目路由

> 状态说明：本 Work Item 的 workspace default 方案已被后续 `specs/session-workspace-redesign/` 取代。当前实现只保留 workspace 历史候选，每个新 Session 都明确确认 Project；以下 default 内容仅作为历史记录。

## 目标

第一次明确选择后，新 Session 能按真实 workspace 自动恢复项目；同时支持符号链接和 monorepo
的一目录多项目，不把项目错误限定为 Git 仓库。

## 范围

- 替换最新 main 中把 `hash(path.resolve(PWD))` 直接当一对一 Session ID 的临时 fallback；保留
  “无 Session ID 时仍能按 workspace 工作”的用户结果，但把数据模型改成 workspace membership/default。
- adapter 提供绝对 workspace 时，用 `realpath` 形成 canonical workspace identity；不存在或无权
  读取时保留规范化绝对路径并标注验证状态，不把相对路径或目录名当身份。
- catalog 增加 workspace membership（多项目）与可选 default project（最多一个）。普通选择只增加
  历史 membership；default 必须由用户单独明确设置。
- 有 thread 元数据时允许 Session override；没有 thread 时只使用 workspace default，不创建
  机器级伪身份。
- 每次无法识别的新 Session 都返回 workspace 历史候选；目录或候选本身不授权连接，即使只有一个
  候选也不自动连接。当前用户消息已经明确选择一个无歧义匹配的现有项目时，可以在解析后直接绑定；
  否则必须询问。只有用户另行明确设置 workspace default 后，之后的新 Session 才自动恢复 default。
- 迁移现有 Session bindings：保留审计历史，能关联到 canonical workspace 的才生成 membership，
  不能证明的保持历史、不自动猜测。
- UI/Skill 支持查看 workspace 已关联项目、设置默认、仅当前 Session 切换和解除关联。

## 具体行为

- Runtime context 同时携带两个彼此独立的信号：可选 Session ID 与可选 canonical workspace。
  Session ID 只查当前 Session override；workspace 只查长期 membership/default，二者都不是项目 ID。
- 解析顺序固定为：当前 Session override → workspace default → workspace members 候选 → 普通候选／
  未关联。一个长驻 MCP 进程切换 Session 时继续使用这一顺序，不能复用内存中的旧连接。
- `context_bind` 增加明确的 `binding_scope`：`workspace_default` 会增加 membership 并更新唯一默认；
  `session` 会增加 membership（若有 workspace）但只切换当前 Session。省略 scope 表示普通的本次选择：
  有 Session ID 时保存 Session override；没有 Session ID 时只增加 membership 并让当前 MCP 调用流继续，
  不能把 MCP 进程本身当成对话身份。首次选择绝不自动建立 workspace default。
- 旧 `runtime_context_bindings` 继续作为 Session override 与审计历史，不把无法还原真实路径的
  `workspace:<hash>` 历史记录猜成 workspace membership。
- Web 默认展示 workspace 名称、成员项目和默认项目；canonical path、Session ID 与 DB 路径仍是
  辅助信息，不作为项目身份或默认文案。

## 验收

- 同一真实目录和它的 symlink 得到同一 workspace identity。
- 一个 workspace 可关联两个以上项目，并能设置唯一 default。
- 新 thread 在同 workspace 默认得到历史候选并询问；用户显式设置 default 后才自动恢复。两个有 thread
  元数据的 Session override 互不干扰。
- 缺少 thread 但有 workspace 时可使用 default；两者都没有时明确 unbound，绝不整机合并。
- 普通目录（无 Git）行为与代码仓库一致。

## 修改边界与验证

- `src/projects/catalog.ts`、`src/mcp/server.ts`、项目/Session 设置 UI、Skill 和对应测试。

```bash
node --import tsx --test tests/project-catalog.test.ts tests/mcp.test.ts tests/web.test.ts
pnpm typecheck
```
