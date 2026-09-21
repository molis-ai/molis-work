# Functions：可写可调

完成等级：3（功能可用）。不宣称可发布。

承接 [Functions 垂直切片](../functions-plugin/spec.md)。本切片把判断库做成「人能写三种判断、像样试跑、发布后工作台 Agent 能调」。

## 背景目标

现在只有 Choice 表单和一段 `<pre>` 结果；发布后没有调用方。对照 jev-workbench，要搬的是判断合同和调用闭环，不是独立站。

## 当前行为与问题

- 只能新建 Choice；结果是纯文本；不能存样例、不能删草稿。
- 模型写死 `jev-latest`，发布不钉版本。
- 已发布函数没有 list / describe / invoke。原切片写明那是下一刀。

## 范围

1. 新建时选 Noul / Choice / Score，一函数一题。
2. 舞台左定义、右试跑：概率条或档位、复核用文字、可存最多 8 条样例、草稿可删。
3. 试跑若返回 `jev-x.y.z`，发布把它钉死；只返回别名时仍可发布，记下实际 model 字符串。
4. 工作台 Agent 三个 Runtime 工具（本机目录级，不绑项目）：`molis_work_v1_functions_list` / `_describe` / `_invoke`。只看已发布版本。
5. HTTP：创建带 primitive；删除草稿；样例增删；按 key describe / invoke。

## 非目标

归档回收站、v2、多问题、输入 schema、复核规则 DSL、输出映射、客户端 Token、官方 `/v1/systemone` 代理、九个 MCP 安装器、iframe 整站、独立 demo、迁 `~/.jev-workbench`、把 TypeSafe 登记成聊天供应商、扩 `PluginHostServices.secrets`。

## 使用场景

1. 新建 Noul「这段材料能否支持结论」→ 填说明 → 试跑一段文字 → 看到成立概率条 → 发布 v1。
2. Choice 工单分流：保存「请退款」样例，再试跑，发布后 Agent `list` 看到它，`invoke` 得到 `choice=billing`。
3. 改说明后旧试跑作废，发布按钮拒绝，直到再试跑。
4. 草稿可删；已发布配置仍锁死，删除返回不可变。
5. 没 Key 时能编辑；试跑/调用返回未配置，不打 TypeSafe。
6. `needs_review` 是 200 业务结果，MCP 不标 `isError`。Agent 不得把它当成行动许可。

## 方案与关键决策

- 仍是构建期 native 插件，库仍在 `{home}/functions/functions.db`。
- 一函数一题。Noul 不伪造 confidence。Score 返回从 0 起的档位。
- Choice 没选出 → `needs_review`。Noul/Score 有合法答案即 `ok`（本切片不做阈值规则）。
- 试跑与 invoke 走同一 Provider 校验。invoke 不覆盖 `last_preview`，不落调用正文。
- Agent 先 list/describe 再 invoke；禁止编造 `function_key`。工具挂在 Runtime context 面，不要求已绑项目。
- 不搬 React 站。舞台继续是 declarative HTML + 现有 client factory。

## 输入输出与依赖

输入：primitive、名称、key、说明、类型专属标准、试跑/样例文本、已配置的 TypeSafe Key。

输出：函数记录、试跑结果、发布后的不可变 v1、Agent invoke `{status, data, …}`。

依赖：Host SecretStore、catalog HTTP、MCP Runtime 工具目录、TypeSafe SystemOne。

## 文件 / 模块边界

允许：`specs/functions-write-and-invoke/`、`specs/functions-plugin/spec.md`（指向本切片）、`packages/contracts/src/modules/functions.ts`、`plugins/native/functions/**`、`apps/local-host` 的 Functions HTTP 与 MCP 装配、`apps/mcp` 的工具 schema/目录、Workbench 已有 Functions 接线、对应测试、README、SSOT 一行。

禁止：改 Schedule 未提交文件、Goals/Inbox 合同、独立进程。

## 验收标准

1. 能新建三种原语；列表看得出类型；编辑器左定义右试跑。
2. Choice 至少两选项且有说明才能试跑；Noul 有说明即可；Score 至少两档非空说明。
3. 同一 `config_hash` 成功试跑前不能发布；改配置旧预览作废。
4. 发布后 name/key/instructions/criteria/model 不可改；试跑仍可用。
5. 草稿可删；已发布删除失败且记录仍在。
6. 样例写入后刷新仍在，且不改变 `config_hash`。
7. 试跑返回固定版本时，发布后 `model` 等于该版本。
8. MCP list 只含已发布；describe 草稿 key → 未发布/不存在；invoke 草稿失败；invoke 已发布走 TypeSafe 一次，结果可观察。
9. 没 Key 不打上游。失败不降级成模拟成功。
10. 设置页仍不回显 Key；Functions 不出现在「AI 与执行工具」。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-app-mcp --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/plugin-global-settings.test.ts tests/plugin-declarative-mounting.test.ts tests/mcp.test.ts
```

舞台对开与三种新建用本地 Web 点一遍。

## 假设与开放问题

- Agent 调用面是 MCP，不是 Inbox subject。Inbox 引用 later。
- 本切片不做 GET models 选择器。
- 不迁 jev-workbench 旧库。
