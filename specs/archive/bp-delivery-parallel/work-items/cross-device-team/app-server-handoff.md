# 独立启动器与资产迁移交接

2026-09-26。公共core已先行接入主树，本批不重放其实现。来源工作树 `/Users/yijunwang/.codex/worktrees/573f/goalboard`，分支 `feature/cross-device-team`。只复制下列路径，不拷贝全量工作树、dist、node_modules、pnpm-lock 或继承基线。

## 精确文件

- `apps/server/package.json`、`apps/server/tsconfig.json`、`apps/server/README.md`
- `apps/server/src/index.ts`、`main.ts`、`gateway.ts`、`admin-grants.ts`、`assets.ts`
- `server/tooling/continuity-demo.mts`
- `tests/cross-device-continuity.test.ts`、`tests/cross-device-gateway.test.ts`、`tests/cross-device-launcher.test.ts`
- `server/README.md`（本批更新真实已交付启动器、目标项目新ID/源ID映射及验证命令，保留Status/Contract/Migration metadata）
- 本目录spec.md、core-handoff.md、app-server-handoff.md、verification.md与logs/*.log

保留主树Thread owner的 `server/src/im/**`、`packages/im-ui/**` 及其本地Host/navigation adapter；本批不覆盖它们。公共core行为自前次冻结后未再改变，index/README metadata已与Thread owner协调同步。

## Builder依赖增量

包名 `@molis-ai/molis-work-app-server`；path `apps/server`，kind `app`，contract `@molis-ai/molis-work-contracts/platform/app-host`，maturity `partial`，migrationGoals `[goal-reorg-f2]`。src/index.ts含匹配packageDescriptor，README含Status/Contract/Migration。

WORKSPACE_PACKAGES新增apps/server条目，extraWorkspaceDependencies为：

- `@molis-ai/molis-work-server`
- `@molis-ai/molis-work-storage`
- `@molis-ai/molis-work-app-local-host`
- `@molis-ai/molis-work-im-ui`
- `@molis-ai/molis-work-app-desktop`
- `@molis-ai/molis-work-plugin-runtime`

contracts为原inventory生成器基础依赖，本包manifest已显式列出。没有新第三方包。apps/*已在workspace glob/filter中，不另加根脚本。由Builder在当前主树重算最小apps/server importer，链接分别为 `../../server`、`../../packages/contracts`、`../../packages/storage`、`../local-host`、`../../packages/im-ui`、`../desktop`、`../../packages/plugin-runtime`。

app-desktop只复用公开Catalog adapter，注入真实panel schema/repository；不启动窗口/原生桥，不复制Catalog。plugin-runtime只读原安装记录，提示所需plugin id/version是否可用；不创建第二套Runtime。core只依赖contracts/storage，因此 local-host→core 与本启动器→desktop→local-host不构成环。

启动器在监听前事务同步当前projects allowlist；移除项目清除所有access并消费旧邀请，保留project/commands历史；重新加入仅恢复owner。编译CLI测试使用重启前cookie和invite，验证移除后的read/write/assets/SSE全部拒绝。

## 恢复行为

`restore`先保存source_project_id→Host允许的独立恢复项目ID映射，再经原Catalog创建正式项目。重试复用目标ID；原Artifact ID/version/content digest/producer由原Artifacts owner校验并注册，正文可以通过正式项目API继续读取。源ID不作为任意目标数据库路径。原Goal仅迁移接续摘要，不冒充原执行历史、权限或完成验收。

## 验证与复现

`verification.md`逐项记录证据/未验证项。日志在本目录 `logs/`；主业务102.6s、Gateway114.2s、最终headless6.4s通过。最后新增原Plugin Runtime安装状态读取后，apps/server tsc与编译CLI测试重新通过；没有重复无关Gateway测试。

```sh
node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json
node --import tsx --test tests/cross-device-launcher.test.ts
node apps/server/dist/main.js serve --state /absolute/state --config /absolute/projects.json --host-home /absolute/existing-home --port 4187
node apps/server/dist/main.js restore --bundle /absolute/assets.json --destination /absolute/new-home
node apps/server/dist/main.js read-assets --destination /absolute/new-home --project SOURCE_PROJECT_ID
```

真实Host启动及授权步骤见server/README.md。CLI启动需已构建依赖；本线不会覆盖主树dist或抢占统一构建窗口。模拟多端、headless、窄屏和真机证据分列；生产主入口与用户验收不在本线证据内。
