# Jelly

Jelly 是日历和随手记，在个人空间或哪个项目里启用，就在那里有自己的一份（第 108 批起按分区）。只做两件事：

- **日历**：按月、周或清单看。日程分单次和每周重复两种，可以归到分类里。
- **随手记**：纯文本或 Markdown，可以挂在某一天，也可以不挂。

第 112 批（2026-11-25 拍板）把 Jelly 缩成这两件事，下面这些都删掉了，不再回来：

- 私有 AI 拆解：要让 AI 排日程，由个人助理调用下面的公开动作来做。
- Jelly 自己的模型选择台和偏好文件。
- 进展页。
- 块级富文本、关联。
- 整库 JSON 导入导出、预览令牌和全库历史快照。

收想法、读文件与网页都在灵光（`specs/archive/post-merge-review/spec.md` PMR-22）。每个分区的数据存在 `<分区根>/libraries/jelly.db`（`databases.partition` 是 `JELLY_DATABASE`），不访问也不覆盖原 Jelly App 的数据。

数据合同：`@molis-ai/molis-work-plugin-jelly/contract`（`src/contract.ts`）。插件协议：`@molis-ai/molis-work-contracts/platform/plugin`。

## 存储

每个分区一个库（`database.jelly_database` 版本 1，Clean v1，没有旧结构的兼容分支），里面有四张业务表和平台的总览表。每一行都带自己的 `revision`：

| 表 | 内容 |
| --- | --- |
| `jelly_categories` | 分类：名字、颜色、排序。「未分类」只能改颜色。 |
| `jelly_items` | 单次日程或事项：起止日期、可选的起止分钟数、时区、备注、完成时间。 |
| `jelly_series` | 每周重复的系列：星期几、截止日，以及每一天的例外（改过或删掉）和完成记录。 |
| `jelly_notes` | 随手记：标题、正文（纯文本或 Markdown）、可选的日期。 |

- 每次写入只在一个事务里改它要改的那几行，并核对读取时拿到的 `revision`。
- 改日程和写随手记互不锁表。
- 同步按行进行（`src/replication.ts`），键是 `["jelly", 种类, id]`。
- 总览（`src/overview.ts`）：每条还没完成的单次日程在平台的总览表里有一行 `event`，和日程在同一个事务里写；同步来的日程也一样。Jelly 照原样迁过来（2026-11-26 定），没有提醒时间，所以不登记到期；重复系列不展开进总览。每种至多 500 行，满了时开始最晚的那行让位给更早开始的。

## 动作

共 18 项动作，输入类型都由 schema 推导（`InferActionInput`），处理器不写 `input as`：

- **核心 15 项**（`src/actions.ts`），名字都以 `jelly.` 开头：
  - 读：`calendar.list`、`item.get`、`note.list`、`note.get`
  - 日程：`item.create`、`item.update`、`item.delete`、`series.create`、`series.update`、`series.delete`
  - 分类：`category.save`、`category.delete`
  - 随手记：`note.save`、`note.delete`
  - 撤销：`restore`
- **其余 3 项**：搜索提供的 `jelly.search.entries`，以及两项对象读取 `jelly.item.subject.read`、`jelly.note.subject.read`。
- **内容站点**：`jelly.content.*`（`src/content-actions.ts`）接收别处交来的纯文本或 Markdown 笔记，例如灵光的「转成 Jelly 笔记」。

写入规则：

- 删除类动作返回删掉的行，撤销用 `jelly.restore` 把它们放回；之后又被改过的行不放回，列在 `skipped` 里，其余照样放回。页面的撤销按钮在宿主的 `host.showToast` 里（页面在框里时，框替它把按下传回来）。
- 重复系列的改动按范围分三种：只改这一次（`onlyThis`）、改这次和以后（`thisAndFuture`，旧系列在前一天截止，另起一个新系列）、改全部（`all`）。
  - 挪日期按这一次现在的位置量（单独挪过的也算），整个系列挪同样的天数，星期跟着转；`weekdays` 只有和原来不同才算改了规则。
  - 单独改过的日子和完成记录跟着挪，只去掉不再落在系列上的。
- 新建时 `expected_revision` 不填或填 0。助理和 MCP 调用必须写明版本，所以新建填 0。

## 开发要求

- 负责：每个分区的日历和随手记，以及它们在总览表里的摘要行；作为内容站点接收交来的笔记。
- 不负责：原 Jelly App 的数据、项目 Goal 事实、模型调用、第二个运行时。
- 公开入口：`@molis-ai/molis-work-plugin-jelly`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）。
- 依赖：只依赖 `@molis-ai/molis-work-contracts` 和 `@molis-ai/molis-work-plugin-sdk`，不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 启动不需要 `context.services.model`，也不需要 `model.configuration`。Manifest 不申请 `model:*` 权限，也没有 HTTP 路由和设置入口。
  - 每次写入核对行的 `revision`。版本对不上报 `jelly.conflict`，并带上最新的 `revision`。
  - 失败统一用 `jellyErrors` 的 `jelly.<原因>`，只有 `invalid`、`conflict`、`not_found`、`corrupt` 四种。
  - 按分区运行（`src/registration.ts` 的 `project_runtime`）：每个启用 Jelly 的分区一个实例、一个库，彼此不读；动作都是项目范围，分区由调用上下文给。
  - 写入口是上面那 11 个命令动作，加上内容站点的 `jelly.content.receive` 和同步的按行写入，每一次都在一个事务里完成，日程的总览行随同一个事务。
- 页面（`src/browser/`）分两个页签：
  - 「日历」：月、周、清单三种看法；右侧是选中那天的日程、一行快速添加和当天的随手记。
  - 「随手记」：列表加编辑器，有字的笔记打开时先显示阅读模式。
  - 页面只经 `host.invokeAction` 调用上面的动作，不直接请求。
  - 按 id 打开（`molis-work:select-item`）时：对象已经不在，就在页面上说出来（`[data-jelly-notice]`），并发 `molis-work:item-unreadable`；没有权限读的，用平台的话说，不说成「不在了」；`quiet` 的重开不出声。
- 界面文字用 `jelly.*` 键，`locales/{zh,en,ja}.json` 三种语言齐全，并在 Manifest 的 `ui.locales` 声明。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-plugin-jelly run build`。改过共享依赖的，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/jelly-calendar.test.ts tests/jelly-actions.test.ts tests/jelly-mcp.test.ts tests/jelly-replication.test.ts tests/jelly-client-bundle.test.ts tests/lingguang-material.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts`
- 改了界面再加跑这些（需要本机 Chrome）：`node scripts/run-tests.mjs tests/jelly-actions.e2e.test.ts tests/jelly-outside-changes.e2e.test.ts tests/jelly-whole-character.e2e.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

项目回收检查：项目里的日程和随手记在该项目的分区库里，随项目删除；个人空间里的不受影响。同步适配器对任何项目都回答「没有未结算的内容」。
