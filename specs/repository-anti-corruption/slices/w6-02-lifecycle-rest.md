# W6-02 余项：其余已迁入 Plugin Runtime 的内置插件的生命周期走查（名单、各自的写入读取入口与分片）

状态：已实现，评审中（2026-10-27，分支 `claude/magical-kare-c6b8ec`，线 ac-lifecycle）：共用夹具 `tests/fixtures/shipped-lifecycle.ts` 已从 `tests/shipped-plugin-lifecycle.test.ts` 抽出（RAC-1030～1034 行为不变），十三个插件各走一遍（`shipped-plugin-lifecycle-content.test.ts` RAC-1090～1094、`-personal.test.ts` RAC-1095～1097、`-coding.test.ts` RAC-1099～1103）；置物架（RAC-1098）走查时撞上产品缺陷，其修复在 C 线的文件里，本线不改，退出本轮通过的测试（第 3、4 节，BL-804）；第 5 节三次运行里最后一次四个文件十八项全部通过。

W6-02 的原文（`roadmap-2026-10-07.md` §4.10）：把探针的生命周期（`tests/probe-plugin.test.ts`）延伸到真实已迁的生产者。第一批 Todo、Jelly、Pages、灵光已走完（`tests/shipped-plugin-lifecycle.test.ts`，RAC-1030～1034）；这一片补其余已在 Plugin Runtime 上的内置插件。

## 1. 每个插件走的一遍

一份夹具，每个插件一个一次性 Home，用产品自己的 Host 与网页服务（`serveTestHost`）：

1. 经插件自己的路由写一条带标题的东西，再从它的列表读回；安装记录为 `running`、版本是这一版、信任是 `host`。
2. 从项目里移出：路由与动作被拒（`403 actions.plugin_disabled`，目录里没有它的动作）；加回来，写下的东西还在，安装记录与移出前一模一样（同一个 `install_id`、同一组授权）。移出时安装记录怎样，看插件是不是个人插件：个人插件只是项目够不着，安装继续 `running`；非个人的项目插件（Schedule、Coding、Git、Files、Diff、Text Stats）安装被停成 `disabled`，加回来重新运行（`apps/local-host/src/project-plugin-enablement.ts`，夹具里写作 `stops_when_removed`）。
3. 撤回一项必需权限（默认 `storage:private`，没有自有数据的 Diff、Text Stats 用 `artifact:read`）：启动被拒（`plugin.grant_denied`），路由答 `503 actions.plugin_unavailable`，记录为 `disabled`；权限还回去，带着数据重新运行。
4. 升级：关掉 Host，把安装记录改写成旧版本与旧摘要，重开后同一份安装（同一个 `install_id`）移到这一版，数据还在。
5. 卸载：记录为 `uninstalled`，路由答 `404 actions.missing`，目录里没有它的动作；再重启一次，监督器不再把它装回来。

走查中摸清的两处依赖：Text Stats 需要 Files，Files 又嵌入它，所以从项目里拿掉它只能拿掉 Files（夹具里 `removed_by: "files"`），加回 Text Stats 会把 Files 一并带回；Coding 嵌入 Files、Git、Diff、Text Stats，这几个都要先加入项目才有（`joins`）。

## 2. 名单与各自的入口

名单来自 `apps/local-host/src/plugin-registry.generated.ts` 的 24 份登记。范围外的不在表里：Feed、Inbox（C 线 `feature/anticorruption-closeout-c`）、Goals（BL-756，C 线与 W5-10 仍在改它）、Alchemist 与插件创作台（绕过，BL-376、BL-377）、成果库（PG-077 第二步）；置物架见第 3 节。

| 插件 | `plugin_id`／项目键 | 谁来运行 | 写入（经插件自己的路由） | 读回 | 测试 |
| --- | --- | --- | --- | --- | --- |
| 数据表 Dataset | `io.molis.work.dataset`／`dataset` | 项目监督器，加入项目才有（`joins`） | `POST /datasets` `{title}` | `GET /datasets` → `datasets[].title` | RAC-1090 |
| 演示稿 PPT | `io.molis.work.ppt`／`ppt` | 项目监督器，`joins` | `POST /ppt` `{title}` | `GET /ppt` → `presentations[].title` | RAC-1091 |
| 问卷 Form | `io.molis.work.form`／`form` | 项目监督器，`joins` | `POST /forms` `{title}` | `GET /forms` → `forms[].title` | RAC-1092 |
| 工作流程 Workflows | `io.molis.work.native.workflows`／`workflows` | 项目监督器，`joins` | `POST /workflows` `{title}` | `GET /workflows` → `workflows[].title` | RAC-1093 |
| 定时任务 Schedule | `io.molis.work.schedule`／`schedule` | 项目监督器，新项目默认就有 | `POST /tasks` `{title, instructions, time}` | `GET /list` → `tasks[].title` | RAC-1094 |
| 问题 Issues | `io.molis.work.issues`／`issues` | Home 监督器，个人插件 | `POST /create` `{title, type, description}` | `GET /list` → `items[].title` | RAC-1095 |
| 知识库 Cognia | `io.molis.work.cognia`／`cognia` | Home 监督器，个人插件 | `POST /library/materials` `{title, body}` | `GET /library` → `materials[].title` | RAC-1096 |
| 图片 Images | `io.molis.work.images`／`images` | Home 监督器，个人插件 | `POST /connections` `{name, api_format, base_url, model}`（Home 里的生图服务） | `GET /connections` → `connections[].name` | RAC-1097 |
| 置物架 Shelf | `io.molis.work.shelf`／`shelf` | 双实例：Home 监督器一半，每个项目一半；常开、个人 | 见第 3 节 | 见第 3 节 | RAC-1098（保留编号，本轮无测试） |
| 编程 Coding | `io.molis.work.coding`／`coding` | 项目监督器，`joins`，非个人 | `POST /sessions` `{title}` | `GET /state` → `sessions[].title` | RAC-1099 |
| Git | `io.molis.work.git`／`git` | 项目监督器，`joins`，非个人 | `POST /diff` `{workspace_id, path, side}`（选定要看的改动） | `GET /state` → `selected` | RAC-1100 |
| 文件 Files | `io.molis.work.files`／`files` | 项目监督器，`joins`，非个人；登记上没有 `project_runtime`，由 `apps/local-host/src/project-plugins.ts` 手工起 | `POST /open` `{workspace_id, path}`（打开一个文件） | `GET /state` → `position.path` | RAC-1101 |
| 对比 Diff | `io.molis.work.diff`／`diff` | 项目监督器，`joins`，非个人 | 无自有数据 | `GET /state` → `view.phase`（`waiting`） | RAC-1102 |
| 字数 Text Stats | `io.molis.work.text-stats`／`text-stats` | 项目监督器，`joins`，非个人；随 Files 一起移出、加回 | 无自有数据 | `GET /state` → `view.phase`（`waiting`） | RAC-1103 |

路由前缀都是 `/projects/<项目>/api/plugins/<plugin_id>`；个人插件的数据在 Home，项目的插件列表只决定这个项目够不够得着它。Git、Files 要一个绑定了的工作区：夹具在临时目录里 `git init` 出一个仓库（一次提交、一处未提交改动、一个文本文件），经 `POST /projects/<项目>/api/workspaces` 绑上，再从 `GET /projects/<项目>/api/project-settings/workspaces` 取 `workspace_id`。

## 3. 没走的、与原因、谁拿走

| 插件 | 原因 | 谁拿走 |
| --- | --- | --- |
| 置物架 Shelf（RAC-1098） | 走查在撤权一步撞上产品缺陷（第 4 节）；修复在 `apps/local-host/src/home-plugin-http.ts`，在 C 线的文件名单里，本线不改，也不放宽断言 | BL-804 |
| Feed、Inbox | C 线 `feature/anticorruption-closeout-c` 正在改，合入后再加 | BL-805 |
| Goals | C 线与 W5-10 仍在改 | BL-756 |
| Alchemist、插件创作台 | 绕过 Plugin Runtime，先不迁、之后删掉重做 | BL-376、BL-377 |
| 成果库 Artifacts | PG-077 第二步 | PG-077 |

置物架的条目（缺陷修好后原样加回 `tests/shipped-plugin-lifecycle-personal.test.ts`；夹具要回来的两个字段 `always_on`、`dual` 与它们在 `walk` 里的两处断言，按下面三处写法加回）：

```ts
shelf: { key: "shelf", plugin_id: "io.molis.work.shelf", scope: "home", always_on: true, dual: true, kept: ["first-lifecycle.md"],
  write: (web, routes, title) => web.post(`${routes}/items`, { filename: `${title}-lifecycle.md`, bytes_base64: Buffer.from("第一稿").toString("base64") }),
  titles: async (web, routes) => (await web.get<{ materials: Array<{ name: string }> }>(`${routes}/`)).materials.map(item => item.name).filter(name => name.endsWith("-lifecycle.md")) },
```

走法与别的不同三处（夹具里各占一个字段）：常开，所以第 2 步改为断言移出被拒（`400 catalog.plugin_always_on`，东西与动作都不变）；双实例，所以跟着走的是 Home 一半（`scope: "home"` 的动作），卸载后再断言项目那一半仍在（另一份安装，Home 一半的卸载不碰它）；新置物架自带一条示例，所以读回时按名字后缀过滤。

## 4. 缺陷

**置物架的 Home 一半停了之后，Home 路由答裸 404，别的 Home 插件答 `503 actions.plugin_unavailable`。**

- 复现：把上一节的条目加回，跑 `node scripts/run-tests.mjs tests/shipped-plugin-lifecycle-personal.test.ts`；第 3 步撤回 `storage:private` 并停掉 Home 一半之后，`GET /projects/<项目>/api/plugins/io.molis.work.shelf/` 答 `404`（`{"error":"插件没有这个入口"}`，没有错误码），断言要的是 `503 actions.plugin_unavailable`。问题、知识库、图片同一步答 `503 actions.plugin_unavailable`。
- 原因（读代码所得，除上面的失败外没有另行单独复现）：`apps/local-host/src/home-plugin-http.ts` 的 `projectHalfRoute`，Home 一半不在 `running` 时 `contribution` 为空，Home 路由表里匹配上的路径都被当作「项目那一半的路由」，`handleHomePluginHttp` 返回 `false`，交给项目实例的 `project-plugin-http.ts`；置物架的项目一半不绑定这条 Home 路由，`dispatchRuntimePluginRoute` 里 `router.match` 没有命中，也返回 `false`，最后由请求链答 404。`specs/dual-instance-plugins/spec.md` 写的是「Home 那一半停用后……Home 的路由在项目路径下答 `actions.execution_failed`」，那里的夹具插件项目一半也声明这条路由所以成立；真实的置物架项目一半没有声明，答的是裸 404，两头都不是 `503`。
- 位置：`apps/local-host/src/home-plugin-http.ts`（`projectHalfRoute` 与 `handleHomePluginHttp` 里 `if (split && projectHalfRoute(…)) return false;` 一行）。
- 建议改法：Home 一半没运行时，只在项目一半的路由表确实绑定这条路径时才放行给项目实例；没绑定就不放行，让请求走到 `dispatchRuntimePluginRoute`，由它按已停的安装答 `503 actions.plugin_unavailable`。改完同步 `specs/dual-instance-plugins/spec.md` 那一行（`actions.execution_failed` 在项目一半也声明这条路由的夹具里仍是那个答案），并跑 `tests/dual-instance-coverage.test.ts`、`tests/dual-instance-services.test.ts`。
- 本线的处理：置物架退出本轮通过的测试，不放宽断言；撤权之后的升级、卸载、重启三步因此没有在置物架上跑过，不能说它们通过。

## 5. 没跑的与运行结果

| 次 | 范围 | 命令（都经 `heavy.sh`，`--jobs 1`） | 结果 |
| --- | --- | --- | --- |
| 1 | RAC-1030～1034（原四插件）、RAC-1090～1097 | `node scripts/run-tests.mjs tests/shipped-plugin-lifecycle.test.ts tests/shipped-plugin-lifecycle-content.test.ts tests/shipped-plugin-lifecycle-personal.test.ts` | Schedule（RAC-1094）失败：夹具把「移出后安装仍在 `running`」当成所有插件的行为，非个人的项目插件移出后是 `disabled`；夹具加 `stops_when_removed`，其余通过 |
| 2 | 加上置物架与编程一族（四个文件） | 同上，加 `tests/shipped-plugin-lifecycle-coding.test.ts` | 4 个文件通过 3 个：RAC-1094、RAC-1099～1103 通过；置物架（RAC-1098）在撤权一步失败（第 4 节） |
| 3 | 去掉置物架之后（四个文件） | 同上 | 4 个文件全部通过，共 18 项（原四插件 5 项、RAC-1090～1094 共 5 项、RAC-1095～1097 共 3 项、RAC-1099～1103 共 5 项） |

没跑的：

- 浏览器用例与截图：用户 10-19 暂停，待补。
- 全量回归：本机不跑。
- 整体 `pnpm build`：在本机停在 `apps/local-host` 的原生 Swift 一步（命令行工具里 `SwiftBridging` 模块重复定义），`tsc` 本身通过；环境问题，与这一片的改动无关。测试要从包名加载 `dist`，所以只补建了缺 `dist` 的 `apps/desktop` 与 `apps/server`。
- 置物架的撤权之后三步（升级、卸载、重启）：见第 4 节。

## 6. 待 ① 落入 `specs/BACKLOG.md` 的行

`specs/BACKLOG.md` 与 `docs/system/RUNTIME-MIGRATION.md` 在 C 线与 W5-10 的文件名单里，这一片不改；下面两行请 ① 落入（链接按 `specs/` 下的相对路径写）：

```markdown
| BL-804 | 置物架 Shelf 的生命周期用例：走查在撤权一步撞上产品缺陷（Home 一半停了之后 Home 路由答裸 404，不是 `503 actions.plugin_unavailable`），修复在 `apps/local-host/src/home-plugin-http.ts` 的 `projectHalfRoute`；修好后把 [W6-02 余项](repository-anti-corruption/slices/w6-02-lifecycle-rest.md) 第 3 节的条目与夹具的 `always_on`、`dual` 两个字段加回 `tests/shipped-plugin-lifecycle-personal.test.ts`（RAC-1098） |
| BL-805 | Feed、Inbox 的生命周期用例：C 线 `feature/anticorruption-closeout-c` 合入后，照 [W6-02 余项](repository-anti-corruption/slices/w6-02-lifecycle-rest.md) 第 1 节在 `tests/shipped-plugin-lifecycle-*.test.ts` 各加一项 |
```
