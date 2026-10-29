# W5-14：判断规则编辑器的 Behavior 改叫 Option，Agent 的 Method 合同名改叫 Skill（T-111）

状态：工程验证中（2026-10-29，Claude（设备 A），分支 `task/T111-ca`，叠在 `task/T110-ca` 上，T-110 #1440 合入后变基再开 PR）。做法是 [GLOSSARY 的 R-A5、R-A6](../../../docs/system/GLOSSARY.md)：只改标识符，值、动作 id、Manifest 键、落库字段都不动；方案在 #1332【方案 T-111】，甲档，统筹 6486335681 定设备 A 自己定。验收号 RAC-1755～1758。

## 1. 改了什么

| 旧名 | 新名 | 定义处 |
| --- | --- | --- |
| `JudgmentRuleAuthoringBehavior` | `JudgmentRuleAuthoringOption` | `packages/contracts/src/modules/functions.ts` |
| 12 个 `*_BEHAVIOR_ID`（`HOME_CONTINUE`、`HOME_ASK`、`INBOX_DONE`、`INBOX_DISMISS`、`INBOX_COMPOSE`、`INBOX_VERIFY`、`INBOX_ADMIT`、`FEED_REAUTH`、`FEED_OPEN`、`FEED_SAVE`、`FEED_PROMOTE`、`FEED_ARCHIVE`） | `*_OPTION_ID`，值不变 | 同上 |
| `AgentMethodRegistration`、`AgentMethodView` | `AgentSkillRegistration`、`AgentSkillView` | `packages/contracts/src/services/agent-definitions.ts` |
| `METHOD_TOOLS` | `SKILL_TOOLS`，值不变 | `packages/contracts/src/platform/plugin-agent.ts`，由 `platform/plugin` 转出 |
| `inspectMethodDeclarations` | `inspectSkillDeclarations` | `packages/plugin-sdk/src/agent-declarations.ts`（SDK 内部，不在公开出口） |
| `method_owner`（agent-host 授权里的内存字段，不落库、不进动作 schema） | `skill_owner` | `horizontal/agent-host/src/index.ts` |

不留旧名别名（合同不留兼容期）。

## 2. 没改

- 编辑器目录的字段 `behaviors`、`behavior_id`、`behavior_ids`：不落库，但与判断结果里落库、进动作 schema 的 `suggested_behavior_ids` 同名，分开改容易错，记 BL-900。
- Manifest 的 `methods` 键、`AgentDefinitionRegistration.methods`、`declaredMethods`、`methods()`/`method()`、`assistant.methods.*`、`method_id`、物料种类值 `"method"`：不在 R-A6 名单里，属合同或已存数据（R-B5）。

## 3. 对调用方的影响

写插件的人若引用了上面改名的合同导出，换成新名，值与形状不变。`plugin-sdk` 的公开 API 快照无差异；动作 id、版本、schema、Manifest 都不变，`tooling/gates/actions/` 无差异；`tooling/gates/api/contracts/` 的 `modules/functions.txt`、`platform/plugin.txt`、`platform/plugin-agent.txt`、`services/agent-definitions.txt` 只有改名的行。

## 4. 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-1755 | `modules/functions` 导出 12 个 `*_OPTION_ID`，值与原来逐个相等，不再导出任何 `*_BEHAVIOR_ID`；`JudgmentRuleAuthoringCatalog` 的目录元素类型与 `JudgmentRuleAuthoringOption` 完全相等，旧名报「没有导出」（`tests/w5-14-option-skill-names.test.ts`，类型由 TypeScript 在构建出的 `.d.ts` 上检查） |
| RAC-1756 | `platform/plugin-agent` 与 `platform/plugin` 导出 `SKILL_TOOLS`，列表不变，不再有 `METHOD_TOOLS`；`AgentDefinitionRegistration.methods` 的元素类型与 `AgentSkillRegistration` 完全相等，`AgentSkillView` 的字段不变，旧名报「没有导出」（同一文件） |
| RAC-1757 | Manifest 对方法工具的拒绝一字不变：`tests/plugin-declaration-rules.test.ts`「a method without tools」「a method with a tool outside the business set」两行与 `tests/assistant-methods.test.ts` 的拒绝断言照过（只在这两处注释里写了编号，没有另写用例） |
| RAC-1758 | `apps`、`packages`、`plugins`、`horizontal`、`modules` 的源码（不含测试）不再出现这 17 个旧名（同一文件按名单扫已追踪的源码）；agent-host 的方法库按 `skill_owner` 列、读、装，`tests/agent-host-actions.test.ts` 的 RAC-183 与 `tests/agent-host.test.ts` 改字段名后照过 |
