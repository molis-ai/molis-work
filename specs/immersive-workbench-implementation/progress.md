# 执行与交付记录

2026-09-12：已完成生产接入，完成等级 3（功能可用）。用户授权「开始开发」，随后明确「对话先置灰」「进入项目先到项目首页」，均已纳入唯一 spec。

| Item | 结果 | 证据 |
| --- | --- | --- |
| shell | 通过 | 项目首页、两层目录、纯文字插件条、32px 顶栏、固定 Goal 框；默认终端、禁用对话；右栏桌面并排、窄区覆盖；目录/右栏/终端及视角保留 |
| conversation | 按用户要求延期 | 无发送/停止/投递协议改动；禁用标签无法点击或键盘激活 |
| plugins | 通过 | Projects module 保存项目入口；catalog 10→11 迁移保留旧入口；真实 HTTP 添加/重复/无权限/未知项目与插件/重开读回；市场搜索与选项目、双项目浏览器隔离；Artifacts 同页精确版本与导出 |
| verification | 通过（已声明的未运行项除外） | 完整 pnpm build、boundary:check（errors=[]）、diff --check；相关业务与浏览器测试；1440/1024/390px、深浅主题、键盘、无水平溢出；本地真实 PTY 与 Session 重启读回 |

## 定向验证

- projects-module.test.ts：3 项通过。
- project-catalog.test.ts：17 项通过（含旧目录升级和未来 schema 拒绝）。
- project-plugins.test.ts：2 项通过，正式 HTTP、SQLite 状态、无重复事件和重开读回。
- artifact-browser.test.ts：5 项通过，包含同页片段、精确版本、转义、跨项目缺失和导出。
- goal-event-document.e2e.test.ts：3 项通过，真实备注/配置/上报/决定/关闭写回、历史与分页失败重试。
- goals-navigation.e2e.test.ts：3 项通过，浏览历史/键盘/失败恢复、归档与恢复、来源写入与 Feed 刷新。
- immersive-workbench.e2e.test.ts：3 项通过，首页入口/刷新/深链、禁用对话/终端保留、市场双项目与 Artifacts 同页。
- goal-canvas-workspace.e2e.test.ts：1 项通过，固定框、视角与未提交草稿、右栏偏好、窄区覆盖与焦点。
- work-terminal-client.test.ts + session-tui-capture.test.ts：11 项通过，连接/断线重连/不误启动/跨 Goal 响应丢弃及真实 PTY 输出持久化。

旧测试中已取消的顶部 Goal tabs、70/30 拖动分隔条和手机堆叠断言改为新合同；原本有效的事实不写入、失败恢复、历史与键盘验证保留。未跑与本次无关的全部仓库测试。

## 布局检查

截图：.impeccable/review/production-{home-light,goal-light,goal-dark,goal-1024,reader-1024,goal-mobile,reader-mobile}.png。截图来自正式页面和隔离项目。

一次成组检查后集中修正：旧样式隐藏窄窗口 Goal 列表；右栏继承 grid-column:2 导致覆盖区偏到框外；目录标题隐藏误藏新增动作；深色选中项、搜索图标和重复阅读导航。确认轮通过，不继续做无关视觉微调。定向设计静态扫描无发现。

## 实际边界与预览

- 本机真实 PTY 测试已运行；没有启动外部 AI 任务或新对话能力。
- 原生 macOS App 未重新安装/打包/启动验证，因此不能宣称等级 4/5 或真实窗口标题栏已经验收。
- 隔离开发预览：http://127.0.0.1:64521/projects/project-88e68787-f14b-4362-893f-8068d2b4fd4c/ 。数据目录 /private/tmp/molis-work-immersive-preview-20260912，含明确标记的开发预览项目和空白项目，产品读写接口真实。
- 原型 64520 保留为对照；当前生产分支 feature/immersive-workbench，未提交、未发布，保留既有其他任务改动。

最终自检补充：目录选中按钮与外层行的状态原先不同步，已在 Goals 所属 selectTreeGoal 中统一更新；真实浏览器验证只有当前 Goal 行处于选中态，失败恢复、键盘和浏览历史继续通过。
