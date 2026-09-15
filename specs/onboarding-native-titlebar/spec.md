# 首次引导原生标题栏修复

## 目标与证据

2026-09-06 用户截图指出 MOLIS_WORK 与 macOS 红黄绿按钮重合、垂直未对齐；在最终隔离 App 的 `/onboarding?desktop=1` 复现。当前引导页 header 高 60px、左 padding 随视口约 38px；Native 按钮位于约 x=22/45/69、y=22，因此品牌既进入安全区又低约 9px。页面也没有引入已有 Native bootstrap，缺少 query 的真实 Native 导航不能可靠启用安全区。

## 保留、修改与非目标

保留首次引导的视觉、文字、所有步骤与真实状态、普通浏览器及手机布局；不移动系统按钮、不修改其他工作台标题栏、不重做 Onboarding，不创建项目或启动 Runtime。

只修 Native 引导页 header：使用同一排 44px 高的标题栏，左侧沿用现有原生安全区 88px；品牌与右侧操作在系统按钮的垂直中心附近对齐。接入既有 Desktop 公开 bootstrap，识别实际 Native 环境并保留本地导航标记。CSS 只作用于 Native 引导页，不把浏览器/窄屏强行加 88px 空隙。

允许修改 `src/web/render.ts` 的 Onboarding markup/CSS、相应验证与开发说明；不借此做巨大 render 文件的额外迁移。使用实际 App 截图确认无重合和高度对齐，点击品牌/迁移/跳过仍可用。普通 Web 与窄屏通过实际浏览器查看，相关首次引导 HTTP 回归不产生多余数据或 Runtime 绑定。完成等级：实际桌面可用，而非全产品验收。

## 验收与命令

- Native 品牌不进入红黄绿区域，文字与按钮中心视觉对齐；右侧操作保持同高且可点击。
- 普通 Web header 原尺寸/位置不变，窄屏仍可见主要退出操作。
- Native bootstrap 复用公开实现，不新增第二套环境检测。
- `pnpm build`；`node --import tsx --test --test-name-pattern='Web first-run onboarding' tests/web.test.ts`；实际 App 与普通 Web 验证；`git diff --check`。

当前只有 macOS App 是此次实际目标，不据此宣称其他系统的原生标题栏均通过。

## 验证结果（2026-09-06）

- 通过：当前源码 `pnpm build`、首次引导 HTTP 定向测试 1/0/0、完整 macOS App/DMG/zip 构建。日志分别为 `/private/tmp/onboarding-titlebar-build.log`、`/private/tmp/onboarding-titlebar-test.log`、`/private/tmp/onboarding-titlebar-macos-build.log`。App 为本地 ad-hoc 签名，不代表公证或公开发布。
- 通过：正式 DMG 安装脚本将新包安装到 `/private/tmp/molis-work-titlebar.v4rWwL/installed-apps/Molis Work.app`。实际 Native App 首启、退出重开截图中，品牌从 x≈88px 开始，品牌、右侧操作和红黄绿按钮视觉中心均约 y≈22px，无重叠。迁移入口打开项目设置；品牌回首页在未跳过状态下正常返回引导；跳过进入空项目首页，没有创建项目或 Runtime。
- 通过：普通浏览器 1024px 下 header 仍为 60px、无 Native 标记；390×844 下品牌保留约 18px 左间距，右侧跳过可见。不是用浏览器截图替代 Native 验证。
- 通过：08:20:58 UTC 测试 LaunchAgent 已移除、测试 App 已退出，原服务恢复 running/owned。原 plist、服务配置与安装清单逐字节不变；普通网页隔离测试进程也已结束。完整恢复记录在上述临时目录 `session.jsonl`，截图已在本对话呈现。

本修复达到实际 macOS 桌面可用；未替换用户现有 App/Home，也不代表整个重组或 DV4 已验收。升级提示页复用同一 CSS/bootstrap，但此次未独立触发升级提示场景。
