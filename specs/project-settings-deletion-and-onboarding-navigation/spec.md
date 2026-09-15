# 项目基本设置、删除与引导导航修复

## 目标与完成等级

用户要求项目设置支持删除项目，并修复引导页右上角“迁移已有数据 / 返回项目目录”点击无反应。目标为功能可用，并完成隔离数据下的浏览器与 HTTP 验证；不包含安装或发布桌面包。

## 当前证据

- 项目设置只有项目说明、工作规则和工作规划，改名位于全局项目管理；ManagedProjectDeletion 已实现确认、活动工作保护、关联清理、持久化删除回执及重试，但普通项目没有 Web 删除入口。
- onboarding-topbar 与全屏 onboarding-room 都为 z-index: 1，后出现的 room 覆盖导航命中区域。
- 新项目引导的退出直接跳到 /，没有保留 desktop 查询参数。

## 范围与方案

- 项目设置增加“基本信息”页，包含项目名称保存、删除入口；既有项目设置导航和全局项目管理均可到达。沿用现有视觉和中英文文案体系。
- 点击删除打开具名确认框，说明永久清除 Molis Work 项目数据与关联、保留工作目录文件；明确确认后提交。取消/Escape 不写入；提交中禁止重复提交；错误原位显示且可重试。
- 新增受本地控制 token / Origin / 操作键保护的 POST /api/settings/projects/:id/delete，固定可信 Web actor，复用 catalog.deleteProject。客户端保留删除请求键用于网络结果不明或物理清理失败后的重试，HTTP 一次性操作键每次独立。
- 拒绝删除仍有运行终端的项目，保留底层有效 Claim / 未结束 Run 保护；删除前释放该项目的 Host 连接和 Web 缓存、Feed 调度引用。成功清理后回项目目录；物理清理尚未完成则显示实际状态并允许重试。
- 提高引导导航层级，保证 Web、desktop 模式与窄屏的链接/按钮命中；退出保留 desktop 上下文。

## 非目标与边界

不重做设置系统或引导视觉，不改目标协议、删除存储语义、Runtime 配置，不删除用户真实项目，不自动结束运行终端，不安装/发布。用户已有 desktop/20260902-022934.jpg 删除不触碰。

允许修改 Workbench 设置渲染/导航/客户端/样式/i18n、Design System 引导样式、Local Host 设置 HTTP 与必要页面/生命周期装配、相关测试。

## 输入输出与依赖

基本信息页消费当前项目导航事实；改名沿用已有 API。删除输入为 project_id、delete_confirmed=true、idempotency_key；输出为既有删除回执与清理状态。底层 Projects owner 负责数据库/关联清理；Web owner 负责当前进程资源释放。输入无确认或无合法请求键时不得删除。

## 验收标准

1. 从项目设置进入基本信息，改名实际保存，刷新与目录显示新名称。
2. 删除确认显示当前项目和影响范围；取消不删除，确认后真实移除目录、数据库和绑定，其他项目与工作目录文件保留。
3. 未授权请求、缺少确认/请求键、活动工作被拒绝；失败仍可重试，重复删除回执一致；已打开过的项目删除后不再被缓存提供，访问返回 404。
4. 引导页迁移入口、返回目录和首次使用跳过可由真实指针点击；宽屏、窄屏和 desktop 模式正常，退出保留 desktop=1，不创建额外项目或绑定。
5. 新页/确认框在宽窄屏、明暗主题下可用，英文关键操作完整；类型构建及定向测试通过。

## 验证

pnpm build；node --import tsx --test --test-concurrency=1 tests/project-settings-deletion.test.ts tests/project-settings-navigation.e2e.test.ts；定向 project-catalog 删除测试；git diff --check。浏览器回归使用已有隔离 Chrome fixture 与真实指针事件，并保存检查截图。

## 假设与开放问题

“删除项目”按既有底层语义永久清理该 Molis Work 项目；用产品确认框保障显式操作。无阻塞问题。

## 验收结果（2026-09-11）

1. **通过**：浏览器从项目设置导航进入基本信息，提交改名并真实重载；HTTP 重读与持久化目录均为新名称。
2. **通过**：真实点击取消与 Escape 均不删除；确认后移除数据库目录、Runtime 绑定和项目的工作目录关联，其他项目与共享工作目录文件保留。最后一个项目删除后回到空目录。
3. **通过**：HTTP 拒绝错误 token、外部 Origin、缺少确认/请求键；真实 cat 终端运行时拒绝删除、用户关闭后成功；底层活动工作保护回归通过。打开过的项目删除后 Host 释放，旧 API 与设置页返回 404。模拟物理清理失败后复用原回执完成清理；模拟删除成功但响应丢失后，UI 重试安全返回目录。
4. **通过**：真实 Chrome 指针测试覆盖 1440px Web、980px desktop 模式、480px Web 的迁移与返回入口；390px desktop 模式首次跳过，保留 desktop=1。既有首次跳过、初始化项目与 Workspace、升级提示回归全部通过。
5. **通过**：1280px 浅色与 480px 深色基本页及确认框截图人工查看；布局不溢出，确认框随内容高度；英文页面渲染与翻译回归通过。完整 pnpm build 通过，最终 UI 调整后的 Workbench build 通过，git diff --check 通过。

定向回归共 **18 项通过、0 失败、0 跳过**：新增 HTTP/浏览器 6 项、已有 onboarding 3 项、catalog 删除 1 项、i18n 8 项。日志位于 `/private/tmp/molis-work-project-settings-{build,final-tests,onboarding-regression,catalog,i18n}.log`，UI 截图位于 `/private/tmp/molis-work-project-settings-1280-light.png`、`/private/tmp/molis-work-project-settings-480-dark.png`、`/private/tmp/molis-work-project-delete-480-dark.png`。

完成等级：功能可用，并完成上述隔离集成/浏览器验证。**未运行**：重新打包安装 macOS App、实际 Native 窗口点击验收及全仓完整测试；本次 desktop 证据来自 Chrome 的 desktop=1 页面，不替代原生安装包验证。未修改用户已安装应用或真实项目数据。
