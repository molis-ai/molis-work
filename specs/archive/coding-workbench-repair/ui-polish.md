# Coding 工具界面整理

2026-09-23，接续 [修复需求](spec.md)。用户授权：使用现有组件板，整体优化 Coding 及伴随插件的交互、UI 与视觉动效。目标为内部可试用的真实界面；模型实际执行和原生安装包不在本次 UI 验证范围。

## 目标与方案

现有 `/__ui/catalog` 与 `packages/design-system` 是组件与视觉唯一来源。保留宿主导航、目录与连续纸面、插件读写边界、真实数据；不增加依赖、不改调度/审批/快照语义。当前问题：会话标题动作堆叠，窄屏编辑区受挤压；Files/Git 控件全平级，选择与加载反馈弱；空会话缺少起点；Workspace 表单与列表没有按共享原语排版。

- Coding：目录行、分段按钮沿用 `mw-dir`/`mw-dir-row`/`mw-toggle-group`；会话身份和次要上下文工具分开；输入框、材料工具与发送配置形成明确顺序；无轮次时提供可编辑的问题示例，点击只填草稿且不发送、不覆盖已有草稿。
- Files/Git：共享目录工具栏与选中态；固定阅读头部、只读代码面和独立快照操作；保留二进制/空文件/读取失败/固定版本语义。刷新/读取/保存有 busy 状态，失败可重试。Git 当前改动可辨认。
- Workspace/Diff/统计：共享字段、勾选、目录行、空态与文档头部；状态和版本来源清楚，长路径折行。
- 动效目的：分段选择延续组件板反馈，打开阅读内容和窄屏返回体现层级，结果区变化可感知；短时 opacity/transform，不循环装饰、不动画布局、不在轮询时重复播放。减少动态偏好下取消空间运动。

## 边界与验收

修改范围：上述 native 插件的 UI/CSS/client、Workbench companion composition/styles/client、必要的 Host 组合标记，以及现有 Coding 浏览器测试。共享 design-system 本身有其他任务进行中，只消费，不修改。保持原 `data-*` 调用链、会话草稿、宿主切换与授权行为。

验收：1360 桌面与 390 窄屏、浅/深色真实内容可操作、无横向溢出；目录/会话/结果返回路径和焦点合理；新空态示例不发送或覆盖已有输入；读取失败后恢复、Git 选中态、快照对比路径可运行；reduced-motion 取消新增空间动画；没有浏览器异常。定向类型检查/构建与 `node scripts/run-tests.mjs tests/coding-workbench.e2e.test.ts`，必要的现有 UI/插件回归；有效测试通过后不无故扩大。

主线程负责唯一实现；设计子代理只读建议。保留共享工作树其他修改，不提交、不发布、不重启用户服务。

## 交付核对

- 已实现上述六个插件的共享目录行、控件与阅读布局，Coding 分段切换采用 `aria-pressed` 以复用组件板滑块；手机工具按钮 44px，保持说明与可访问名称。
- 已接通无轮次问题示例（只填草稿，已有草稿时禁用）、文件重读/选区计数/复制确认/保存加载、Git path+side 选中与所有阅读入口的焦点恢复。Git 读取被历史/刷新/关闭打断后清除 busy，旧响应仍受 ticket 约束。
- 动效复用共享 `creative-arrive` 与 segmented tracking；仅阅读打开/结果进入变化播放，不给轮询内容重新播放；reduced-motion 下取消新增空间动画。
- 工程：Coding、Files、Git、Workspace、Diff、Workbench、Local Host 构建通过。共享工作树的其他任务一度导致构建/启动失败，在其接线完成、重新构建后恢复；未修改其他任务源码。
- `node scripts/run-tests.mjs tests/coding-ui.test.ts tests/coding-companion-http.test.ts tests/coding-companion-inputs.test.ts tests/files-plugin.test.ts tests/git-plugin.test.ts tests/diff-plugin.test.ts`：57/57 通过。
- `node scripts/run-tests.mjs tests/coding-workbench.e2e.test.ts`：真实 Chrome 流程通过；包括工作目录关联、文件读取和失败恢复、快照/统计、Git 两侧选择、会话草稿/标签恢复、新空态示例不发送、不覆盖、窄屏焦点与历史返回、无横向溢出、reduced-motion。未发送真实模型任务。
- 视觉：1360×900 浅色、390×780 浅/深色、1024×600 深色已检查。修正了截图暴露的内联表单高度继承和状态刷新覆盖图标。截图在 `.tmp/coding-ui-polish/`；不作为产品图像。
- 只读 review 对 Git 延迟请求交错的独立复现通过，无剩余必须修问题。源码与隔离浏览器验证完成；未重打包安装应用，未替代用户本人验收。

## 用户纠偏：以组件板实际画面为准（第二版）

用户明确否定第一版视觉。保留真实功能与调用链，替换自拼的目录、编辑区套框和常驻空结果列。直接对照 `/__ui/catalog` 的 Directory 与 Sidebar/Frame 截图（`.tmp/coding-board-reference/`）。目前 Frame/Sidebar 的完整样式被 `.mw-catalog` 限定，产品仅加 class 不会继承同样布局；用一个显式作用域让 Catalog 与这组工具共用同一规则，不复制出第二份数值。

Coding 桌面固定 240px 目录 + 连续主阅读面；标题 16px 与正文 13px 使用 Frame 的真实组件结构；次要配置折叠，结果由入口按需展开，有待处理事项时入口显示提示。编辑区取消外框套 textarea，使用组件板的字段/工具组合。目录使用实际 `renderDirectoryPanel` 与 meta row 结构，搜索/筛选按需展开。Files/Git/Workspace 的阅读头部与内容也共享 Frame 间距，删除自创 eyebrow 与大标题。验收加入 Catalog 与产品 computed style 对照、结果显隐，以及实际画面对照；工程通过不能再次代替视觉认可。


第二版实现额外修复组件边界：`renderDirectoryPanel({embedded:true})` 使用同一目录结构但不注册宿主 `data-directory-panel`，避免内嵌目录让宿主重复展开空栏。Catalog 的小屏标本尺寸仅作用于 Catalog；产品保持自己的容器适配。会话设置包含重命名，窄屏也能操作。

第二版核对结果：Design System、四个涉及 UI 的插件、Workbench、Local Host 构建通过；`coding-workbench.e2e.test.ts` + `coding-ui.test.ts` + `primitives.test.ts` 共 24 项通过。浏览器直接读取真实 Catalog 的 Frame 标题字号/字重/内边距，与产品 Coding 比较一致，并检查内嵌目录不产生重复宿主空栏、结果默认收起与展开、手机设置仍可重命名。1360/390/1024 的浅深色截图已核对，位于 `.tmp/coding-component-board-v2/`。layout 检测结果为空。

额外运行的全仓 `coss-control-language.test.ts` 仍有 3 个现存跨范围失败：Experiments 的蓝色焦点描边（同时触发汇总焦点断言），以及 Plugin Builder 的旧控件 class；不在本次 Coding 修改范围，未改动这些模块，也未放宽断言。视觉是否符合用户预期仍以实际画面反馈为准。
