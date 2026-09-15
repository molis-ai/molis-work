# Web Project Switcher

## 背景与目标

现有 Web Server 启动时直接接收一个 SQLite 路径和 `board_id`，顶部把数据库文件名显示成“数据源”。这暴露了 Molis Work 的内部存储概念，也无法让用户从同一个 Web 入口浏览多个已启用项目。

目标是让正常 Web 使用 Molis Work 自己维护的项目目录：用户先看到项目名称并选择项目，之后只在该项目的 Goal Tree 与 API 中工作。数据库和 Board ID 只在服务端内部解析。

## 当前行为和问题证据

- `src/web/server.ts` 的 `WebServerOptions` 强制接收 `databasePath` 与 `boardId`；每个请求都只能打开这一个数据库。
- `buildMolisWorkWebView()` 将数据库文件名作为 `source_label`，并把完整 `database_path` 放入 Web View。
- `MolisWorkProjectCatalog` 已经负责项目名称、项目 ID、内部 DB 路径及 Runtime Session 绑定；Web 还没有复用它。
- 前端链接与 API 路径都是根路径，不能安全表达“当前浏览的是哪个项目”。

## 范围与非目标

范围：

- 默认 Web Server 从 Molis Work 项目目录读取项目列表，显示项目名称、项目选择入口和无项目空状态。
- 已选项目使用稳定的项目特定 URL；Goal 页面、归档、回收站、决定中心和 API 都路由到该项目内部 DB。
- Web View 与正常页面不再把数据库路径、数据库文件名或 `board_id` 当成用户的项目上下文或切换信息。
- 保留 `--db` 的显式单数据库兼容/调试入口；它不成为默认日常入口。
- 更新 Web 使用说明和覆盖两个项目隔离、无绑定写入及无项目空状态的测试。

非目标：

- 不创建、启用、删除或迁移项目；旧 DB 迁移在 `MOLIS_WORK-WEB-PROJECT-MIGRATION` 单独处理。
- 不读取、创建、解绑或重绑 Runtime Session/work-entry 绑定。
- 不在用户项目目录写入配置。
- 不修改 Goal Board 领域行为或重新设计现有 Goal 工作台。

## 用户与调用场景

1. 用户打开普通 Web 入口，看到“选择项目”；选择“产品 A”后进入 `/projects/<id>`，只看到产品 A 的 Goal。
2. 用户复制项目特定 Goal URL 给自己后，重新打开仍进入同一项目的同一 Goal，而不需要知道 DB 或 Board ID。
3. 用户浏览项目 A、切换项目 B、在 A 中新建 Draft Goal；B 的 Goal 和所有 Runtime Session 绑定保持不变。
4. 还没有项目时，Web 明确说明要在当前 Runtime 中用 Skill 创建、连接或迁移项目；页面不会替用户创建项目。
5. 维护者需要排查旧单 DB 时显式传入 `--db`，原有单库路由仍可使用。

## 方案与关键决策

1. 将 Web 启动分为两种明确模式：无 `--db` 时是项目目录模式；显式 `--db` 时是兼容单数据库模式。
2. 每个目录模式请求短暂打开 `MolisWorkProjectCatalog`，只调用 `listProjects()` / `getProject()`，取得项目内部连接后立即关闭目录；不调用任何绑定或生命周期写方法。
3. 选中项目后服务器剥离 `/projects/<project_id>` 前缀，再复用现有单 Board 路由和 Coordinator；由一个 `route_prefix` 统一生成页面链接、前端 API 调用和浏览器跳转。
4. 项目选择页是轻量项目列表而非自动跳转或项目创建向导；空状态明确指向 Runtime Skill。
5. 保留现有高密度 Goal workbench 的视觉语言，只把顶部“数据源”改为项目名称与“切换项目”入口。

## 模块边界

- `src/web/server.ts`：项目目录模式、项目 URL 解析、内部 DB/Board 路由、兼容模式 CLI 分流。
- `src/web/render.ts`：项目选择页、顶部项目上下文、带前缀的本地链接和客户端 API/跳转路径。
- `tests/web.test.ts`：两个项目的路由隔离、页面无 DB 语义、浏览无绑定写入、无项目空状态、单 DB 回归。
- `README.md`：默认项目入口与显式单 DB 调试入口说明。

## 验收标准

1. 普通项目目录入口显示项目名及项目选择；正常 HTML 和 `/api/board` 不输出数据库路径或文件名作为项目切换信息，且不要求用户提供 `board_id`。
2. 两个项目各有不同 Goal 时，项目特定页面和 API 的读取、创建操作只影响所选项目。
3. Web 浏览或切换项目后，已有 Runtime work-entry 的目录绑定解析结果完全不变。
4. 空项目目录只显示下一步说明，不创建项目、项目 DB 或 Runtime 绑定。
5. 显式 `--db` 兼容模式与已有 Web 测试保持可用。

## 验证

```bash
node --import tsx --test tests/web.test.ts
pnpm typecheck
pnpm test
git diff --check
```

## 假设与开放问题

- 项目目录数据库由 Molis Work 自己拥有；打开目录以读取项目列表不等于创建或启用用户项目。
- 旧 DB 的可确认迁移 UI 留给下一条已确认叶子 Goal，不能在本改动中偷偷加入文件移动。

## 实现结果

- 正常 Web Server 改为项目目录模式；只有显式传入 `--db` 时才进入单数据库兼容模式。
- 项目列表、空状态和项目特定 URL 均已落地；所选项目的 DB 与 Board 只在服务端解析。
- 现有页面、客户端 API、跳转和静态本地链接都复用同一个项目路由前缀；项目切换不调用任何 Runtime 绑定写接口。
- 项目内顶部显示项目名与“切换项目”，窄屏也保留紧凑项目名；不再显示数据库文件名或路径。
- README 已说明默认项目入口与 `--db` 兼容入口的边界。

## 验证结果（2026-08-16）

- `pnpm typecheck`：通过。
- `node --import tsx --test tests/web.test.ts`：16/16 通过，其中新增项目目录隔离、无绑定写入、空目录测试。
- `pnpm test`：99/99 通过。
- `git diff --check`：通过。
- 本地浏览器检查：项目列表、桌面项目上下文和 390px 宽度下的项目名／切换入口均可见。

## 后续产品收敛（2026-08-16）

用户确认 Web 只有一个正确入口：项目列表。因而已移除公开 Web 命令中的 `--db`、`--board-id` 和 `--demo` 启动路径，并从页面、启动提示和 README 中移除“兼容模式／单数据库模式”概念。数据库只作为项目的内部存储，或在一次性迁移表单中作为用户明确提供的来源；不再是浏览项目的模式选择。
