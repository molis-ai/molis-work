# 产品重命名：GoalBoard → Molis Work

状态：已执行。完成等级 3（功能可用）。GitHub 已改为 `molis-ai/molis-work`。代码未提交、未发布 npm。后续活身份兼容已拆除，见 `specs/archive/drop-goalboard-identity/spec.md`。

## 目标

对外产品名改为 **Molis Work**。标识、命令、本机目录、MCP、npm、GitHub 仓库一并改成新身份。领域词 **Goal / Goals / goal_id** 不动。

## 当前行为

产品、App、CLI、默认 Home `~/.goalboard`、环境变量 `GOALBOARD_*`、MCP `goalboard_v1_*`、npm `@adeptify/goalboard-*`、bundle `com.adeptify.goalboard`、插件合同 `io.goalboard.*`、GitHub `molis-ai/GoalBoard` 都还叫 GoalBoard。用户已有数据在 `~/.goalboard` 和各项目 `goalboard.db`。

## 范围与非目标

范围：仓库内产品身份、用户可见文案、安装/启动/MCP/桌面、本机 Home 与项目库迁移、Runtime 配置写入、GitHub 仓库名与 README 链接。

非目标：不改 Goal 领域模型；不重做视觉；不发布 npm；不改本机工作区文件夹路径 `/Users/yijunwang/code/goalboard`；不改 `vendor/` 里独立 Adeptify 包；历史 spec 目录名可保留。

## 身份表

| 用途 | 新值 | 旧值（只作兼容） |
| --- | --- | --- |
| 显示名 | Molis Work | GoalBoard |
| App | Molis Work.app | GoalBoard.app |
| 短名 / CLI | `molis-work`, `molis-work-mcp`, `molis-work-web` | `goalboard`, `goalboard-mcp`, `goalboard-web` |
| Home | `~/.molis-work` | `~/.goalboard` |
| 项目库文件 | `molis-work.db` | `goalboard.db` |
| 环境变量 | `MOLIS_WORK_*` | `GOALBOARD_*` |
| MCP 工具 | `molis_work_v1_*` | `goalboard_v1_*` |
| MCP server 键 | `molis-work` | `goalboard` |
| npm | `@molis-ai/molis-work*` | `@adeptify/goalboard*` |
| 插件/合同 | `io.molis.work.*` | `io.goalboard.*` |
| bundle / LaunchAgent | `com.molis.work` / `com.molis.work.web` | `com.adeptify.goalboard` / `.web` |
| GitHub | `molis-ai/molis-work` | `molis-ai/GoalBoard` |
| 演示 board_id | 保持 `goalboard-v1-demo` | 已写入用户库，不改值 |

## 方案

1. 机械替换产品身份（按长短前缀，避开 Goal 领域词和 `goalboard-v1-demo`）。
2. 默认 Home：无 `MOLIS_WORK_HOME` / `GOALBOARD_HOME` 时，若 `~/.molis-work` 不存在且 `~/.goalboard` 存在，则 rename 过去，并在旧路径留 symlink，让已有绝对路径还能打开。
3. 打开项目时若仍是 `goalboard.db`，rename 为 `molis-work.db` 并更新 catalog 路径。
4. 读环境变量、HTTP 头、LaunchAgent receipt、MCP 工具名、插件 ID、Runtime `mcp_servers.goalboard` 时接受旧名；新写入只用新名。macOS Keychain 先读 `com.molis.work.feed.secretstore`，没有再读 `com.adeptify.goalboard.feed.secretstore`。密钥派生 salt 保持 `goalboard-feed-secretstore-v1`。
5. 已装 Skill / Codex / Claude 配置：升级安装时把 `mcp_servers.goalboard` 迁成 `molis-work`，并继续识别旧键。Home 安装继续写入 `goalboard*` 启动器别名，避免未重接 Runtime 时命令路径失效。
6. GitHub：`gh repo rename molis-work`，更新 remote 与文档链接。
7. 安装或首次打开 `Molis Work.app` 时，把 bundle id 为 `com.adeptify.goalboard` 的 `GoalBoard.app` 从用户 Applications 和 `/Applications` 移入废纸篓。同名但不是这个 bundle 的包不动。旧 App 的 bundle id 不会就地改写。
8. 打开项目目录时，若可重建示例项目仍叫 `GoalBoard 示例项目` / `GoalBoard Demo`，改成 `Molis Work 示例项目`；用户改过的名字不动。
9. 工作模式、work tabs、workspace split 的 localStorage 先读新键，没有再读 `goalboard-` 旧键。
10. GitHub Releases 链接使用 `https://github.com/molis-ai/molis-work/releases`。

## 验收

- 界面、窗口、CLI 帮助不再出现 GoalBoard 作为产品名。
- `pnpm desktop:install:macos` 或打开新 `Molis Work.app` 后，已确认归属的 `GoalBoard.app` 不留在 Applications。
- 可重建示例项目的官方默认名不再显示 GoalBoard；用户自定名保留。
- README / 安装文档的 GitHub Releases 指向 `molis-ai/molis-work`。
- 新安装默认写入 `~/.molis-work` 与 `molis-work.db`。
- 已有 `~/.goalboard` 在未设 Home 覆盖时迁到 `~/.molis-work`，项目仍能打开。
- `MOLIS_WORK_HOME` 优先；未设时仍读 `GOALBOARD_HOME`。
- MCP 新名可调用；旧 `goalboard_v1_*` 仍可调用同一实现。
- 包名、import、workspace 边界检查通过。
- `pnpm --filter` 与定向测试覆盖 home 迁移、项目库文件名、MCP 别名。

## 验证

```
node --import tsx --test --test-concurrency=1 tests/rename-molis-work.test.ts tests/install.test.ts tests/project-catalog.test.ts tests/mcp-protocol.test.ts
pnpm --filter @molis-ai/molis-work-test-kit build && node scripts/check-package-boundaries.mjs
```

GitHub 改名单独验证 `gh repo view molis-ai/molis-work`。

## 假设

- npm scope 用 GitHub org `@molis-ai`。
- 旧 MCP 名只作为别名，新 Skill 和文档用新名。
- 本机已装 `GoalBoard.app` 的 bundle id 不会就地改写；安装或打开 `Molis Work.app` 时把已确认归属的旧包移入废纸篓。LaunchAgent 由服务安装路径换成新 label。
