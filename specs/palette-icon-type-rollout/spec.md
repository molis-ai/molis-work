# 色板、图标与字体整仓收口

## 背景与目标
Catalog 已有 Linear 色相、内容标记、Lucide 图标库，以及 Inter Variable。产品和胶囊仍散落旧 hex、第二套加粗、SF/PingFang 栈，插件图标也不都从库里按角色取。

目标：按同一套色板和图标把工作台、设置、项目列表、Onboarding、胶囊收成一套。完成等级 3：真实页面用 token / 库图标 / Inter+中文无衬线，浅深色可核。不宣称原生包、不杀 4180。

## 当前行为与问题
- 字重 450–750 仍写在产品 CSS 里，靠末尾 `!important` 压；Shelf / 胶囊不在覆盖名单里。
- 中文走系统 PingFang，和 Inter 几何不完全同类。
- 胶囊仍是旧靛 `#4f6ff7` 和 SF 栈。
- Inbox 轨图标是 `input`，Feed 是 `activity`，和市场「加号」都不是色板角色。
- 标签分组色仍手写 `light-dark(#…)`，不走 `--hue-*`。

## 范围与非目标
范围：
1. 拉丁 Inter Variable，中文自托管 Noto Sans SC Regular（几何无衬线，接近 Inter）；系统 PingFang / 微软雅黑只做回退。
2. 产品 CSS 字重收成 400；全局 `font-weight: 400 !important` 覆盖工作台、设置、索引、Onboarding、胶囊。层级靠色和字号。
3. 插件轨、设置段、标签图标按色板角色从 Lucide 库取。
4. 标签分组色、胶囊平面/状态色别名色板；Shelf 继续 `--content-*` / `--mark-*`，不重涂成锌灰。
5. Catalog 色板后增加「字体」标本。
6. 产品壳与插件展示 CSS 里的硬编码 hex（Ant Design 蓝选中、浅色专用纸灰、Onboarding 旧紫）收到 Linear token。组件规则里的色值不能靠后层变量覆盖。
7. Goal 文档与工作台 chrome 的 hover / 当前走 `--nav-hover` / `--nav-active` / `--ink`；靛只留给链接、焦点和 `::selection`。
8. Shelf 动作图标（搜索、复制、隐藏、删除、对照、下载、对话、新建）接 Lucide sprite；文件类型 SVG 仍不重画。
9. 终端 xterm 与深色标题栏平面别名 Linear 产品值。

非目标：不迁 React；不把正文阅读面改成彩字；不重画 Shelf 文件类型 SVG；不改 Goals/Feed 数据模型或业务流程；不改用户 4180；不提交。

## 使用场景
1. 打开工作台：中英混排是 Inter + Noto Sans SC，标题和按钮都是 Regular。
2. 插件轨：Inbox 是 inbox，Feed 是 rss，Artifacts 是 package。
3. 深浅色切换后插件色、状态点和内容标记仍来自同一张表。
4. 菜单栏胶囊和 Catalog 字体标本同一套字色。

## 方案与关键决策
- 中文用 Noto Sans SC 400，不引入第二套字重。CSP 同源 `/assets/noto-sans-sc-400.woff2`。
- Action 仍是近黑/近白；靛只做 focus / 进行中。
- 插件图标：home、target、terminal、inbox、rss、library、package；市场用 grid。
- 设置：外观 sun、运行时 terminal、规划 workflow、诊断 bug；项目常规 tune、说明 book、规则 shield。

## 文件边界
允许：`packages/design-system`（typeface、fonts、catalog、palette、foundation/onboarding 默认 token）、`apps/workbench` 样式与壳图标、`apps/local-host/src/web-assets.ts`、`apps/desktop/src/capsule-shell.ts`、`plugins/native/*/src` 展示 CSS 与图标、`DESIGN.md`、本 spec、定向测试。
禁止：Goals/Feed 领域写入、用户 home、docs/design 历史切片。

## 验收
1. Catalog 色板后有字体标本；计算字重为 400。
2. 工作台中文走 Noto Sans SC（未加载时回退 PingFang），拉丁走 Inter。
3. Inbox / Feed / Artifacts 轨图标为 inbox / rss / package。
4. 胶囊 `--accent` 为 Linear 靛，字重 400。
5. 工作台样式不含 Ant Design `#1677ff` / `#328bff` 选中渐变；树选中与设置导航选中走 `--nav-active` / `--ink`。
6. Goal 文档 chrome hover 不用 `--blue-soft` 当选中底；Shelf 动作图标走 `#icon-*`。
7. 定向测试通过；隔离 4182 核 Catalog、Home、设置、Goal 文档 hover。

## 验证命令
```
./node_modules/.bin/tsc -p packages/design-system
./node_modules/.bin/tsc -p plugins/native/goals
./node_modules/.bin/tsc -p plugins/native/shelf
./node_modules/.bin/tsc -p plugins/native/work
./node_modules/.bin/tsc -p apps/workbench
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/visual-foundation.test.ts tests/coss-control-language.test.ts tests/shelf-plugin.test.ts
```
浏览器：`http://127.0.0.1:4182/__ui/catalog` 与项目首页、设置。
