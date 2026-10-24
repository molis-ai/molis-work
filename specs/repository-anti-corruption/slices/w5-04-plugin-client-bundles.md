# W5-03 / W5-04 逐插件：稳定翻译键与打包的客户端

状态：执行中（2026-10-23）。Todo 片（RAC-130～134）评审修订已完成，定向验证记录见 PR；CI 与共享核心集成全量待核对；Issues、Jelly、Images、Cognia、灵光各自一个 PR，编号段见下。

验收编号：RAC-130～149。

## 目标

两件事一起做，一个插件一个 PR：

- W5-03（PG-071）：插件页面上的字改成稳定键 `<插件>.<区域>.<名称>`，中英文都放在插件自己的 `src/messages.ts`，登记在 `registration.ts` 的 `messages`；页面代码不再用中文原文当键。工作台的 `i18n/en.ts` 不再为该插件的页面文字 import 词典。
- W5-04（PG-056、PG-070）：插件的浏览器代码改成 `src/browser/*.ts` 的 TypeScript，`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/<插件>-client.js`；请求只经共同的 `molisWorkRequest`，不直接 `fetch`。样板是 Form（W4-04）；翻译样板是 Images（#751）。

## 做法（给后面的片）

1. 把 `client.ts` 的模板按部件拆成 `src/browser/` 的 TypeScript，入口仍是 `(host) => …`。宿主与插件共用 `@molis-ai/molis-work-contracts/platform/ui` 的客户端宿主、翻译和生命周期类型；插件从共同宿主 `Pick` 实际使用的字段，不再自写接口。`molisWorkRequest` 的形状在合同里定义，全局装配声明只在 Plugin SDK 公共入口提供一次（客户端仅作类型导入；合同包不持有全局变量）；请求仍走现有助手，保留作用域取消与迟到响应拒绝，不另做 fetch。父框架内部接口与交给插件的接口职责不同，不强迫父框架实现子页面能力。
2. `package.json` 的 `typecheck`/`build` 检查 `tsconfig.browser.json`，再用包内直接声明的 `esbuild`（与根同版 `^0.28.2`）打包，命令直接写 `esbuild`，不写根目录二进制相对路径。`src/client.ts` 只读 `dist/<插件>-client.js`。升级 esbuild 会改变压缩字节：同资源缩小或持平照常，必要增长按既有资源评审规则登记，不能用工具升级绕过额度。
3. 页面每句话用 `<插件>.<区域>.<名称>`，`messages.ts` 保持一个键对应 `{ zh, en }` 的平表，迁移时按宿主最终合并的 `EN`（包括末尾 `GAP_EN` 等覆盖）保留实际显示英文，键不改名。`registration.messages` 是当前载体，未来 Manifest 语言文件迁移只做机械转换，本片不实现字体皮肤语言书 ⑥。
4. 原中文词典只保留该主人尚由宿主动态翻译的声明/内容。仅别的主人调用的词搬给调用主人的现有词典，无调用的词删掉。词典移出使冲突减少时，逐键核对此前与此后生效英文，并在 PR 列出跨页面变化；不把冲突数下降误写成所有英文不变。
5. 测试调用 `scripts/gates/translations.mjs` 的 `scanTree` 检查真实翻译调用和稳定键，不另抄只认某种引号的弱正则。打包内容用解析器独有的 `大后天` 等标识确认。浏览器验证实际 opaque 工厂参数及请求发出的 URL，包含 Home/项目作用域，继续跑页面授权、跨插件拒绝与卸载取消回归。新文件先 `git add -N`，门禁只读已跟踪文件；构建后资源实测缩小才更新预算。
6. 插件身份只来自 Manifest：父框架从 `pack.plugin_id` 给 `FrameConfig.pluginId`，子页面给出 `host.pluginId` 和 `host.pluginRoute(relativePath)`。后者拼当前项目前缀和插件路由；`host.route` 保留平台路径语义。插件请求和上下文复用宿主给的身份，不再写死自己的 id；父层仍覆盖上下文身份并持有页面授权。

## Todo 片（本 PR）

范围：Todo 的 249 条稳定键及客户端迁移；评审收尾还包含 `packages/contracts/src/platform/ui.ts`、Plugin SDK 公共入口的全局类型声明、工作台 iframe 父子连接、已有 Form 客户端共同类型与 esbuild 依赖、现有请求全局重复声明、各文案主人的现有词典、BL-455、Skill/手册和定向测试。不动 Todo Manifest（#1098）、未合入的 #1132/#1137 客户端、统筹 privileges 或协调表。

本片先搬出仅其他主人调用的 10 条 `TODO_EN` 文案（取消选择、周日～周六、昨天、全角冒号），删除死键「查看」；核对宿主整键查表后再删除 8 条无 Todo 翻译调用的旧键（明天、提醒、在等、你、稍后、顿号、中文逗号、中文分号），保留 58 条 Todo 的动作 schema 字段标题/选项、首页事项、搜索结果和项目数据标签等动态翻译来源。它们的删除条件归字体皮肤语言书 §6.1 的语言覆盖合同，不能误指仅覆盖动作标题/说明/摘要的 §6.2 ⑥及实现方案 §7.4；语言覆盖归属已经明确；后续实现遵循该需求书的授权与实施阶段，本片不启动 ⑥。

完成标准为本片工程可合入：两端类型检查、实际 opaque 工厂/路由与生命周期回归、README 必需相关测试、构建/API/翻译/健康/边界/资源/凭据检查通过。共享核心全量由统筹集成批次统一跑，不声称本机已跑或用户已验收。

本轮核对完整词典执行顺序后，修正原评审的四词结论：跨主人实际变化为「记下」Add → Save、「关联」Links → Relate、「暂时读不到」Can't be read right now → Cannot be read now；「尚未保存」始终被末尾 `GAP_EN` 覆盖为 Unsaved。Todo 稳定键中的 14 条改回迁移前实际显示值，249 个键及中文不变。

## 验收

- RAC-130：Todo 页面（`ui.ts`、`src/browser/`）用到的每个 `todo.*` 键在 `TODO_MESSAGES` 里都有中文和英文，两种语言的占位符一致；翻译器调用的参数里没有中文原文；使用翻译门禁同一调用扫描，原词典无仅其他主人调用的条目。
- RAC-131：Todo 的浏览器代码是 `src/browser/` 的 TypeScript，类型检查通过，构建出 `dist/todo-client.js`，`TODO_CLIENT_FACTORY_SCRIPT` 能当函数解析，内含快速输入的解析、`data-assistant-context`、`molis:assistant-effect`、输入法确认不提交，没有 `confirm`/`alert`/`prompt`。
- RAC-132：浏览器代码不直接 `fetch`，请求经 `molisWorkRequest`；不含 `any`、`as unknown as`、空 `catch`；构建跑浏览器类型检查；宿主与 Todo/Form 满足同一公开接口，真实 opaque 工厂拿到 Manifest 身份与 Home/项目插件路由，客户端使用注入前缀发请求，卸载取消语义保留。
- RAC-133：`/assets/molis-work-plugins/todo.js` 的字节数与实测一致（`tooling/gates/page-assets.json`），变化写进 PR。
- RAC-134：行为不变：Todo 的单元、整理、HTTP、页面与端到端用例（README「改动后必跑」）在 CI 全量中通过；英文界面的每句话与迁移前相同（249 条逐键比迁移前最终合并的 `EN`，含末尾 `GAP_EN` 等覆盖；其中 14 条不能照抄原 `TODO_EN` 的独立值）。

## 后续片编号（预留）

| 片 | 验收编号 | 备注 |
| --- | --- | --- |
| Todo R11（Inbox/灵光转待办走通用交接，工作台不再认识 Todo 的输入） | RAC-135～137 | 在灵光片之前 |
| Issues | RAC-138～139 | |
| Jelly | RAC-140～141 | |
| Images | RAC-142～143 | 翻译半边 #751 已做，只补 W5-04 的打包 |
| Cognia | RAC-144～145 | 不动 `*actions.ts`（#1117） |
| 灵光 | RAC-146～147 | 不动 `*actions.ts`（#1117）；其客户端碰 `data-make-todo`，排在 R11 之后 |

积压编号：BL-455～459。BL-455 只保留 Todo 宿主动态翻译的来源，按字体皮肤语言书 §6.1 的真实合同接通后逐类删除；10 条跨主人借词、1 条死键及核实无 Todo 翻译调用的 8 条旧键在本片清理。
