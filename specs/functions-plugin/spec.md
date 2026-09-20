# Functions 插件垂直切片

完成等级：3（功能可用）。不宣称可发布。

## 背景目标

在 Molis Work 里做一个个人「函数」插件：用 TypeSafe 的 Jev 写有版本的判断函数。本切片同时交付三件事：全局设置里的 TypeSafe Key、目录里新建 Choice、试跑成功后发布 v1。

参考 [molis-ai/jev-workbench](https://github.com/molis-ai/jev-workbench)，不搬它的 React 站、独立进程或 `~/.jev-workbench`。

## 当前行为与问题

GoalBoard 没有判断函数。TypeSafe Key 也不该进「AI 与执行工具」聊天供应商页——Jev 不是聊天模型。

## 范围

- 产品名 Functions / 函数。`plugin_id` `io.molis.work.functions`，`project_plugin_id` `functions`。
- Manifest `kind: "native"`，`personal: true`，始终在 rail 上，位置在 Shelf 后、Artifacts 前。
- 本机函数库：`{home}/functions/functions.db`（`node:sqlite`）。不迁旧库。
- 全局设置页（齿轮目录，Shelf 后）登记 TypeSafe API Key。Key 进 Host SecretStore，`credential_ref` `plugin:io.molis.work.functions:typesafe`。页面永不回显明文。
- `TYPESAFE_API_KEY` 环境变量优先，字段只读。
- 保存只标已配置，不强制探测。预览即连通证明。失败不自动重试。
- v1 UI 只做 Choice。草稿须对同一 `config_hash` 成功试跑后才能发布。已发布版本字段不可改。
- HTTP：catalog 级 `/api/functions*`，与 `/api/shelf` 相同防护。

## 非目标

归档 / 回收站、外部客户端 Token、九个 Agent MCP 安装器、iframe 整站、独立 demo 进程、Noul / Score、把 TypeSafe 登记成聊天供应商、扩 `PluginHostServices.secrets`。

## 使用场景

1. 齿轮 → Functions → 填 TypeSafe Key → 显示「已配置」。刷新后输入框是空的。
2. Rail 点 Functions → 舞台列表为空 → 新建 Choice → 写说明和至少两个选项 → 输入一段文字预览 → 发布 v1。
3. 已发布函数还能预览，但不能改配置。`function_key` 发布后冻结。

## 方案与关键决策

- 构建期装配，像 Shelf，不是 Runtime 托管的 `app`。
- 左栏不设 Functions 目录段。列表和编辑都在 stage。
- `config_hash` = sha256(primitive + instructions + 按 key 排序的 criteria + model)。默认模型 `jev-latest`。
- TypeSafe：`POST https://api.typesafe.ai/v1/systemone`，Bearer key。Choice 作为一条 question，criteria 是 key→description 映射。
- `needs_review`：上游 200 但没有选中项。这是业务态，算一次成功试跑，可以发布。
- 预览答案写入该函数的 `last_preview`，刷新后仍能看见。不是运行历史。
- `function_key` `/^[a-z][a-z0-9_]{1,63}$/`。选项 key `/^[a-z][a-z0-9_]{0,31}$/`，至少两个。

## 输入输出与依赖

- 输入：本机 Home、可选 `TYPESAFE_API_KEY`、用户填写的 Key 与 Choice 草稿、预览文本。
- 输出：设置状态 `{ has_credential, source: ui|env|none }`；函数记录；预览结果；发布后的不可变 v1。
- 依赖：Host SecretStore、catalog HTTP、workbench UI composition、TypeSafe SystemOne。

## 文件 / 模块边界

- `packages/contracts/src/modules/functions.ts`：共享类型。
- `plugins/native/functions/`：store、provider、service、routes、UI、settings、client。
- `apps/local-host/src/functions-native-plugin-http.ts`：挂 catalog 与 project HTTP。
- Workbench catalog / rail / settings / i18n / palette 接线。插件不写 Goal，不发 Artifact。

## 验收标准

1. 未配 Key 时仍能建草稿、改配置；预览返回「未配置」，不打 TypeSafe。
2. 设置页保存后 JSON 与 HTML 都不含明文；环境变量优先且字段只读。
3. 同一 `config_hash` 预览成功前不能发布；改说明后旧预览作废。
4. 发布后 name / key / instructions / criteria / model 不可改；预览仍可用。
5. Rail 出现 Functions；设置目录在 Shelf 后有 Functions；不出现在「AI 与执行工具」。
6. 函数数据只在本机 `{home}/functions/`。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-plugin-functions --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/plugin-global-settings.test.ts tests/plugin-declarative-mounting.test.ts
```

## 假设与开放问题

- 本切片不把已发布函数暴露给 Inbox / Agent 调用。那是下一刀。
- 本切片不迁 `~/.jev-workbench`。
- Key 探测做成可选「测试连接」留 later；保存不探测。
