# Pages 文档入口

本机文档：列表、写作、自动保存、块、评论、卡、挂 Goal 与 Promote。数据在 `{home}/pages/pages.db`。编辑器用 ProseMirror，单独打成浏览器脚本，不进工作台 factory 字符串。

`pages.generate` 接收调用方已解析的材料快照，通过同一模型配置执行；缺少模型时目录及调用明确拒绝，不生成占位文稿。插件内部的 `generatePagesFromMaterials` 通过短 Store 操作保存 `page_generations`，不跨模型等待持有数据库。历史按项目和请求保存要求、采用版本、错误和文稿 ID；失败或取消保留快照，重试成功后返回原文稿，不覆盖手工编辑。Workbench 的 Inbox 提供材料选择、要求与恢复入口，生成不会自动完成 Inbox。编辑器与 MCP 的 AI 使用统一文字模型配置；候选正文由用户确认或后续创建/修改动作保存。生成前后核对文档版本和取消状态，过期候选不提交。

文档右侧的「评论与备注」跟随当前主区文档。评论保存在 Pages 自己的 `page_comments` 表，正文的原批注与块备注不变。普通评论只保存文字；选中 `@助理` 后发送，宿主把当前正文、引用及本线程作为快照交给同一个 Prologue 运行时，答复只回到原评论，不修改正文。移除引用原文后保留摘录并显示失去定位。回复生成后投递失败可单独重试，避免重复调用模型。

Pages 存储基线为 2；本次未实现旧库读取兼容或自动迁移，也未操作真实 Home。已有基线 1 的 Home 须先经过明确授权的维护升级，才能试用此构建。

包名：`@molis-ai/molis-work-plugin-pages`。装配：每个项目一个 Plugin Runtime 实例（`src/plugin.ts` 的 `createPagesPlugin`，`apps/local-host/src/project-plugins.ts` 的 Home 库条目，`trust: HOST_BUILD_TRUST`）；库仍是 Home 级的 `{home}/pages/pages.db`（`PAGES_DATABASE`），按 `project_id` 分区，经 Runtime 的 `services.database` 读写；成果经 `services.artifacts`、模型经 `services.model`、Goals 与其他插件经 `services.actions`。宿主里不再有 Pages 专用的动作、HTTP 或成果适配文件。

导入入口在 Pages 文档列表的「导入」。支持 Notion 的 Markdown & CSV / HTML ZIP 导出包，飞书等工具导出的 DOCX、Markdown，以及通用 HTML、TXT、CSV。先预览、查看转换提示并勾选文档，再导入当前项目的指定文件夹；可继续编辑、自动保存。保留常用文字格式、列表、待办、表格和代码。导入只创建新文档；一次批量写入使用事务，同一请求重试不会覆盖手工编辑或重复创建。

边界：目前为文件导入，不连接来源账号、不抓取私有链接、不持续同步。ZIP 中的文档平铺到所选文件夹，不重建子页面树；相对链接保留路径说明，不自动转为 Pages 引用。当前编辑器没有图片/附件块，导入会转换为安全链接或文字说明并提示；评论、权限、历史版本不迁移。PDF、旧版 `.doc` 不支持，请从来源导出为 DOCX / Markdown / HTML。上传总计最多 10 MiB，每篇文本最多 1 MB，压缩包单项最多 5 MiB、展开合计最多 20 MiB，每批最多 100 篇。

接口：`POST /api/plugins/io.molis.work.pages/pages/import/preview` 接收 `files: [{name, data}]`（base64）；`POST /api/plugins/io.molis.work.pages/pages/import` 增加 `selected_keys`、`folder_id`、稳定的 UUID `request_id`。路由由 Manifest 的 `routes` 声明（共 17 条，导入两条的请求体上限 15,000,000 字节，其余 1,000,000），Plugin Runtime 在每个项目的 Pages 实例上提供；旧的 `/api/pages/...` 与 `/api/plugins/pages/...` 已不存在（W5-01-PAGES-02）。预览不写入，提交重新解析并验证，转换只在本机进行。

不改 Goal 树。Promote 经 Host 发出个人 Artifact。对外能力就是它声明的动作，经「能力 → 对外接入」授权后才出现在 MCP；Host 从绑定项目注入分区。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

动作服务迁移：插件自己的 `actions.ts` 声明并实现 20 项公开业务能力（文档、文件夹、模板、文件导入、已解析材料保存、生成及历史、写作、提取、发布），加上 12 项标准能力（主体读取、片段、系统搜索、文件条目与内容、成果库的预览/固定/比较/继续/被引用、放置的移动与复制），加上 4 项评论线程能力，共 36 项，统一由 `PAGES_ACTIONS` 声明，与 `createPagesActionHandlers` 逐项对应。Manifest 注册这些能力和四项内容交接合同；Host 组合原 Store、模型和 Artifact owner，HTTP 不再自行打开文档库。工作流内容处理器调用同一业务动作并保留调用者身份与权限。MCP 只经授权的动作工具。

`pages.create@2` 接受可选 `request_id`，只有本次真正新建才返回 `created_version`，用来安全撤销；重放交回当前文档但不提供撤销版本。它替换 1，MCP 工具为 `pages.create__v2`；固定旧版本的工作流、绑定和外部插件须重新发现、绑定当前版本。HTTP `/pages` 路径不变，其他 Pages 动作的版本不变。

内部与 MCP 的项目来自可信调用上下文；HTTP 的项目由 Runtime 实例所在项目绑定，query/body 中声明不同项目会拒绝。`pages.update` 接受 `expected_version`，编辑器自动使用服务器版本，冲突保留草稿并阻止离开。提取任务/知识页和删除文件夹各自在原 SQLite 库事务内完成。原表、文档 ID、导入请求和历史均保留。

Inbox 通过 `pages.generations.get/list`、`pages.get` 和 `pages.generate` 读写文稿；项目上下文采纳通过 `pages.documents.import` 保存来源与摘要。`request_id` 与 `request_hash` 表示调用方已确认的稳定意图，保留旧值以支持历史重试，不用它们证明权限或来源。文档按 canonical project_id 分区；库只认当前 schema 基线（`PAGES_DATABASE`）。

`pages.promote` 在原 `pages` 行保存未完成发布快照后才调用 Artifact owner；失败后继续原快照和版本。已存成 Artifact、尚未回写文稿关联时，重试读取并核对原 Artifact，恢复关联而不重复发布。没有未完成发布快照时，已有成果（包括没有数字来源修订号的版本）保留，显式新固定生成下一版，不把它当作中断恢复。文稿移走又移回时记录重新从 0 数固定版本，而项目成果库仍留着之前的各版：下一次固定接着成果库里已有的最高版号（`nextPinnedVersion`），不把旧版当作中断记录交回。完成关联与清除快照在同一文稿事务提交，保留后续正文和 Goal 编辑；固定下来的版本归本机的人，不论谁（人、工作流、Agent、MCP 客户端）固定的，生产者记在 `created_by`，下一次固定不会因为上一版是别人固定的而被拒绝；未完成的发布意图仍只由发起它的行为者恢复，其他行为者不能代为完成。

列表和编辑器从 `publication_pending` 显示“继续保存上次成果”，恢复成功明确说明当前编辑仍保留。客户端传 `expected_version`，过期请求不会再创建一版；顶层 Agent/MCP 按现行合同必须提供版本，人亲自发起的可选版本调用仍表示显式新固定。返回 `recovered` 只表示恢复已保存的未完成快照。Pages 库只认当前基线，不在读取时补历史发布快照。

标准 MCP 的查询、写入、AI、生成、历史及发布中断恢复有独立 stdio 客户端验证；生产客户端授权管理和系统生命周期仍属于系统服务未完成范围，测试启动授权不能替代它。

## 开发要求

- 负责：文档目录、ProseMirror 编辑器、导入、按材料生成与发布。
- 不负责：Goal 与 Artifact 事实、模型提供方、托管文档服务、ZIP/DOCX 系统解析。
- 公开入口：`@molis-ai/molis-work-plugin-pages`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `pages.<原因>`，状态由错误种类决定，Pages 不自带状态表）；第三方依赖见 `package.json`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 导入、模板选择、命名和确认弹窗复用 `mw-dialog--form`：内容单独滚动，底部操作始终留在弹窗内；长列表、展开预览、错误提示和矮窗口不把按钮推到裁切区域。`tests/pages-import-entry.e2e.test.ts` 在点击助手自动滚动之前检查按钮完整可见与命中区域。
  - 新建、导入打开和提取返回时，先核对正在编辑的文档与本次编辑状态；新输入通过原版本保存，提取与输入冲突时保留草稿并明确报错，不用返回值确认未显示过的编辑。
  - 不支持的正文结构只读保留；返回、导入打开、发布、提取、导出和打印不把编辑器占位正文写回或当成原文。图片读取、写作候选及卡片浮层属于打开它们的文档；切文档结束这些资源，同文档的延迟图片沿原插入位置映射。
  - Markdown 与静态 HTML 保留表格单元格的所有段落和任务、日程、引用的可见文字；多篇合成沿现有 1500 个字符的节选范围，材料保留对象、版本与截断标记，成稿说明节选并链接原 Pages。
  - HTTP 的项目由 Host 绑定，query 或 body 声明不同项目会拒绝；`pages.update` 带 `expected_version`，冲突保留草稿。
  - 生成按请求保存材料快照；缺模型明确拒绝，不生成占位文稿。
  - 被取消或撤权的生成不写任何业务记录（调用记录里的“未执行”诊断行除外），本进程可以立即接手重试；其他进程的尝试仍守租约。
  - 上传文件由 Runtime 的 `services.materials.readDocuments`（`materials:read`，只能在本插件自己声明了该权限的 concurrent 动作里调；ZIP/DOCX/编码解析归 Host worker）读成公共 MaterialDocumentBatch，Pages 的 `preparePagesImport` 只把它转换为编辑器正文；平台的 `material.*` 拒绝按 `pages.invalid` 说给人听。解析等待不占项目串行队列，返回后复查授权/取消（W5-01-PAGES-01、-03）。
  - 导入预览不写入；批量写入一个事务，同一请求重试不覆盖编辑、不重复创建。
  - 编辑器单独打成浏览器脚本，不进工作台 factory 字符串。
  - 编辑命令由 `src/commands.ts` 显式汇总既有出口；实现按选区与菜单、块变更、内容插入、列表与容器、光标与代码、格式、Markdown 分在 `commands-*.ts`。命令族直接依赖所需的内部模块，不回指汇总入口；选区/位置读取不依赖编辑命令，函数不跨模块保留编辑状态。
  - 工具定义、heading/list 命令工厂、分组与 pressed/opens 投影、选区矩形归 `src/editor-tools.ts`；每次 tools/screen 调用都读当次 view/state，不缓存编辑器或选区。runTool 仍由入口路由原弹层或命令；列表工厂只捕获固定类型，工具定义的创建与翻译顺序保持。
  - 链接与评论预览的 DOM、绘制、按钮、120ms blur 和滚动/resize 跟随归 `src/editor-previews.ts`；工厂仅返回两根节点及操作，内部按钮不外露。入口保留原挂载、绑定与释放时点，先解除跟随，再关闭表单，最后移除预览；不另存 view 或选区，翻译与 onScreen 仍动态读取原 options。
  - 自定义键盘命令归 `src/editor-keyboard.ts`，三组短键表仍在原插件位置装配为一个 keymap；工具栏共用同一 commandToggle。命令执行时从事件第三参数读取当前 view，只有链接面板沿用入口回调；方向键和 Tab 的方向助手不保存编辑状态，保持原回退与吞键顺序。
  - 尺寸键归 `src/editor-size-keys.ts`（VUX-06）：光标所在的选中图片、表格列或分栏，按 Mod-Alt-Shift-← / → 变窄变宽，用的是手柄拖动时的同一组命令（`setImageWidth`、`setColumnWidth`、`nudgeColumnShare`），一次 32 px 或这一对栏的二十分之一；三个手柄用 `aria-keyshortcuts` 写出这两个键。改了它跑 `tests/pages-size-keys.e2e.test.ts`。
  - 编辑器的布局、媒体和卡片节点视图分别在 `src/editor-node-layout.ts`、`src/editor-node-media.ts`、`src/editor-node-cards.ts`；共用类型与 DOM 小函数在 `src/editor-types.ts`、`src/editor-view-ui.ts`。节点视图依赖现有命令与临时资源 owner，挂载入口依赖视图，不反向引用入口；跨文档的延迟操作仍由 transient API 归属和撤销。
  - 查找替换的状态键、查找栏创建/更新/销毁及打开动作归 `src/editor-find.ts`；匹配与替换计算仍在 `src/find.ts`。浏览器入口只装配这一个插件和快捷键，不另存查询或匹配状态。
  - 斜杠与 @ 提及菜单归 `src/editor-insert-menu.ts`，原状态键供块悬浮菜单共用；段间装饰与临时输入归 `src/editor-gap.ts`，其中临时输入区通过不可编辑的外层成为独立编辑根，点击段间条后打字不能落回原段落。剪贴板输入/输出、HTML 节点读取与图片拖入归 `src/editor-paste.ts`，入口只装配处理器，段间输入共用图片读取；保留图片、块组选区、Shift 纯文本、URL、HTML、Markdown 的原优先级，剪切先写剪贴板再删除选中块。图片延迟读取仍由 transient owner 撤销，不另存编辑器或选区。
  - 块菜单的 DOM、模式、选中项和操作归 `src/editor-block-menu.ts`，从原编辑器实时读取当前位置；块选择的唯一 PluginKey 与共用命令归 `src/editor-block-selection.ts`。`src/editor-block-plugin.ts` 拥有选择状态与按键/装饰投影，`src/editor-block-handle.ts` 协调手柄、菜单和监听生命周期，定位归 `src/editor-block-handle-position.ts`；`src/editor-block-drag.ts` 只持有当前手势，绘制与 ghost 归 `src/editor-block-drag-render.ts`。菜单不存第二份块选择，内部模块不回指主入口；正文变化、取消与销毁仍结束原手势，预览不写正文，释放后才提交移动或复制。
  - 编辑器弹层（状态、冻结范围、停靠到上下文工具栏或落回舞台）归 `src/editor-popup.ts`；备注、颜色、提示块样式表单在 `src/editor-popup-forms.ts` 的 `createBlockForms`，链接与评论表单在 `createTextForms`；写作请求与候选归 `src/editor-ai.ts`；节点视图表和输入、点击、鼠标、复制剪切的处理归 `src/editor-view-props.ts`。入口 `mount` 只装配这些并创建视图；`hidePop` 是 `createEditorPopup` 返回的稳定函数，别处不再换它。`PagesStore` 的生成一组在 `src/store-generations.ts` 的基类里。
  - 「新建文档」仍立刻建一条，但离开时内容为空就收回（W2-18 决定 6，2026-10-09）：只对本页刚建的空白文档（不含模板、AI 结果、已有的空文档），离开 = 返回列表（本页的「返回」，也包括工作台自己的返回方式：标题栏的后退键、⌘[、Alt+←、鼠标后退键和标签栏上本插件的名字；它们对本页说「没有条目」并把页面收起来，本页等收起完成后再收回，没有收起时不动）、打开另一篇（也包括导入后在导入框里按「打开」，导入的文档成为当前这篇）、再新建一篇、工作台把本页藏起来（切到别的插件、回 Home、进设置），以及页面本身走掉（刷新、关窗口）；标题没动（或为空）且正文只有空段落才算空，一个分隔线、图片、表格都算内容，还有一次保存没发出去时不动它；经既有的 `pages.discard`（`POST /api/pages/:id/discard`，新建的撤销：只在文档还是那个版本时删），版本是本页自己保存标题和正文所到的那一个（`fresh` 里记着，只随这两样保存往前走）；新建后又加了星标、移进文件夹、关联了 Goal、存了一版成果，或期间在别处改过（列表重新读取与助理的改动只更新本页看到的那份，不动这个版本），Host 拒绝、文档保留，哪怕编辑器里看着还是空的；被拒或没连上都不提示。已知的两处局限：刷新或关窗口时那一次 `keepalive` 要等 Host 收到才生效，刷新后极短的时间里列表可能还看得到这条空文档（不会再自动打开它）；指向已收回的空白文档的条目标签或放置链接，打开时显示 Host 返回的既有「文档不存在」错误（切换标签页让本页被藏起来时也会收回），要用户来定，本页没有单独处理。工作台历史里的那一步不再留下记录（用户 2026-10-10 定，`specs/repository-anti-corruption/spec.md` §1）：「新建文档」→「返回」之后按工作台的后退键，会回到指向这篇已收回文档的那一步（历史记的是 `plugin:pages|<id>`；从这篇空白文档直接用工作台的后退键回到列表时本页同样收回它，随后按「前进」也到这一步），约 1.5 秒后工作台按 id 去开它，页面显示一次同一句「找不到这篇文档」；`jumpToRecord` 的安静重开（后退、前进、刷新）里，`showsIt` 只在页面展开（`data-expanded` 不是 false）时才把工作台自己补写的 `named_by: "workbench"` 当作插件在显示它（`apps/workbench/src/scripts/client/tab-workspace.ts`、`context-actions.ts`；链接、放置「打开」、全局搜索这几条非安静的路径不变，仍把它当作在显示，因为有的插件，如 Todo 的批次整理，把内容开在列表页里），页面还停在列表，所以约 8 秒的安静计时到了，记录里仍是它在找的那一条就忘掉它（`molis-work-plugin-records:<项目>`；这段时间里人打开了别的条目，那一条的记录留着），再前进、再后退或刷新，页面都停在列表，刷新后没有那句话（`tests/plugin-small-ux.e2e.test.ts`）；那一句只出现在后退的那一次，留到再打开别的条目或刷新，没有新的页面事件去清它。删除一篇文档后按后退键同理。关掉编辑器时（`closeEditor`，经 `syncEditorChrome`）本页同时更新 `data-assistant-context`，不再把已关掉的文档（含刚收回的）当作当前对象：助理、放置条和工作台判断「这条记录开着没有」都读这个属性（`tests/pages-blank-discard.test.ts`、`tests/plugin-small-ux.e2e.test.ts`）；不更新时，已收回的文档会一直被当作助理手里的对象，后退键回到那一步也不会得到任何反应。工作台藏起本页时同时关掉编辑器，回来看到的是列表；页面活跃时通过 `host.view.onClosing` 登记自身的条件收回动作，页面走掉时由宿主带 `keepalive` 执行，编辑器也同时关掉：工作台把插件页里打开的那条记录记在本机（`molis-work-plugin-records:<项目>`），好在刷新后重开，页面报告回到了列表（`data-expanded` 为 false）它才忘掉；不关的话，刷新后约 1.5 秒工作台会按 id 去开已收回的文档，Host 答「找不到」，页面就显示「找不到这篇文档」。没有收回的：屏幕上有字或有一次保存没发出去时不关编辑器、记录留着，刷新后照旧重开；收回被拒时编辑器已经关了、记录已忘，刷新后是列表，文档还在。只是浏览器标签或窗口被藏起来（`document.hidden`）不算离开。逻辑在 `src/blank-client.ts`，生命周期用 Host 注入的 `mountPluginClient`。
  - 页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/pages-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂，`--minify`）；`src/client.ts` 的 `PAGES_CLIENT_FACTORY_SCRIPT` 只读这个包（`registration.ts` 不再需要 `clientServed`）。页面状态在一个 `PagesPage` 对象里（`page.ts`），各部分是拿它当第一个参数的函数：`list.ts`（画列表、文件夹与折叠）、`document.ts`（读写、保存队列、收藏、移动、发布、导出打印）、`editor.ts`（挂载与填充编辑器、保存队列）、`blank.ts`（新建后留空的收回）、`landing.ts`、`import.ts`（导入对话框）、`menus.ts`、`context.ts`（对助理与选区条说明手上有什么）、`click.ts` 与 `events.ts`（事件）、`notes.ts`、`dom.ts`；请求只经工作台的 `molisWorkRequest`（`request.ts`，路径在 `/pages` 之后，路由由 `host.pluginRoute` 按 Manifest 身份给出，项目由宿主绑定、不再随请求发送）。页面文字是 `src/messages.ts` 里的稳定键 `pages.<区域>.<名称>`（中英文并排，登记在 `registration.ts` 的 `messages`）；编辑器内核（`editor-*.ts`、`commands-*.ts`）的标签仍按中文原文查词（BL-464）。`tests/pages-client-bundle.test.ts` 钉住这两件事。
  - 项目被删除时平台按 Manifest 里 Home 库的 `project_rows`（`src/database.ts`：确认框里的标签与要删的表）删掉文稿与文件夹，连同生成与导入回执和还能撤回的修改；插件的代码不参与，平台在自己的连接上删，库不存在时不创建，重复运行没有副作用（PG-024）。
- 运行前构建：`pnpm --filter @molis-ai/molis-work-plugin-pages run build`；若改过源码或共享依赖，先在仓库根目录运行 `pnpm build`。
- 改动后必跑：`node scripts/run-tests.mjs tests/pages-actions.test.ts tests/pages-cross-module.test.ts tests/pages-generation-lease.test.ts tests/pages-conversion.test.ts tests/action-before-effect.test.ts tests/pages-publication.test.ts tests/document-pin-after-move.test.ts tests/artifact-compare-moved.test.ts tests/project-deletion-owners.test.ts tests/pages-blank-discard.test.ts tests/pages-draft-race.test.ts tests/pages-client-bundle.test.ts tests/document-plugins-error-model.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/plugin-small-ux.e2e.test.ts`
- 查找替换改动加跑：`node scripts/run-tests.mjs tests/pages-find.e2e.test.ts`（公开编辑器挂载、真实 Chrome 键盘和替换事务；不代替整个 Pages 持久化动线）。
- 插入菜单/段间输入改动加跑：`node scripts/run-tests.mjs tests/pages-insert-plugins.e2e.test.ts`（正式编辑器与样式，真实 Chrome 点击、键盘、输入、撤销及销毁重挂）。
- 块菜单/块选择改动加跑：`node scripts/run-tests.mjs tests/pages-block-menu.e2e.test.ts`（正式编辑器与样式，菜单键盘、颜色/转换、复制/删除、撤销、多块选择与销毁重挂）。
- 块手柄/拖拽改动加跑：`node scripts/run-tests.mjs tests/pages-block-drag.e2e.test.ts`（正式编辑器与样式，真实 Chrome 点击、拖拽预览/移动/Alt 复制、撤销、取消及销毁重挂）。
- 剪贴板/图片拖入改动加跑：`node scripts/run-tests.mjs tests/pages-clipboard.e2e.test.ts`（正式编辑器与样式，多块 HTML/Markdown 复制剪切、整组替换与撤销、粘贴优先级、空输入零写、图片落点及销毁重挂；DataTransfer/ClipboardEvent 验证浏览器事件路径）。图片等待中的映射与换文档隔离复用 `tests/content-editing-regressions.e2e.test.ts` 的 `W2-18-PAGES-TRANSIENT-01`。
- 键盘命令装配改动加跑：`node scripts/run-tests.mjs tests/pages-keyboard.e2e.test.ts`（正式编辑器与样式，真实 Chrome 格式/块转换/复制/历史、Enter与删除回退、表格/代码/容器 Tab、方向移动、setDoc 与销毁重挂；Mac Chrome 实操，非 Windows/AltGr 验收）。菜单、查找、拖拽 capture 与剪贴板优先级复用上述对应浏览器回归。
- 工具定义/选区投影改动加跑：`node scripts/run-tests.mjs tests/pages-tools.e2e.test.ts tests/pages-keyboard.e2e.test.ts tests/context-toolbar-panes.e2e.test.ts tests/contextual-interaction.e2e.test.ts`（正式编辑器与样式，工具字段/译文顺序/动态 pressed、命令/撤销/弹层路由、DOM Range 矩形、滚动、setDoc 与重挂；后两项覆盖真实工作台接线和窄屏）。
- 链接/评论预览改动加跑：`node scripts/run-tests.mjs tests/pages-previews.e2e.test.ts tests/content-editing-regressions.e2e.test.ts tests/pages-tools.e2e.test.ts tests/context-toolbar-panes.e2e.test.ts tests/contextual-interaction.e2e.test.ts`（正式编辑器与样式，当前目标、编辑与取消、焦点、滚动/resize、setDoc 原刷新时点、释放重入和带待处理 blur 的销毁重挂）。
- 上述内容与编辑状态的定向回归：`node scripts/run-tests.mjs tests/content-owner-regressions.test.ts tests/content-editing-regressions.e2e.test.ts tests/content-portable-regressions.e2e.test.ts`（浏览器文件需要本机 Chrome；受控模型与下载/打印拦截不代替真实模型、文件应用或读屏体验验收）。
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

评论回归：`node scripts/run-tests.mjs tests/pages-comments.test.ts tests/assistant-thread-reply.test.ts tests/pages-assistant-surfaces.e2e.test.ts`。后两项分别经过真实 Host/Prologue（本机流式模型夹具）与真实浏览器。

评论浏览器控制器位于现有 Pages 编辑器资源包。目录工厂用 getter 提供当前编辑器状态；侧栏文档在挂载前加载同一份已声明的客户端依赖，首次独立打开侧栏也可用。草稿键、所属插件请求、来源检查与上下文 epoch 保持不变（PAS-14）。
