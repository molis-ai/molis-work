# 首页服务

项目首页与生成页面的平台主人（[场景与生成页面公共合同](../../specs/scene-and-page-contract/spec.md) §6）：管理每个项目的首页选择（基础首页或某版生成页面）、生成页面的不可变版本、按 SHA-256 摘要存储与核验的文件正文、版本对比、设计语言检查，以及本人批准采用／恢复的不可伪造回执。

包名：`@molis-ai/molis-work-service-home`。工作区内部包，由 Host 装配进 `system.home` 的八个公开动作（`homePageActions`：`home.read@1`、`home.pages.drafts.save@1`、`home.pages.preview@1`、`home.pages.adopt@1`、`home.pages.restore@1`、`home.select@1`、`home.pages.diff@1`、`home.pages.files.read@1`），不拥有任何插件的业务事实。

## 存储

独立 Home 级 SQLite 库 `home-pages/home-pages.db`（`HOME_PAGES_HOME_STORE`，基线版本 1），所有表按 `project_id` 分区隔离，删项目时经 `purgeHomePagesProject` 原子清理：

- `home_selections`：项目当前首页选择与修订凭据（`revision`）
- `home_page_versions`：页面不可变版本元数据（标题、入口、声明动作、文件清单与 SHA-256 摘要、作者、`based_on`、来源）
- `home_page_blobs`：按 `(project_id, sha256)` 存的 UTF-8 文件正文
- `home_page_approvals`：每版获准动作集合、批准时间与操作者
- `home_page_receipts`：草稿采用、批准采用／恢复、切回基础首页的幂等原回执
- `home_page_pruned`：因超过每页 20 版上限而被清理的旧版本号记录

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24.15.x 与仓库配置的 pnpm。

```bash
pnpm --filter @molis-ai/molis-work-service-home typecheck
pnpm --filter @molis-ai/molis-work-service-home build
```

## 开发要求

- 负责：生成页面的版本存储与保留（每项目最多 20 页、每页最多 20 版，保护在用版、`based_on` 与上次获准版）、文件 SHA-256 写入与读前复算、草稿静态校验与设计语言检查、CAS 与请求幂等回执、版本差异、顶层本人批准边界检查。
- 不负责：插件卡片的组合规则（归 `horizontal/surfaces`）、业务对象的真实读写（归各插件）、不透明 `srcdoc` 框架与页面会话记录（归宿主 `plugin-page-authority.ts` 与工作台 `plugin-frame`）。
- 公开入口：`@molis-ai/molis-work-service-home`（`src/index.ts`，经 `dist` 导出）；合同 `@molis-ai/molis-work-contracts/services/home`、`@molis-ai/molis-work-contracts/platform/actions`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与存储，不依赖宿主或任何插件（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 文件送出前必按 UTF-8 逐个重算 SHA-256，一处不符即以 `home.page_file_mismatch` 整版拒出，且页面主体不可调 `home.pages.files.read@1`（`S-home-page-files`）。
  - 页面声明与获准的动作须显式包含 `plugin` 受众且在当前项目动作目录中可达；草稿保存与复用绝不改变当前首页选择或授予批准。
  - `home.pages.adopt@1` 与 `home.pages.restore@1` 只接受无上一层动作的本人直接调用（拒绝代理、插件、页面主体与 `blueprints.adoption.*` 嵌套调用），换版或切回基础首页立即通知宿主作废旧页面会话（`S-home-page-approval`）。
- 改动后必跑：`node scripts/run-tests.mjs tests/home-page-contract.test.ts tests/home-pages-service.test.ts tests/home-pages-security.e2e.test.ts`；改了合同跑 `pnpm api:update`、`pnpm actions:update`，改了库结构跑 `pnpm schemas:update` 与 `pnpm versions:generate`。
- 相关手册：[specs/scene-and-page-contract/spec.md](../../specs/scene-and-page-contract/spec.md) 第 6 节；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
