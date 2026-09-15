# MOLIS_WORK-INSTALLATION-CORE-CLEANUP

## 背景与目标

当前 `molis-work install` 已经把程序、Skill 和启动器放到 `~/.molis-work`，但 release 中的 `node_modules` 仍是指向安装源的符号链接。源码目录被删除、移动或清理后，已安装 Molis Work 会失效。同时仓库还保留 `trick.json`、`molis-work project-setup`、postinstall 复合 MCP 以及 `enable/start` 项目语义，形成与“基础安装 + 用户显式 Runtime 接入 + 项目管理”相冲突的第二套产品路径。

本 Work Item 要把基础安装收敛成唯一、自包含、可修复的实现，并删除旧安装/项目设置逻辑。

## 当前行为和问题证据

- `src/install/home.ts` 使用 `fs.symlink(source.nodeModules, release/node_modules)`，已安装 release 依赖源码目录。
- `trick.json` 直接把仓库 Skill 链到 Runtime，并继续展示 `.molis-work/board.db` 和 `molis-work-web --db` 的旧用法。
- `src/install/postinstall-project-selection.ts`、`molis-work project-setup` 和 `molis_work_v1_postinstall_project_selection` 同时承载 `create/import/enable/start`，把项目创建、Session 绑定和服务启动混成“安装后动作”。
- `molis-work install` 默认打印原始 JSON；安装结果仍返回 `post_install` 四动作提示。
- `~/.molis-work/config/postinstall-project-selections/` 可能保留这套已废弃流程的幂等记录。

## 范围

- 把 `dist/`、`skills/` 和运行依赖复制进版本化 release，release 不得包含指向安装源的依赖链接。
- 升级 release manifest schema；同版本的 Molis Work v1 旧 release 自动进入 repair，不与未知用户目录混淆。
- 保持现有 staging、promote、manifest 和 launcher 回滚语义。
- `molis-work install` 默认输出简短人类可读结果；`--json` 返回完整结构化结果。
- 安装结果明确说明没有创建项目、没有修改 Runtime 配置、没有修改用户项目，并给出三个稳定启动器。
- 删除 `trick.json`、postinstall project selection 模块、CLI `project-setup`、Runtime MCP 复合工具、对应测试和已失效 spec。
- 从 README、PRODUCT、Skill、协议和帮助中删除 `enable/start` 与 postinstall 复合流程，只保留普通 context/project 服务。
- 一次成功安装后删除 Molis Work 自己的 `config/postinstall-project-selections` 遗留目录，并在结果中报告。

## 非目标

- 不实现 Codex/Claude/Cursor 的具体配置适配器。
- 不实现 `/setup` 或 `/settings/*` Web 页面。
- 不改变项目 catalog、当前 Session 绑定、Goal 数据或 Runtime config service 的领域行为。
- 不自动启动 Web、MCP 或项目，不自动修改任何 Runtime 用户配置。
- 不在这一项中完成 Skill 的整体口吻和澄清流程重写；只删除已经不存在的工具说明。

## 用户与调用场景

1. 用户在 npm/pnpm 安装后的包目录运行 `molis-work install`，看到安装位置、三个入口和安全边界。
2. 自动化运行 `molis-work install --json --home <temp-home>`，读取结构化结果。
3. 用户删除或移动安装源后，`~/.molis-work/bin/molis-work`、`molis-work-mcp` 和 `molis-work-web` 仍从 release 自己的依赖启动。
4. 已经装过 v1 链接式 release 的用户再次运行同版本安装，安装器原地 repair 为自包含布局。
5. 安装失败时，旧 manifest、旧可用 release、项目 DB 和用户文件保持不变。

## 方案与关键决策

### 自包含 release

`inspectSource` 继续要求安装源已经具备 `dist/`、`skills/` 和 `node_modules/`。`createRelease` 把完整依赖树复制到 staging；为了兼容 pnpm，保留依赖树内部的相对链接结构，但复制后遍历所有链接并拒绝任何绝对链接或指向 release 外部的相对链接。真实发行包安装后，包目录只含生产依赖；本地仓库 dogfood 可能复制开发依赖，但不改变正确性。

release manifest 升级为 schema 2，并记录 `dependencies: "embedded"`，不再记录 `source_directory`。`inspectRelease` 对同 installer、同 version 的 schema 1、缺失 embedded 标记或符号链接依赖返回 `repairable`；未知 installer/version 仍拒绝覆盖。

### 唯一安装结果

`MolisWorkHomeInstallResult` 删除 `post_install`，新增：

- `runtime_layout: "self_contained"`
- `next_steps.message`
- `next_steps.web_command`（argv 数组，不拼接可执行 shell 字符串）
- `removed_paths`

CLI 默认格式化这些字段；只有 `--json` 输出 JSON。

### 删除旧逻辑

项目创建/导入继续由 project catalog 和现有 context MCP 提供；Session 绑定继续使用 `context_bind`/`context_create_and_bind`。删除 postinstall 模块不会删除这些领域服务。

`config/postinstall-project-selections` 是 Molis Work 自己生成、且只服务已删除流程的记录。成功激活安装 manifest 后再删除它；失败回滚不依赖这批无效记录。

## 输入、输出与依赖

- 输入：构建完成的 package root、目标 Molis Work home、可选版本。
- 输出：版本化自包含 release、三个 launcher、installation manifest、结构化安装结果。
- 依赖：Node.js `fs.cp`、现有 atomic write/promote/rollback 帮助函数。
- 后续消费者：Runtime integration service 使用安装结果中的稳定 launcher；设置 UI 展示同一安装状态。

## 文件与模块边界

- `src/install/home.ts`：唯一基础安装服务、自包含 release、旧 release repair、遗留记录清理。
- `src/cli/main.ts`、`src/v1/cli.ts`：唯一公开安装 CLI 和帮助。
- `src/mcp/server.ts`：移除 postinstall 复合工具，不改其他 Runtime/management 能力。
- `tests/install.test.ts`：安装、修复、回滚、无副作用和删源启动验收。
- `tests/mcp.test.ts`：确认旧工具不再暴露，其他 Runtime 工具不回归。
- `README.md`、`PRODUCT.md`、`skills/goal-advance/*`：删除已失效路径。
- 删除：`src/install/postinstall-project-selection.ts`、`tests/postinstall-project-selection.test.ts`、`specs/postinstall-project-selection/spec.md`、`trick.json`。

## 验收标准

- 安装 release 的 `node_modules` 是实际目录而非符号链接。
- 删除 fixture 安装源后，CLI、MCP 和 Web launcher 均能读取 release 内 dependency 并成功退出。
- 同版本 schema 1/symlink release 可自动 repair；未知 release 仍拒绝覆盖。
- 失败注入后旧 release、manifest、项目数据和非 Molis Work 文件保持不变。
- 默认 CLI 输出不再是原始 JSON；`--json` 可稳定解析完整结果。
- 基础安装只修改指定 Molis Work home。
- 仓库不再包含 postinstall project selection 产品入口、`project-setup`、`molis_work_v1_postinstall_project_selection`、项目 `enable/start` 语义或 `trick.json`。
- Runtime MCP 的 context、Available、Draft、Goal Tree、执行和回收站接口继续通过测试。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/install.test.ts tests/mcp.test.ts
pnpm test
pnpm pack --dry-run --json
rg -n 'molis_work_v1_postinstall_project_selection|molis-work project-setup|kind: "enable"|kind: "start"|创建、导入、启用或启动' src skills README.md PRODUCT.md package.json --glob '!dist/**'
```

最后一个搜索期望无结果。旧目录名只允许保留在安装器的一次性清理代码和对应回归测试中；历史需求书只能把它描述为已删除事实，不能再指导产品行为。

## 假设与开放问题

- 当前唯一生产依赖是 `better-sqlite3`；从安装源复制完整 `node_modules` 是首版最可靠的离线自包含方案。发行体积优化留给独立后续工作。
- `molis-work install` 的 UI 设置入口会在后续 `MOLIS_WORK-SETUP-CONTROL-UI` 实现；本 Work Item 不输出尚不存在的 URL。
- Runtime adapter 会在后续 Goal 使用绝对 launcher，不要求基础安装修改任何 Runtime 配置。
