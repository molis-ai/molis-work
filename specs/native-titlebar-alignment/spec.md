# 原生工作台顶部对齐与全屏留白

## 目标与证据

用户在实际安装包中指出：左侧目录按钮、右侧标签或标题比红黄绿按钮高；全屏时仍保留原生按钮占位。本任务补齐 DV4 安装包实际使用检查中暴露的标题栏兼容问题，不代表整个重组验收。

现有 Desktop bootstrap 与 design-system titlebar 将控件上移 8px，48px 行中心因此成为 16px；原生按钮实际可见中心约 22px。安全区固定 88/80px，未消费真实窗口全屏状态。

## 范围与场景

保留现有模块、目录两行结构、标签、文字、交互、数据及普通 Web/Companion 布局。只调整 Native 顶部几何和全屏状态同步；不移动 macOS 按钮，不增加业务功能，不以屏幕宽度或最大化代替全屏。

- 普通窗口：目录按钮在红黄绿右侧，右侧标签/标题与它们同高。
- 原生全屏：左侧按钮回左边常规边距，不留红黄绿空位；高度不跳变。
- 退出全屏、全屏内页面跳转、收起/展开目录：正确恢复安全区，标签不重叠。
- 项目、全局设置和首页复用顶部规则；引导保留已验证高度，但消费同一全屏安全区。

## 实现与边界

`apps/desktop/src/shell.ts` 通过 Tauri 公开 `getCurrentWindow().isFullscreen()` 和窗口 resize 事件同步根节点全屏标记。首次查询和后续事件均使用实际窗口事实，不调用业务模块、不持久化窗口状态；查询失败保留安全的原生占位并记录诊断。

`packages/design-system/src/styles/desktop-titlebar.ts` 与既有 safe-area 样式统一顶部中心，移除错误的 -8px 偏移。首屏/设置/折叠目录使用同一安全区规则。测试调用生产 bootstrap，验证普通 Web、进入/退出全屏以及全屏内重新加载。

## 验收与验证

完成等级：真实 macOS 桌面可用。实际 App 对普通/全屏、展开/收起、右侧标签/标题和页面跳转批量检查；普通浏览器检查不受影响。模拟 Tauri 的测试只证明状态同步，不替代原生可见结果。

命令：`pnpm build`；Desktop bootstrap 与 visual-foundation 定向测试；`pnpm desktop:build:macos`；真实 App；`git diff --check`。

只使用隔离 App/Home 做验证，沿用已授权的临时停止/恢复 4173 服务方案；不得更改原用户项目或 Runtime 配置。当前目标仅 macOS，不宣称其他平台原生窗口均已验证。

## 状态

2026-09-06：本修复达到真实 macOS 桌面可用，未替换用户现用安装；不代表 DV4 或整体重组完成。

- 通过：`pnpm build` 和完整 `pnpm desktop:build:macos`，生成 App、DMG、zip；ad-hoc 签名校验成功，无 Apple 公证/公开发布声明。日志 `/private/tmp/native-titlebar-build.log`、`/private/tmp/native-titlebar-macos-build.log`。
- 通过：生产 bootstrap 的窗口→全屏→窗口、全屏内重新加载、普通 Web 导航行为测试；含既有 Native、折叠目录、两行标题栏定向检查共 6/0/0，日志 `/private/tmp/native-titlebar-targeted.log`。
- 通过：真实 DMG 经正式安装脚本装到 `/private/tmp/molis-work-native-chrome.Z0IHWN/installed-apps/Molis Work.app`，App PID 96219、隔离服务 PID 96278。普通窗口展开/收起目录，左侧图标、右侧 Goal 标签及红黄绿中心均约 y=22 CSS px；全屏红黄绿消失、按钮靠左，标签与按钮同高。退出全屏后安全区恢复，无重叠。项目设置标题同高；全屏内跳转全局设置再返回项目，按钮仍靠左。通过实际系统全屏按钮和 View → Toggle Full Screen 操作，不用 CSS 或浏览器模拟 Native。
- 通过：同一隔离新服务的普通浏览器页面，Native 标记缺省，安全区为 2px、目录按钮和标签均 y=7 / height=34（中心 24px），无 Native 上移。窄屏截图导航/内容可用，实际 CSS viewport 312px、scrollWidth 312px，无横向溢出；工具请求 390px 但浏览器缩放后的实测为 312px，不将其记为 390 CSS px。测试 tab 已关闭、viewport override 已重置。
- 通过：48 包 / 518 sources / 1599 imports / 71 edges 的边界检查 0 errors；布局检测无 findings；diff check 通过。
- 既有失败：完整 `visual-foundation` 加 bootstrap 共 29 pass / 1 fail。失败断言仍要求 Goal 搜索框 `display:none`，而 HEAD 生产代码已是 `display:flex`；用 `git show HEAD:...` 核对后确认非本次修改引入。保持产品行为，留给整体测试清理，不宣称全套通过。日志 `/private/tmp/native-titlebar-tests.log`。

原生 API 依据：[Tauri Window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/) 的 `isFullscreen` / `onResized`，未新增 native 权限或私有桥接。

09:02:43 UTC：测试 App 已正常退出，测试 LaunchAgent 已移除，原服务恢复 running/owned，原 plist、服务配置及安装清单逐字节不变。临时项目/日志保留，完整恢复记录在测试目录 `session.jsonl`；没有修改用户原项目或 Runtime 配置。
