# 灵光

本机临时灵感池：先记下还没想清楚的想法，再决定留下或丢掉。数据在 `{home}/lingguang/lingguang.db`。

包名：`@molis-ai/molis-work-plugin-lingguang`。

所有对外读写及对话能力由插件的 `actions.ts` 声明，项目 Runtime 注册，`createLingguangPlugin` 是唯一装配入口。HTTP、工作流内容交接与授权 MCP 适配器共用动作服务；页面通过 `/projects/<id>/api/plugins/io.molis.work.lingguang/sparks` 的 Manifest 路由调用，项目身份由 Host 绑定。

头脑风暴通过 Host 的文字模型接入，使用所选灵光和真实历史。未配置模型时提示连接，不创建占位回复；失败或取消不保存半轮消息。生成期间材料变化会拒绝过期结果。已有 `stub` 历史仍保留，并标记为本地记录。

编辑页的“转为待办”是带数据的按钮（`data-context-intake="todo"`，带屏幕上的灵光 id、标题和正文），工作台把它交给 Todo 声明的「记成待办」创作入口，由 Todo 自己起草、新建并记下来源（标题加正文作为依据原文）；灵光不认识 Todo 的输入，本身保留。“转成 Jelly 笔记”经放置服务交给 Jelly 的内容站点，笔记里记着它来自这条灵光。

灵光是收想法的唯一地方（2026-10-01，`specs/archive/post-merge-review/spec.md` PMR-22）。“导入文件”“读取链接”经 Host 的文件与网页读取（`lingguang.material.read`、`lingguang.source.read`；文字提取、图片识别、音视频转写，需要下载本机语音模型时先问），读到的文字由用户记成一条灵光；读取本身不保存灵光。材料、链接与对话路由声明 `stream: "ndjson"`，逐行回报进度，关掉进度框即停止。上传的文件只在提取期间留在内存里（提取器的临时目录随后清除），不保存原始副本；留存的只有用户记成灵光的文字，以及转写用的本机语音模型缓存 `{home}/lingguang/models`。正文上限 20 万字，头脑风暴给模型时每条只带开头一部分。

工作台使用项目路由，自动保存携带版本检查，发送期间防止重复提交。数据保留原 SQLite 表和稳定 ID。对外客户端的正式授权产品仍随系统动作服务迁移推进。

页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/lingguang-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂，`--minify`）；`src/client.ts` 的 `LINGGUANG_CLIENT_FACTORY_SCRIPT` 只读这个包。页面状态在一个 `LingguangPage` 对象里（`page.ts`），编辑与空白灵光的丢弃（`editor.ts`，空白灵光怎样离开的完整说明在它的开头注释）、列表与它的读取（`list.ts`、`load.ts`）、读取文件与链接（`material.ts`）、头脑风暴与交给助理（`chat.ts`）、按钮命令表（`commands.ts`）各是一个部件，在启动时把自己的操作装到这个对象上；请求只经工作台的 `molisWorkRequest`（`request.ts`，带 `scope`，离开页面即取消），不直接 `fetch`；插件路径来自 `host.pluginRoute`，插件 id 来自 `host.pluginId`，浏览器代码里不写 id。esbuild 是包的直接开发依赖，版本与根相同；升级后的资源增长仍须按资源规则评审。

页面上的字是稳定键（`lingguang.<区域>.<名称>`），中英文都在 `src/messages.ts`，登记在 `registration.ts` 的 `messages`，不经工作台的 `i18n/en.ts` import。`src/en.ts` 的 `LINGGUANG_EN` 只留 7 条宿主还按中文原文翻译的词（灵光自己的服务端标签与错误，BL-459），新页面文字一律加稳定键。

- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

回复阶段由 `actions.ts` 发出，模型文字经 Runtime 的 `services.model` 进度端口到同一条路由；Host 共用流输出器送出，浏览器共用 `molisWorkRequest.stream` 解码。预览不作为保存结果；取消请求后保留输入，不保存迟到的回复。

## 开发要求

- 负责：临时灵感池与围绕灵感的对话。
- 不负责：Goal 与 Artifact 事实、模型提供方、托管服务。
- 公开入口：`@molis-ai/molis-work-plugin-lingguang`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `lingguang.<原因>`，状态由错误种类决定，Lingguang 不自带状态表）。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 编辑基于实际填入字段的那份记录；列表刷新只更新目录，不能确认未显示的外部编辑。连续排队的本人保存只推进同一次打开的编辑基准，外部更新后保存仍冲突并保留输入。
  - 失败或取消不保存半轮消息；生成期间材料变化时拒绝过期结果。
  - 对话回复声明 `scheduling: "concurrent"`，等模型时不占项目的串行队列。
  - 保留原表与稳定 ID；旧 `stub` 历史标为本地记录。
  - 同一 `request_id` 只代表一次保存：重试同样的内容返回第一次保存的那条（人把它移到别的项目后也一样），换了内容拒绝（`lingguang.request_conflict`），不静默丢掉新内容。请求表结构不变：请求键是 id 加输入指纹。
  - 读取文件或链接只提取文字，不保存上传内容；留存的只有人记下的灵光。
  - 选中文本的「记下灵光」是 `lingguang.create` 上的创建入口（`intake`，context-program W4-1）：`lingguang.fragment.offers` 只做它的 `prepare`，浮条不再从它单独出选项；点一下直接记下，完成卡片上有「打开」「撤销」。撤销走 `lingguang.revert`（`{ id, expected_updated_at }`，从记下回包的 `spark.created_at` 取首次版本；重放也保持这一版）：只在记下之后没被改过时移出列表，改过就拒绝，不丢也不改；助理工作里的撤销用的也是它。
  - 「记下第一条灵光」仍立刻记一条，但离开时内容为空就丢掉（W2-18 决定 6，2026-10-09）：只对本页刚记的空白灵光（不含读文件/链接记下的、已有的空灵光），离开 = 返回列表（本页的「返回」，也包括工作台自己的返回方式：标题栏的后退键、⌘[、Alt+←、鼠标后退键和标签栏上本插件的名字；它们对本页说「没有条目」并把页面收起来，本页等收起完成后再丢掉，没有收起时不动）、打开另一条、再记一条、工作台把本页藏起来（切到别的插件、回 Home、进设置），以及页面本身走掉（刷新、关窗口）；先向 Host 读一次这条，正文为空且标题没动（或为空）才经既有的 `lingguang.discard` 丢掉，不再问「丢掉这条？」；丢掉时带上决定时那一份的 `updated_at`（`expected_updated_at`，按灵光 id 给，与 `lingguang.update` 同一道守卫），读和丢之间别处写进了字，Host 拒绝（409 `lingguang.conflict`）、灵光保留；进了头脑风暴的灵光算在用，保留；读不到或丢不掉都不提示。工作台藏起本页时先存屏幕上的字、关掉编辑器，回来看到的是列表；页面走掉时来不及读 Host 的那一份，以本页最后见到的那一份（最后一次读到的列表，或最后一次保存的回包）为准，丢掉带的是那一份的 `updated_at`，之后别处改过就被拒，页面活跃时通过 `host.view.onClosing` 登记自身的条件撤回动作，页面走掉时由宿主带 `keepalive` 执行，决定丢掉时编辑器也同时关掉：工作台把插件页里打开的那条记录记在本机（`molis-work-plugin-records:<项目>`），好在刷新后重开，页面报告回到了列表（`data-expanded` 为 false）它才忘掉；不关的话，刷新后约 1.5 秒工作台会按 id 去开已丢掉的灵光，页面就显示「这条灵光已丢掉或不存在」。不丢的：屏幕上有字或最后见到的那一份有字时不关编辑器、记录留着，刷新后照旧重开；丢掉被拒时编辑器已经关了、记录已忘，刷新后是列表，灵光还在（助理或 MCP 在本页最后一次读到列表之后才写进这条的字，Host 拒绝这次丢掉，灵光和字都在；`lingguang.discard` 的 `expected_updated_at` 是可选入参，不带时行为不变）；只是浏览器标签或窗口被藏起来（`document.hidden`）不算离开。已知的另一处局限：指向已丢掉的空白灵光的条目标签、放置链接，打开时按 id 去取，页面显示既有的「这条灵光已丢掉或不存在」；已丢掉的条目在标签、链接里怎么显示，要用户来定，本页没有单独处理。工作台历史里的那一步不再留下记录（用户 2026-10-10 定，`specs/repository-anti-corruption/spec.md` §1）：「记下」→「返回」之后按工作台的后退键，会回到指向这条已丢掉灵光的那一步（历史记的是 `plugin:lingguang|<id>`），从这条空白灵光用工作台的后退键回到列表时本页同样丢掉它，随后按「前进」也是这样；约 1.5 秒后工作台按 id 去开它，页面显示一次「这条灵光已丢掉或不存在」，但 `jumpToRecord` 的安静重开（后退、前进、刷新）里，`showsIt` 只在页面展开（`data-expanded` 不是 false）时才把工作台自己补写的 `named_by: "workbench"` 当作插件在显示它（链接、放置「打开」、全局搜索这几条非安静的路径不变，仍把它当作在显示，因为有的插件，如 Todo 的批次整理，把内容开在列表页里），页面还停在列表，所以约 8 秒的安静计时到了，记录里仍是它在找的那一条就忘掉它（`molis-work-plugin-records:<项目>`；这段时间里人打开了别的条目，那一条的记录留着），再前进、再后退或刷新，页面都停在列表，刷新后没有那句话（`tests/plugin-small-ux.e2e.test.ts`）；那一句只出现在后退的那一次，留到再打开别的条目或刷新，没有新的页面事件去清它。删掉一个条目后按后退键同理。关掉编辑器时（`closeWorkspace`）本页同时更新 `data-assistant-context`，不再把已丢掉的灵光当作当前对象（`tests/lingguang-blank-discard.test.ts`）。丢掉仍是软丢弃（记录保留为已丢弃）。生命周期用 Host 注入的 `mountPluginClient`。
  - 项目被删除时平台按 Manifest 里 Home 库的 `project_rows`（`src/database.ts`：确认框里的标签与要删的表）删掉灵光、对话与消息，连同请求回执；插件的代码不参与，平台在自己的连接上删，库不存在时不创建，重复运行没有副作用（PG-024）。
- 改动后必跑：`node scripts/run-tests.mjs tests/lingguang-actions.test.ts tests/contextual-create.test.ts tests/lingguang-plugin.test.ts tests/lingguang-mcp.test.ts tests/project-deletion-owners.test.ts tests/lingguang-blank-discard.test.ts tests/lingguang-client-bundle.test.ts tests/list-silent-refresh.test.ts tests/todo-from-inbox.test.ts tests/lingguang-store.test.ts tests/plugin-client-served.test.ts tests/document-plugins-error-model.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/plugin-small-ux.e2e.test.ts`
- 编辑基准定向回归（需要本机 Chrome）：`node scripts/run-tests.mjs tests/content-editing-regressions.e2e.test.ts`。
- 相关手册：[skills/molis-prologue-ai/SKILL.md](../../../skills/molis-prologue-ai/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
