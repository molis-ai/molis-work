# 发行包全新安装与端到端验收

## 背景与目标

前六个 Work Item 已完成安装核心、Runtime 接入、Web 设置、Session 管理、安全门禁和统一 Skill。现有测试大多从仓库源码或 fixture source 运行，尚未证明用户拿到 npm tarball 后，在没有仓库源码路径的环境里能完成首次使用、重启恢复、升级和移除。

本 Work Item 从真实 pack 产物构造隔离的 npm 安装布局，安装到全新 Molis Work home，删除安装包及其外部依赖后，分别走 Web 与 Runtime MCP 首次使用路径，并验证 README、诊断、升级和 Runtime 接入移除。

## 当前行为与问题证据

- `pnpm pack --dry-run` 的 tarball 不包含 `node_modules`，这是 npm 包的正常行为。
- `installMolisWorkHome` 当前硬要求 `sourceDirectory/node_modules` 并整体复制；从仓库运行可用，但从标准 npm 安装布局运行时，依赖通常在包目录的祖先 `node_modules`，会报 `source.asset_missing`。
- 安装单测使用自建 source fixture 且显式创建 `source/node_modules`，没有覆盖发行包布局。
- 各领域流程已有独立测试，但没有一条测试在安装包目录被删除后同时启动 CLI、MCP 和 Web，并走首次项目/Session/Draft 流程。

## 范围

- 安装器从 package.json 的 production `dependencies` / 可用 `optionalDependencies` 解析递归运行时依赖闭包，不依赖包目录下固定存在 `node_modules`。
- 将依赖包内容平铺复制进 Molis Work release 的私有 `node_modules`，不复制宿主项目的无关依赖，不保留指向安装源的符号链接。
- 保持 fixture 与 pnpm workspace 安装可用；缺少声明的必需依赖时明确失败。
- 新增真实 tarball E2E：打包、隔离 npm 布局、全新 home 安装、删除安装源、CLI/MCP/Web 启动。
- Web 路径：诊断、Runtime plan/confirm、项目创建或旧 DB 迁移；确认前零配置写入。
- Runtime 路径：新 Session resolve 保持未绑定/候选，明确 bind 后创建并开始 Draft dialogue；重启 MCP 后恢复同一项目事实。
- 验证 Runtime integration remove 只移除 owned 内容，升级到受控新 release 后 launchers 继续工作。
- 检查 README 只描述安装本体 + 显式 Runtime/项目流程，没有旧 postinstall/兼容模式/静态 DB 环境路径。

## 非目标

- 不发布到 npm 或 GitHub，不修改真实用户 Runtime 配置。
- 不依赖公网下载；E2E 从当前已安装依赖构造标准“包在子目录、依赖在祖先 node_modules”布局。
- 不覆盖远程、多用户或 Windows 安装。
- 不为测试增加另一套安装器或模拟领域逻辑。

## 用户场景

1. 用户安装 npm 包并运行 `molis-work install`：只写临时 `~/.molis-work`，不创建项目、不改 Runtime 配置。
2. 用户打开 Web：诊断显示完整；Runtime 接入先预览，确认后才写 fake Codex 配置和 Skill，之后可安全移除。
3. 用户在 Web 创建/迁入项目，或在当前 Runtime Skill 中选择项目；两条入口写入同一 catalog。
4. 新 Runtime Session 未确认前不绑定；确认后可创建 Draft 并持久化澄清，MCP 重启后仍解析同一项目。
5. 安装包目录被删除或版本升级后，三个 launchers 仍从 Molis Work 私有 release 运行。

## 方案与关键决策

- `inspectSource` 读取生产依赖声明，并通过 Node resolution 从标准 npm/pnpm 布局找到每个 package root。
- 递归收集 dependency/optionalDependency 闭包；必需 dependency 解析失败即中止，optional 缺失可跳过。peer dependency 不自动纳入，除非同时由生产依赖闭包实际声明/安装。
- 每个 package 复制到 release `node_modules/<name>`，使用 `dereference=true` 消除 pnpm/source symlink；同名 package 版本冲突若出现则明确失败，不静默覆盖。当前生产闭包应能平铺。
- E2E 使用真实 tarball 的 Molis Work package 内容，并把当前 workspace 已安装的直接生产依赖放在祖先 `node_modules`，模拟标准 npm hoist；安装完成后删除整棵安装源。
- Web 测试读取同源页面 token 并按正式 header 门禁调用，不使用测试专用绕过。

## 输入、输出与依赖

- 输入：真实 pack tarball、package production dependencies、临时 HOME/PATH、fake Runtime executable。
- 输出：自包含 release、E2E 测试证据、README 路径检查。
- 依赖：Node `createRequire`/filesystem、现有 installer/catalog/MCP/Web。

## 文件与模块边界

- `src/install/home.ts`：生产依赖闭包解析和 release 复制。
- `tests/install.test.ts`：标准祖先 node_modules 与依赖错误单测。
- `tests/e2e.test.ts`：真实 tarball 首次使用、重启、升级、移除。
- `package.json`：把 E2E 纳入正式 test。
- `README.md`：修正并最终核对唯一安装/设置路径。

## 验收标准

- tarball 安装源不含自己的 `node_modules` 时，仍可从祖先标准安装依赖生成自包含 release。
- 删除 tarball 解包目录与祖先依赖后，CLI/MCP/Web launchers 均退出/响应正常。
- 安装、页面打开和 Runtime detect/plan 不创建项目、不绑定 Session、不改 Runtime 配置；只有对应确认写入。
- Web 与 Runtime 路径能创建/选择同一 catalog 项目，首次 Session 明确确认后创建并恢复 Draft dialogue。
- Runtime 接入移除、受控升级和 README 示例验证通过。
- 完整测试、Skill validator、pack dry-run 均通过。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/install.test.ts tests/e2e.test.ts
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm test
pnpm pack --dry-run
```

## 假设与开放问题

- 首版生产依赖闭包没有需要并存的同名多版本 package；若 E2E 发现冲突，应增加 Node-compatible nested layout，而不是选择任一版本覆盖。
- 原生依赖按当前已安装平台复制；跨平台发布仍需要各目标平台自己的标准 npm 安装过程。
