# W6-02 余项：其余已迁入 Plugin Runtime 的内置插件的生命周期走查（名单、各自的写入读取入口与分片）

状态：进行中（2026-10-27，分支 `claude/magical-kare-c6b8ec`，线 ac-lifecycle）：共用夹具 `tests/fixtures/shipped-lifecycle.ts` 已从 `tests/shipped-plugin-lifecycle.test.ts` 抽出（RAC-1030～1034 行为不变），数据表、演示稿、问卷、工作流程、定时任务（`shipped-plugin-lifecycle-content.test.ts`，RAC-1090～1094）和问题、知识库、图片（`shipped-plugin-lifecycle-personal.test.ts`，RAC-1095～1097）已写，批次一二的运行结果见第 5 节；其余见第 2 节的去向。

W6-02 的原文（`roadmap-2026-10-07.md` §4.10）：把探针的生命周期（`tests/probe-plugin.test.ts`）延伸到真实已迁的生产者。第一批 Todo、Jelly、Pages、灵光已走完（`tests/shipped-plugin-lifecycle.test.ts`，RAC-1030～1034）；这一片补其余已在 Plugin Runtime 上的内置插件。

## 1. 每个插件走的一遍

一份夹具，每个插件一个一次性 Home，用产品自己的 Host 与网页服务（`serveTestHost`）：

1. 经插件自己的路由写一条带标题的东西，再从它的列表读回；安装记录为 `running`、版本是这一版、信任是 `host`。
2. 从项目里移出：路由与动作被拒（`403 actions.plugin_disabled`，目录里没有它的动作），安装仍在运行；加回来，写下的东西还在。常开的插件（`always_on`）改为断言移出被拒（`400 catalog.plugin_always_on`），东西不变。
3. 撤回一项必需权限（默认 `storage:private`）：启动被拒（`plugin.grant_denied`），路由答 `503 actions.plugin_unavailable`，记录为 `disabled`；权限还回去，带着数据重新运行。
4. 升级：关掉 Host，把安装记录改写成旧版本与旧摘要，重开后同一份安装（同一个 `install_id`）移到这一版，数据还在。
5. 卸载：记录为 `uninstalled`，路由答 `404 actions.missing`，目录里没有它的动作；再重启一次，监督器不再把它装回来。

## 2. 名单与各自的入口

名单来自 `apps/local-host/src/plugin-registry.generated.ts` 的 24 份登记。范围外的不在表里：Feed、Inbox（C 线 `feature/anticorruption-closeout-c`）、Goals（BL-756，C 线与 W5-10 仍在改它）、Alchemist 与插件创作台（绕过，BL-376、BL-377）、成果库（PG-077 第二步）。

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

路由前缀都是 `/projects/<项目>/api/plugins/<plugin_id>`；个人插件的数据在 Home，项目的插件列表只决定这个项目够不够得着它。

## 3. 没走的、与原因、谁拿走

（批次三的结论补在这里。）

## 4. 缺陷

（走查里发现的产品缺陷：复现、位置、建议改法。）

## 5. 没跑的与运行结果

（批次运行的命令与结果、本机没法跑的部分。）
