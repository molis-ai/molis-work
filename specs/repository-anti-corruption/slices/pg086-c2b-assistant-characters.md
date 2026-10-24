# PG-086 C2b：助理经 Characters 的公开动作读角色

状态：已实现、本地验证，未开 PR（2026-10-24，防腐线 ac-coding 片；叠在 #1185 上，等它落地后开）。

## 1. 现状

PG-086 的 Coding 一半在 C2 做完（Coding 经 `characters.list@1` 与 `characters.runnable@1` 读角色，Manifest 列在 `consumes`）。剩下的是宿主这一半：

- `assistant/assistant-http.ts` 经 `characters-host.ts` 的 `codingCharacterPorts` 取「可选的角色」与每个版本能不能跑；这个函数直接读成果库记录、自己判断来源与所有者，再调 `freezeProjectCharacter` 试一次冻结。
- `characters-host.ts` 因为这个函数还从 Coding 包 import `CodingCharacterChoice`、`CodingCharacterPorts` 两个类型：宿主为了助理反向依赖了一个插件的类型。

## 2. 改什么

1. 助理的选择器（`GET /api/assistant/characters`，以及助理服务里「这项工作可选的角色」）读 `characters.list@1` 与 `characters.runnable@1`，用本人的动作客户端（`personClient`）调：新文件 `assistant/assistant-characters.ts` 的 `assistantCharacterChoices`。列表是 `characters.list` 的发布版本，每个版本能不能运行以 `characters.runnable` 的回答为准，不能跑的带 Characters 自己的原因；读不成形状的一行不列出，不猜。助理不开成果库记录，不判断所有者与来源。
2. `codingCharacterPorts` 删除；`characters-host.ts` 不再 import Coding 包；Coding 的 `CodingCharacterPorts` 类型与它在 `index.ts` 的导出随之删除（`CodingCharacterChoice` 仍是 Coding 自己读角色的类型，留着）。
3. 一轮开始时冻结某个版本（`resolveCharacter`）不是读动作：它是 Agent 宿主在派发时要的完整冻结内容，和 `agent-host-composition.ts` 给 Coding 的一轮冻结是同一个宿主函数 `freezeProjectCharacter`，助理照旧直接用它（`assistant-http.ts` 的 `characterFreezer`），不经过动作。这是 Agent 宿主的授权来源，不是插件或助理在读角色。
4. **合同变化**：`characters.runnable@1` 的受众由 `["plugin"]` 改为 `["user", "plugin"]`。助理以本人的身份调动作，本人调用的受众是 `user`；不给 `user`，助理要么拿不到「能不能跑」与原因，要么得在宿主里再写一份判断（正是 `runnable` 要收掉的第二份）。它只答「能不能跑」与原因，不含本机程序路径和工作目录；`characters.execution@1` 仍只给本人，不加 `plugin`（2026-10-21 的决定不变）。动作 id、版本、输入输出 schema、权限（`artifact:read`）、MCP 工具名不变；受众里没有 `agent`、`workflow`、`mcp`。

## 3. 对调用方的影响

- 动作目录：本人的目录里多出 `characters.runnable`（读，`artifact:read`）；插件调用方不变。`tooling/gates/actions/host-actions.tsv` 该行的受众列与合同哈希更新。
- 助理选择器的行为：同一批版本，同一个原因文字（来自 Characters）；以前不在 `characters.list` 里的记录（读不成形状的成果库记录，宿主写一行日志后跳过）现在由 Characters 自己的列表规则决定，一条发布记录读不成内容、或来源与身份不一致时，`characters.list` 整个报错（Characters 自己的错误），选择器这一次读取失败，而不是悄悄跳过那一条；Characters 页面读同一份列表，同样会看到这个错误。
- 助理的一轮冻结、派发时的二次核对、`agent-host-composition.ts` 不变。

## 4. 验收

- **RAC-458**：本人能调 `characters.runnable`：当前版本答 `available: true`，没发布的版本答 `available: false` 并带原因；目录里 `characters.runnable` 受众为 `user`、`plugin`，`characters.execution` 没有 `plugin`。`tests/characters-actions.test.ts`。
- **RAC-459**：助理的角色选择器经这两个动作列出一个项目的发布版本（别的项目只列自己的）；停用后全部版本显示不可运行并带「停用」原因，再启用后最新版本可运行，删除后没有可运行的版本。`tests/characters-publication-http.test.ts`。
- **RAC-460**：`characters-host.ts` 与宿主其余文件不再引用 `codingCharacterPorts`、`CodingCharacterPorts`（`pnpm boundary:check`，`pnpm health:check` 的包清单与计数）。

## 5. 没做、没验证

- 浏览器里助理选择器的显示没有重新走一遍（本片没有改界面文字和浏览器代码）。
- 全量没跑；`node scripts/affected-tests.mjs` 的建议见 PR。
