# Plugin 开发与打包命令

给 Plugin 作者提供 validate、create、pack、pack-sandbox、pack-content、pack-bundled、identity、sign 和 verify 命令，并通过 Host 接入本地开发验证。

包名：`@molis-ai/molis-work-plugin-cli`。工作区内部包，通过仓库构建和 Host 装配使用。

`create` 默认生成 Integration 插件。Manifest 注册健康查询、个人结果读取和保存动作；生成代码从这份定义绑定 handler，轮询调用同一个注册保存动作。健康查询可单独授权给 MCP，个人成果入口保留本地 owner 限制。原私人计数、Artifact 版本和 UI 仍由原服务持有；生成模板不会给未知消费者伪造场景或业务触发。需要判断场景时按 [SDK 合同](../../packages/plugin-sdk/README.md#动作与判断消费场景)声明真实 targets、绑定和消费。

## 一次典型调用

runPluginCli 分发命令；validate 使用 Contracts 的 Manifest parser，并按 Plugin Runtime 的规则读 Manifest 旁边声明的语言文件（`blocking` 的失败，只缺译文的放进输出的 `locale_notes`）；pack 生成显式文件列表的 JSON bundle，声明的语言文件自动带上、不用写进 `files`，同一套规则不过就不写输出，签名和验证使用 Plugin Runtime 的公开包验证接口。dev 通过注入的 PluginCliHost 使用真实 Local Host；独立的 `molis-work-plugin` 没有 Host，`dev`、`install` 报 `plugin.host_required`。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/cli.ts](src/cli.ts) | 命令与输出 |
| [src/create.ts](src/create.ts) | 示例项目生成 |
| [src/package-files.ts](src/package-files.ts) | 文件打包 |
| [src/package-signing.ts](src/package-signing.ts) | 签名与验证 |

可对照现有调用方 [apps/desktop/launchers/cli/main.ts](../../apps/desktop/launchers/cli/main.ts) 阅读装配方式。

## 接入与边界

构建后再运行 bin。create 要求父目录已存在且目标不存在；pack 不覆盖输出，拒绝 symlink、越界路径及超过 64 MiB 的包；分发文件必须用 `package.json` 的 `files` 明确列出，不执行 glob 或生命周期脚本。verify 依赖调用方提供的受信 Ed25519 公钥，签名不代表官方审核或 marketplace 上架。

工作区依赖：`@molis-ai/molis-work-plugin-runtime`、`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-cli typecheck
pnpm --filter @molis-ai/molis-work-plugin-cli build
```

已有行为示例与回归：[plugin-package.test.ts](../../tests/plugin-package.test.ts)、[plugin-authoring.test.ts](../../tests/plugin-authoring.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/plugin-package.test.ts tests/plugin-authoring.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

使用仓库自带的 Manifest 做一次只读校验：

```bash
node tooling/plugin-cli/dist/main.js validate examples/plugin-sample/manifest.json
```

成功时退出码为 0，并返回通过校验的 Plugin 身份/版本；它不会启动该 Plugin。开发运行、打包与签名的完整步骤见下方指南。

## 沙箱包

`pack-sandbox <directory> <output.json>` 从 `plugin.mjs`、`contract.json`、`interface.json`、`prompts.json` 生成未签名包。必填 `--name`、`--version`、`--publisher-id`、`--publisher-key-id`；范围用 `--scope project|home`（默认 project），可选 `--icon`、逗号分隔的 `--compatible-from`，以及 JSON 列表 `--agent`（角色资料，每项 `{ name, purpose, body }`）与 `--methods`（完整的方法声明，`description`、`applies_to` 必填，`body` 是 `skills/<skill_id>/SKILL.md`，`tools` 为空）。目录名称、舞台标题和简介可用 `--name-text`、`--view-title-text`、`--summary-text` 传入 JSON `TextRef`，同时保留 `--name` 和已声明简介的 `--summary` 原文。例如 `--name-text '{"key":"notes.directory.name"}'`。词包在 `contract.json` 的 `ui.locales` 声明。清单、派生权限和 effects 由公开 SDK 的 `sandboxPluginManifest` / `effectsFromContract` 生成。

命令只读取固定文件、角色资料引用的 `agent/` 文件和方法声明的正文与资源，不读取源目录的 BuildManifest，不递归打包，也不把 `package.json` 放进沙箱包。输出不能覆盖；路径跳转、symlink、文件/包超限会拒绝。随后用既有 `sign`、`verify` 命令签名与核验。打包只检查它消费的结构；完整合同、界面和正文语义仍由 Host 在安装预览时检查，打包成功不代表插件可运行。

## 内容包

`pack-content <skills-directory> <output.json>` 把一个目录下的各个技能目录（每个是 `<skill_id>/SKILL.md`，附带文件只能放在 `references/`、`scripts/`、`assets/` 下）打成只有声明的插件（`kind: "content"`）的未签名内容包。必填 `--plugin-id`、`--name`、`--version`、`--publisher-id`、`--publisher-key-id`；范围用 `--scope project|home`（默认 project），可选逗号分隔的 `--compatible-from`。每个技能的声明从 `SKILL.md` 的 frontmatter 读（SDK 的 `skillDeclarationFromFrontmatter`：只认下划线写法的键，`argument-hint` 一类带连字符的写法点名拒绝；多行值拒绝；`description`、`applies_to` 必填），资源的大小与 SHA-256 由命令算出；Manifest 由 SDK 的 `skillFromFolder` / `contentPackagePayload` 生成，与宿主「从本机导入技能」是同一个打包函数。

符号链接、既不是文件也不是目录的条目、其他位置的文件、超过上限（一个包至多 128 个技能）都拒绝，不写输出、也不悄悄丢掉。输出不能覆盖。随后用既有 `sign`、`verify` 命令签名与核验，再从插件设置安装（`plugins.install.preview`／`confirm`，与别的包同一条路）。

## 随安装包带上的包

`pack-bundled <pack-directory> <output-directory> --publisher-key <private-key.pem>` 打随安装包带上的只有声明的插件（如 `plugins/content/design-accessibility/`）。包目录里是 `skills/` 与 `pack-content.json`（`pack-content` 的参数写成文件：`plugin_id`、`version`、`name`、`publisher_id`，可选 `name_text`、`summary`、`summary_text`、`scope`、`compatible_from`、`locales`，多一个键就拒绝）。`locales` 与 Manifest 的 `ui.locales` 同形，打包时读同目录下声明的 `locales/<语言>.json` 并随包签名。它用与 `pack-content` 同一个打包函数，同一步签名并自验，写到 `<output-directory>/<plugin_id>.json`，不覆盖。没有 `--publisher-key` 就以 `plugin.publisher_key_missing` 拒绝，不建目录、不写文件：官方发布者密钥与在发版构建里跑这一步归第 26 批（26-1）。宿主从自己构建产物里的 `bundled-plugins/` 读这些包（`plugins.bundled.list@1`），装仍走 `plugins.install.preview`／`confirm`。

`interface.json` 可选 `ui.slots` 为原舞台声明对象挂载位。打包用 SDK 核对声明形状，保留签名输入中的界面文件；安装仍会验证每个部件和读取绑定。不使用挂载位的包不需要加字段。

## 开发要求

- 负责：插件的创建、Manifest 与合同校验、本地调试、打包与签名命令。
- 不负责：SDK 与插件生命周期的实现。
- 公开入口：`@molis-ai/molis-work-plugin-cli`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/tooling`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-runtime`、`@molis-ai/molis-work-plugin-sdk`（Manifest 解析）。方向：只依赖合同、plugin-sdk 与 plugin-runtime（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - `create` 要求父目录已存在且目标不存在；`pack` 不覆盖输出，拒绝 symlink、越界路径与超过 64 MiB 的包；分发文件必须用 `package.json` 的 `files` 明确列出，不执行 glob 或生命周期脚本。
  - `validate` 只读校验，不启动插件。
  - `dev`、`install` 只经注入的 `PluginCliHost` 跑；独立的 `molis-work-plugin` 没有 Host，这两条报 `plugin.host_required`（`unavailable`），在建任何状态目录之前；帮助按入口列命令，独立工具把这两条写成 `molis-work plugin …`。
  - 生成的模板不给未知消费者伪造场景或业务触发。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-authoring.test.ts tests/plugin-package.test.ts tests/npm-package.test.ts tests/plugin-declaration-rules.test.ts tests/action-artifact-references.test.ts`
- 加跑：`node scripts/run-tests.mjs tests/plugin-sample.e2e.test.ts`（不开浏览器，要 `pnpm pack` 加 npm 离线安装，只在本机跑，不在 CI 里，见 BL-124）
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../skills/molis-plugin-dev/SKILL.md)、[docs/platform/PLUGIN-DEVELOPMENT.md](../../docs/platform/PLUGIN-DEVELOPMENT.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/platform/PLUGIN-DEVELOPMENT.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
