# Characters 管理入口修复

状态：完成。本次修复范围内功能可用；工程验证与浏览器实操通过，尚未由一骏本人验收。

## 背景与证据
- 用户反馈 Characters 插件点不开、图标颜色异常。
- 在本机 4173 服务的示例项目实操，点击 Characters 后标题改变，但页面没有 `data-work-surface="characters"`，内容空白；当前源码的 Host 已提供该页面，需要用新启动的服务区分旧进程与源码缺陷。
- Design System 的 `MW_PLUGINS` 缺少 `characters`，因此没有主题 token、导航和页面 tint 绑定，图标退回灰色。Manifest 的 `user` 图标有效。
- 当前工作区存在其他任务的未提交改动和构建；保留这些改动，只处理本修复影响面。

## 范围、场景与非目标
恢复从项目导航打开个人 Characters 管理、创建/编辑/保存/重新打开、预览固定发布版本的主路径；补全主题色。保留既有个人草稿、版本与权限契约，不重做编辑器、不改变 Coding 执行选择规则，不自动发布或修改用户角色。

## 方案与边界
- 在 `packages/design-system/src/palette.ts` 为 Characters 登记已有 purple 色阶，由共享生成器统一输出明暗主题与各处 tint。
- 用隔离项目运行当前源码构建；检查 Host (`web-goals-read.ts` → `coding-surface.ts`) 到 Workbench 页面与 Characters 客户端的真实链路。若源码已正确挂载，更新旧本地服务加载的代码，不加重复挂载补丁。
- 插件自身 UI/客户端仅修复实操证实的问题；发现新行为缺口先更新此 spec。
- 依赖：Node 24、现有 workspace 包、Local Host、Characters Module 和 Artifact 服务；测试全部使用临时 home/project。

## 输入输出
输入为个人草稿名称、做事方式、既有工具范围；输出为持久化草稿及用户确认后的精确项目发布版本。当前项目路由、控制令牌和权限由既有 Host 提供。

## 验收与验证
1. 导航能显示 Characters 列表/空态，未启用 Coding 时仍可使用。
2. 新建、编辑、保存、刷新后重开保留内容；发布预览正常，确认后版本可读取。
3. 图标使用现有 user glyph，Characters 有明暗主题色和导航/page tint，不回退默认灰色。
4. 定向回归 `node --import tsx --test --test-concurrency=1 tests/characters-publication-http.test.ts tests/characters-module.test.ts`，并增加与本次缺陷对应的主题验证。
5. 构建/类型检查受影响包，使用 CUA 在隔离浏览器实操桌面主路径及窄屏编辑操作。

## 假设与开放问题
- 使用现有紫色色阶是可逆的视觉选择。
- 已确认 4173 旧进程没有输出 Characters 页面，新启动的相同项目服务正确挂载；无需修改导航或重复挂载页面。已重启该本地服务加载当前构建。

## 验收记录
- 通过：在未启用 Coding 的隔离项目，从侧栏打开 Characters 空态，新建角色、编辑两行正文、保存修订 2、预览并确认发布 v1、刷新后重新打开；正文和固定版本均保留。
- 通过：1440×960 桌面与 390×844 窄屏实操；窄屏保存按钮可滚动到达并成功保存修订 3，已发布 v1 仍对应修订 2。
- 通过：深色实际图标 `rgb(192, 160, 234)`，浅色页面 tint `#7f5eb0`；均使用现有 user glyph。无浏览器控制台错误。
- 通过：`pnpm --filter @molis-ai/molis-work-design-system build` 和 `typecheck`。
- 通过：Characters Module 与真实 HTTP 发布回归共 8 项；新增 `tests/characters-appearance.test.ts` 3 项，验证明暗主题、导航/页面 tint 和 glyph 派生。独立子进程移除颜色注册后，两个颜色测试按预期失败。
- 通过：日常 4173 服务重启后，在原示例项目再次点击 Characters，实际列表空态显示，`body.dataset.desktopSurface` 为 `characters`，图标为紫色。该项目没有写入测试角色。
- 无本次范围内未完成项；未重打包桌面安装程序，未扩展验收到 Coding 执行质量。
