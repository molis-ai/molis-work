# Onboarding 配色与主体对齐

状态：完成。完成等级3。用户明确授权只改 onboarding 页面颜色，风格不变。

证据：onboarding-styles.ts 硬编码灰绿色底 #f1f3f2、墨绿文字 #1f272b、蓝色强调 #5068b7，且强制 light；主体 immersive 工作台使用 #fff/#f8f9fb、#272932、#6262d6 与对应深色。

范围：将 onboarding 的背景、文字、分隔/输入线、选中、焦点、错误、阴影改成与主体对应的有限主题变量；沿用现有外观 bootstrap 读取用户 light/dark/system 设置。新建/首次使用/更新提示共用样式；终端容器保持终端本色。保留每个布局值、字型字号、动效、步骤、文案、交互与真实初始化接口。

非目标：首页实施、改变 onboarding 风格与构图、重做表单、Runtime 或权限逻辑。

边界：design-system onboarding styles / 既有 theme bootstrap 组合，Workbench onboarding renderer；必要局部验证。无数据库变更。

验收：主背景/正文/强调色对应主体浅深主题，焦点/选择/错误可读；初始/选择器/后续步骤/更新页一致；布局与输入流程保留。pnpm build，既有 onboarding 定向测试与桌面/手机浅深截图一次检查。更新当前隔离预览及已授权本机 Core/Web，不改用户项目。


## 完成证据
- 通过：浅色 canvas #f4f5f8 / ink #272932 / accent #6262d6；深色 canvas #111216 / ink #e8e9ee / accent #a7a6f5，与主体对应。复用已有主题 bootstrap 与主题变化监听，未引入另一套偏好存储。
- 通过：只替换色值与主题组合，保留原有尺寸、字体、排版、文案、步骤、动效和接口。真实截图发现共享 SVG 缺少笔画样式在深色下变黑，补用 currentColor 的原始图标笔画。
- 通过：最终 pnpm build，日志 /private/tmp/molis-work-onboarding-palette-build.log；既有 8 项 Onboarding HTTP/浏览器/终端测试全过，日志 /private/tmp/molis-work-onboarding-palette-tests.log。最后 SVG 调色后重新构建和浏览器复核，未重复运行不涉及颜色的行为测试。
- 通过：CUA 实际桌面浅深与窄屏浅深检查；下拉菜单/选中/焦点/错误提示与最终箭头复核。浏览器临时尺寸和主题模拟已清除。后续步骤与更新页沿用共用变量并通过既有行为测试，未逐页补拍截图。
- 通过：本机 0.2.0 Core/Web 同版本刷新与服务重启；隔离预览 64521 已载入最终构建。没有创建用户项目或改 Runtime 配置。
- 首页仅交三份生成式方案，生产首页未实施新方案。
