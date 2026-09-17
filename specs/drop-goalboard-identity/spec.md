# 拆除 GoalBoard 活身份

## 背景目标

产品只叫 Molis Work。GoalBoard 改名时留下的兼容层（环境变量、HTTP 头、MCP 别名、启动器、localStorage、存盘 origin/source、Home/db 改名、旧 owner 改写）全部去掉。用户明确：不用担心已有库，不要兼容逻辑。

完成等级 **3：功能可用**。不发布。

## 当前行为与问题证据

- 现行入口已不把 GoalBoard 当产品名。
- 打开时仍改写旧 owner / origin / source，仍 rename `~/.goalboard` 和 `goalboard.db`，仍认旧启动器、LaunchAgent、Keychain、MCP leftover。

## 范围与非目标

做：

- 只认 `MOLIS_WORK_*`、`x-molis-work-*`、`molis_work_v1_*`、`molis-work/sessionId`、`io.molis.work.*`、`molis-work:` / `molis-work-` 存储键。
- 默认 Home 只落 `~/.molis-work`；项目库文件只认 `molis-work.db`。
- 安装只写 `molis-work` / `molis-work-mcp` / `molis-work-web`。
- Catalog / Session Registry / 安装清单 / Runtime 接入 / Web 服务只认现行 owner 与 label。
- Feed origin、Session source 只使用 `molis_work` / `molis_work_tui`，打开时不改写旧值。
- Runtime 接入只读写 `mcp_servers.molis-work` / `mcpServers["molis-work"]`。
- 演示 `board_id` 改为 `molis-work-v1-demo`。
- 桌面 App 不读 `GOALBOARD_*`，不找旧启动器。
- Keychain 只读现行 service。
- 插件 Manifest 不接受 `io.goalboard.*`。
- 安装脚本和桌面 App 启动时不认 `GoalBoard.app` / `com.adeptify.goalboard`。

不做：

- 不改本机仓库路径、历史 spec 目录名、Goal / Goals 领域词。
- 不改密钥派生 salt 字符串 `goalboard-feed-secretstore-v1`（这是加密参数，不是库兼容）。
- 历史 SQL dump 保持原样。
- 不查找、不移动 `GoalBoard.app`。安装和打开只处理 `Molis Work.app`。

## 使用场景

1. 只设 `GOALBOARD_*` 时，进程不当成 Molis Work 配置。
2. 旧 owner 的 catalog / Session Registry 打开时按未知库拒绝。
3. 调用 `goalboard_v1_goal_list` 不是现行工具。
4. 新演示项目的 board_id 是 `molis-work-v1-demo`。

## 方案与关键决策

兼容从「打开时改写」改成「根本不认」。已有 GoalBoard 库、Home、密钥、LaunchAgent 不会被迁移或接管。

## 验收

1. `readProductEnv` 与桌面 App 不读 `GOALBOARD_*`。
2. 不 rename `~/.goalboard` / `goalboard.db`，不建 symlink。
3. 不改写旧 catalog/session owner、Feed origin、Session source。
4. 不删、不认 `mcp_servers.goalboard` 和旧启动器名。
5. 新演示 `board_id` 为 `molis-work-v1-demo`。
6. 安装和打开 App 不查找、不移动 `GoalBoard.app`。
7. 定向测试通过。

## 验证

```bash
pnpm exec tsx --test --test-concurrency=1 \
  tests/rename-molis-work.test.ts \
  tests/install.test.ts \
  tests/mcp-protocol.test.ts \
  tests/runtime-integration.test.ts \
  tests/feed.test.ts
```
