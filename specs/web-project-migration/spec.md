# Web Project Migration

## 背景与目标

项目化 Web 已能浏览受管理项目，但已有单独 Molis Work DB 还不能从 Web 迁入项目目录。用户需要一次显式、可理解的迁移入口，迁移后继续按项目名浏览同一份 Goal、Run、Evidence 与历史。

目标是在项目选择页提供一个明确确认的旧 DB 迁移流程，并只复用 `MolisWorkProjectCatalog.migrateLegacyDatabase()` 这一份 canonical 迁移服务。

## 当前行为与问题证据

- `MolisWorkProjectCatalog` 已有校验、复制、快照验证、目录提交和失败回滚的迁移服务。
- 普通 Web 项目列表页不会创建项目，这一边界需要保留；目前也没有任何迁移入口。
- 项目切换页已经有目录模式和项目特定路由，适合作为迁移成功后的落点。

## 范围与非目标

范围：

- 项目列表页的“迁移已有 Molis Work 数据”入口、来源 DB 输入、单独确认和成功／失败反馈。
- 根级 Web API 调用既有 `MolisWorkProjectCatalog.migrateLegacyDatabase()`，成功后返回项目路由。
- 成功迁移后刷新／跳转到新项目；测试显式确认、事实保留、失败不移动来源和无 Runtime binding 写入。

非目标：

- 自动扫描本机 DB、未确认文件移动或默认迁移。
- 在项目内页面显示来源 DB 路径作为日常项目上下文。
- 创建、解绑或重绑 Runtime Session；项目删除与新的 DB 搬迁实现。

## 用户场景

1. 用户打开项目选择页，主动打开迁移入口，填写一份已有 Molis Work DB 和可选项目名，勾选确认后迁移。
2. 成功时页面跳到 `/projects/<project_id>/`，只显示迁移后的项目名；旧来源 DB 已由 canonical 服务转入 Molis Work 管理目录。
3. 未勾选确认、来源不存在或来源不是有效 Molis Work DB 时，页面给出可重试错误；不创建项目、不移动来源，也不改变 Runtime binding。

## 方案与模块边界

- `src/web/render.ts`：项目列表页加入迁移操作、原生确认对话框、失败提示和成功跳转；来源路径只在这次迁移表单中出现。
- `src/web/server.ts`：项目列表根路径处理 `POST /api/projects/migrate`；验证用户确认，再调用 catalog 迁移服务。Web 命令只按项目启动，不接受数据库路径作为用户入口。
- `src/projects/catalog.ts`：不修改迁移实现；它继续是唯一搬迁／回滚边界。
- `tests/web.test.ts`：覆盖未确认、成功事实等价、无绑定写入、无效来源失败与 UI 入口。

## 验收标准

1. 未确认请求不会调用迁移服务，不移动来源 DB，也不创建项目记录。
2. 有 Goal、Claim、Run、Evidence 的合法旧 DB 经确认迁移后，项目事实快照保持等价；新项目可从项目路由打开。
3. 迁移失败时来源文件和已有项目目录保持原状，页面返回可重试原因。
4. Web 只调用 `MolisWorkProjectCatalog.migrateLegacyDatabase()`；没有第二份复制／移动事务逻辑。
5. 浏览和迁移都不创建或修改 Runtime work-entry binding。
6. Web 页面、启动提示和使用说明只表达“项目”；数据库路径只在本次迁移表单中作为来源输入，不再存在“兼容模式”入口或文案。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/web.test.ts
pnpm test
git diff --check
```

## 假设与开放问题

- Web 运行在用户自己的本机环境；来源路径是用户在一次性迁移表单中明确提供的本机 DB，不是普通项目标识。
- canonical 迁移服务在成功后移走来源 DB，这是已确认迁移的可见后果，确认文案必须明确说明。
- 已确认的产品方向是唯一的项目入口：`--db`、`--board-id` 和 `--demo` 不再是 Web 命令支持的启动方式。

## 实现结果

- 项目列表新增“迁移已有 Molis Work 数据”操作和原生确认窗口；来源 DB 只在本次表单中出现，确认文案明确说明成功后会移入 Molis Work 管理目录，以及失败不会移动来源。
- `POST /api/projects/migrate` 先验证 `user_confirmed`、路径和名称，再仅调用 `MolisWorkProjectCatalog.migrateLegacyDatabase()`；没有新增复制、移动或 Runtime binding 逻辑。成功后返回项目 URL，失败返回可重试原因。
- 项目列表页 CSP 允许本页的本地迁移交互脚本和同源请求，保证迁移窗口能实际打开和提交。
- `molis-work-web` 公开命令只从项目列表启动；`--db`、`--board-id`、`--demo` 会明确拒绝。工作台顶部始终只显示“项目”，不再展示兼容／单数据库模式。
- README 改为项目与 Runtime Skill 为主的使用路径；旧 DB 仅作为显式迁移来源。

## 验证结果（2026-08-16）

- `node --import tsx --test tests/web.test.ts`：19/19 通过，覆盖未确认、无损迁移、失败不移动来源、无 Runtime binding 写入、项目唯一启动路径和 CSP。
- `pnpm typecheck`：通过。
- `pnpm test`：102/102 通过。
- 浏览器检查：桌面与 390px 移动端均确认项目列表和迁移确认窗口可读、可打开；窗口把 DB 限定为一次性来源输入，不出现兼容模式。
