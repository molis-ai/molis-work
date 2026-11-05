# Work 统一账号接入

状态：WORK-01 至 WORK-09 已实现并完成对应本地隔离验证，已知未通过项和验证边界见文末（2026-11-05）。Auth 仓库 `docs/unified-account/delivery.md` 已按 AUTH-12 汇总交付；真实存量迁移仍待 D-09。中央业务规则不在本规范重复维护。

后续执行按 Auth 仓库 `docs/unified-account/implementation-plan.md` 第 11 节，T-01 至 T-07 状态以其交付台账为准。本仓库仍遵守 [AGENTS.md](../../AGENTS.md)、[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)和[并行开发规范](../../docs/system/PARALLEL-DEVELOPMENT.md)；当前先做集成收尾，代码与合同变化后须核对对应版本的验证证据。

## 本轮范围

中央客户端、合同适配、可信配置、Host 安全入口，以及 SecretStore 持久会话、刷新协调、显式活动、重启恢复和两种退出。公开 DTO 来自固定 Auth 合同。中央身份与本地 actor 分离，未登录仍可本地使用。个人订阅、租户席位、权益事实留在 Auth。

邮箱/手机注册登录、验证重发及找回密码在产品内完成；Google/GitHub 授权通过浏览器回到本机 Host，不开放浏览器安装 Token 的接口。管理操作已有固定合同映射，具体动作随相应功能接入。短信、邮件和第三方提供方继续使用 Auth mock，无支付、真实账号迁移或业务共享。

## 验收标准

- **WUA-01** 固定 Auth 合同摘要、生成 DTO 与共享夹具一致；拒绝未知操作、字段、错误 client／环境／回调及不合法响应。证明：`tests/account-client.test.ts`。
- **WUA-02** 账号 HTTP 读取只接受本机 Host、控制 Token 与同源来源；错误 Origin 不回退，未知路径／查询／正文拒绝。证明：`tests/security-invariants-account-host.test.ts`，安全不变量 S-109。
- **WUA-03** 未配置或配置错误不破坏本地 Host；匿名不调用中央服务；安全视图不泄露中央凭据。证明：上述两个测试文件。
- **WUA-04** 当前账号变化、请求取消或 Host 关闭后拒绝迟到响应；独立 Home 隔离，借用 Web 监听器关闭不销毁 Host 账号。证明：上述两个测试文件。
- **WUA-05** 使用真实 Auth 隔离运行时，完成 mock 手机登录、读取、资料幂等更新与撤销后拒绝；不访问真实数据库。证明：显式运行 `scripts/central-account.test.mjs`。

- **WUA-06** 同 Host 共享会话；凭据只在加密 SecretStore，正常关闭后新 Host 从原 Home 恢复，浏览器无 Token 安装入口。证明：`tests/security-invariants-account-host.test.ts`、`tests/account-session.test.ts`。
- **WUA-07** 并发刷新只旋转一次；先持久销毁旧恢复材料，响应丢失、崩溃、持久失败及迟到完成都不得复活凭据。证明：`tests/account-session.test.ts`，安全不变量 S-110。
- **WUA-08** 显式活动遵循 30/90 天截止；背景读取/刷新不延期；离线只返回展示资料，不授予管理调用或权益。证明：`tests/account-session.test.ts`、`scripts/central-account.test.mjs`。
- **WUA-09** 当前登录退出不影响其他独立登录；全局退出向 Auth 撤销全部产品；本地先持久清空，远端未确认须明确返回，同键可取回结果，中央撤销后受保护调用拒绝。证明：上述测试、`tests/security-invariants-account-host.test.ts`、真实 Auth 隔离联调。

## WORK-02 验证记录

最终源码在官方独立 Node 26.9.0 与 Swift 6.3.3 / macOS 26.5 SDK 环境整体构建通过。账号客户端 14 项、会话状态机 23 项、Host 账号入口 9 项、本机入口 15 项，共 61 项全部通过；真实 Auth 的临时 D1/Home 联调再次通过。包边界、相对 origin/main 的 health、公开 API 快照、测试源码/构建混用与 diff 检查通过。

扩展包回归与安全用例共 347 文件，使用两个独立临时 Home 进程（浏览器最多一个），18.4 分钟完成：346 文件通过，3,453 项通过；知识库生命周期一项 60 秒超时，另一个真实 npm 网络用例因未设置原有显式 live 开关而跳过。

唯一失败为 `tests/security-invariants-knowledge-lifecycle.test.ts` 的 `SYS-01 SYS-02 real Host and SDK stop queued knowledge after delete`：本工作树 60,026 ms 超时，干净主线 4fd250564 使用同一官方环境 60,036 ms 超时；该文件的 exclude 与 locate 均通过。未修改该功能、用例或断言，也未将其标为通过，作为基线问题保留。未运行 CI Full suite；本轮没有提交、推送或合入主线。

环境诊断：Homebrew Node 26.9.0 的外部 libnode 被既有 Seatbelt 拒绝，插件启动失败；项目清理还出现 knowledge/search 的 SQLite 大整数读取错误。两类异常在干净主线 4fd250564 均复现。换成同版本、同 ABI 的官方独立 Node 后，在同一基线构建、同一依赖与测试上 5 文件 44 项全部通过；因此本轮修复运行环境，未更改这些产品逻辑或放宽测试断言。最终回归使用修复后的环境，不沿用受影响的旧结果。

## WORK-01 历史验证记录

已通过账号客户端 14 项、Host 账号入口 5 项、既有本机入口 15 项与 Home 存储生命周期 23 项，共 57 项；无跳过。真实 Auth 的隔离 WASM/D1 联调通过 mock 手机验证登录、Token 换取、Host 公开视图、资料修改与同键重试、租户列表，以及退出后拒绝。合同快照包含 580 个共享正反夹具，均通过。

另按 contracts 与 local-host README 执行 67 个回归文件，共 971 项。首轮两个 CLI 文件因原生构建中断而缺少 `dist/cli/main.js` 失败；单独完成原有 CLI TypeScript 编译后，这两个文件的 31 项全部通过，最终 67 个文件均通过。较慢的连接器私有状态文件也正常完成（9 项）；未停止或放宽断言。以上为定向与包回归，不替代全量。

`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、公开 API 快照、跨源码／构建混用检查与 `git diff --check` 通过。新包及相关 Host、desktop、server TypeScript 编译通过。两处已有装配根巨大单元记录按实测各增加 2 行，仅追加账号绑定和路由装配，未更改门禁规则或阈值。

当时整体 `pnpm build` 未通过：本机默认 SDK 与 Swift 编译器不匹配；指定已安装的 macOS 26.5 SDK 后，`swift-package` 仍因 BuildServerProtocol 动态库缺少符号崩溃，单独执行 `swift package --version` 同样失败。没有绕过原生构建或写入伪产物，未运行依赖完整构建的全量回归；修复工具链后需补整体构建和全量，才能给出合并就绪结论。

全部验证使用临时 Home 和隔离 Auth D1；主检出、4207 服务与真实 Home 未修改。

2026-11-04 已修复上述工具链阻断：使用经过签名和摘要验证的官方 Swift 6.3.3 完整工具链与 macOS 26.5 SDK，整体基础构建实际编译全部 64 个工作区包及原生助手并通过。激活方式见 [开发环境](../../docs/cli-and-development.md#macos-构建运行时)，未更改系统 xcode-select。账号环境与边界说明见 [中央账号服务](../../docs/horizontal/account.md)。

复现专项联调（先构建 Auth 的 WASM；路径必须显式指定）：

```sh
MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/central-account.test.mjs
```

隔离分支 `codex/work-01-account-foundation` 尚未提交、推送或合入主线。后续从 WORK-04 接入第三方认证；AUTH-11 的存量盘点并行继续。

## WORK-03 验收

- **WUA-10** 入口页与工作台共用产品内表单；邮箱验证后注册、密码登录、+86 验证后自动注册/登录、重发及邮箱找回都调用固定中央协议。受保护 GET 使用显式控制选项，普通 GET 与跨源拒绝不变。证明：`scripts/account-authentication.test.mjs`、`tests/ui-request-client.test.ts`。
- **WUA-11** 发起证明、PKCE、验证/重设证明和 Token 不进入浏览器、动作、插件或 Agent；取消、过期、重复消费、错误步骤、重启及迟到 Token 均不能越权完成。证明：`tests/security-invariants-account-host.test.ts`「S-111」、`scripts/account-authentication.test.mjs`。
- **WUA-12** Chrome 实际操作入口、邮箱注册与密码登录，1440/1024/390 宽度及深浅色截图无横向溢出；页面关闭清空表单，退出继续使用 WORK-02 会话协议。证明：`scripts/account-authentication.test.mjs`。

真实 Auth + 临时 Home + Chrome 联调：先构建 Auth WASM 和 Work，再运行 `MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/account-authentication.test.mjs`。该显式脚本不进入默认全量，外部投递继续 mock。截图只写被忽略的 `.impeccable/qa/review/account/`。

### WORK-03 页面资源增量（已获批准）

最终构建相对 `origin/main` 的 merge-base `4fd250564`：

| 已有资源 | 原字节数 | 本轮字节数 | 增量 |
| --- | --- | --- | --- |
| arrival.css | 689755 | 690207 | 452 |
| workbench.css | 1194394 | 1194846 | 452 |
| plugin-frame.js | 208033 | 208087 | 54 |
| workbench.js | 1074570 | 1081446 | 6876 |

增量来自账号表单/错误与翻译、弹窗布局和受保护 GET 的控制头选项。已复用现有按钮/输入框样式与请求助手，账号浏览器代码采用 esbuild 压缩并并入既有脚本，无新网络资源、第三方 UI 依赖或重复协议库。对应功能无法在同一资源内进一步等量抵消。用户于 2026-11-05 明确批准以上四项精确增量，已按 AGENTS 的必要增长流程在 `APPROVED_CEILINGS` 中登记旧值/新值并同步实测记录，移除已经用完的旧放行，不改变全局限制。最终资源门禁通过：51 项资源，共 7,408,448 字节；资源门禁自身的 171 项测试也通过。

### WORK-03 最终验证记录

官方 Node / Swift 环境整体构建通过。账号客户端、会话、Host 安全入口、请求助手、浏览器脚本声明与翻译六个专项文件共 97 项通过；真实 Auth WASM/D1 + 临时 Home + Chrome 最终联调通过邮箱注册验证、密码登录、手机自动注册、找回密码、取消及迟到 Token 拒绝。S-111 明确覆盖同站/跨站 Fetch Metadata 拒绝，未因提供了正确 Origin 而放行。

按修改包 README、安全与合同要求整理的 395 个回归文件中，394 个通过，唯一失败仍为 `tests/security-invariants-knowledge-lifecycle.test.ts` 的 `SYS-01 SYS-02 real Host and SDK stop queued knowledge after delete` 60 秒超时。该项此前已在同一官方环境、干净基线 `4fd250564` 复现（见 WORK-02 记录），没有修改或放宽其断言。Chrome 缺失 framework 引起的环境失败已使用完整测试浏览器逐项重跑通过；安全表文档引用修正后，对应文档门禁也通过。未运行 CI Full suite，不将本轮表述为全仓全部通过。

相对 `origin/main` 的 health、包边界、公开 API 快照、测试源码/构建混用、资源预算与 diff 检查通过。既有页面视觉基线与本轮分别完成 13 项捕获、66 张截图和 22 份样式快照；样式变化均为账号入口启用。5 张像素差异图已检查，其中两张为基线瞬时悬浮提示差异，其余各 6–8 像素；未观察到额外布局问题，不记为零差异。新增账号弹窗的 1440/1024/390 深浅色截图与横向溢出检查通过。

本轮未提交、推送、部署或迁移真实数据。后续按 WORK-04 接入 Google/GitHub 系统浏览器授权与本机回跳；完整资料、绑定及商业管理页面仍按后续任务推进。

## WORK-04 第三方登录与本机回跳

Google/GitHub 使用中央事务和受控 mock。浏览器从账号弹窗打开独立授权窗口，桌面复用既有系统浏览器端口；发起 URL 必须为当前配置的 Auth 来源和对应提供方 browser-start 路径。没有新增桌面 IPC 或任意网络代理。Auth 回到精确 `/account/callback` 后，Host 校验 state、事务、提供方、当前尝试和中央状态，完成 PKCE 换取；原弹窗通过受保护查询更新。回跳页不含 Token、控制头、脚本或外链资源。

- **WUA-13** 两种提供方均可实际授权登录；GitHub 无邮箱身份可用；原页面完成更新，桌面桥只传受控 URL。证明：`scripts/account-provider.test.mjs`。
- **WUA-14** 非导航、错误来源/state/事务、额外字段、重放、取消竞争、重启及不可信提供方 URL 均拒绝；不能安装迟到 Token。证明：`tests/security-invariants-account-host.test.ts`「S-112」、`scripts/account-provider.test.mjs`。
- **WUA-15** 浏览器与桌面桥共用入口和状态，提供取消与打开失败提示；1440/1024/390 深浅色截图无横向溢出。证明：`scripts/account-provider.test.mjs`。桌面桥的浏览器用例模拟既有 native opener 的调用，真实授权和本机回跳保持；不将其表述为 Tauri 安装包端到端验证。

复现：构建 Work 与 Auth WASM 后，运行 `MOLIS_AUTH_SOURCE=/absolute/path/to/auth node scripts/account-provider.test.mjs`，截图写已有的被忽略账号评审目录。

本轮浏览器使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，通过 `MOLIS_WORK_TEST_CHROME` 指定，并为每次测试使用独立配置目录。临时测试版 Chromium 在视口切换后挂起，只有一个按钮的最小页面也能复现；安装的 Chrome 通过同一对照。未因此改产品逻辑、放宽断言或延长超时。

用户于 2026-11-05 批准 workbench.js 在 WORK-03 基础上再增长 1,562 字节（1,081,446 → 1,083,008），相对 merge-base 的累计增长为 8,438 字节。已复用账号弹窗、请求助手和既有 native opener，并压缩到同一个脚本；没有新增资源，其余三项先前批准的字节数不变。一次性上限和实测记录已按该准确数字登记，最终共 51 项资源、7,410,010 字节。

扩展回归发现的两处旧期望已同步：桌面账号入口现在必须为可用按钮；新增 account 服务使 slice 包数量为 15，并单独断言它的成熟度。账号 Host 注释改用 authentication service，避免被 Goals 旧对象名称扫描误识别；Goals 门禁的扫描规则、空名单和断言未变。

基线对照：`tests/model-first-setup.e2e.test.ts` 的首次模型设置用例等待后台知识卡后得到 `pending` 而非 `ready`，同时记录 `knowledge.organize` 的 `ERR_OUT_OF_RANGE`。干净基线 `4fd250564` 使用同一官方 Node、Swift 和安装的 Chrome 复现相同断言；文件内其余三个用例通过。本轮没有修改该功能或断言，将其保留为基线问题。对照用临时工作树已清理，未更改主检出或真实 Home。

最终验证：整体构建、真实 Auth/临时 Home 的 HTTP 与 Chrome 第三方登录联调通过。受影响回归点名 151 个文件；首轮 146 个通过，修正及资源批准登记后复验相关 7 个文件全部通过，合计 150/151 个文件通过（1,930 项通过、上述基线失败 1 项、Grok CLI 未安装的既有可选验证跳过 1 项）。七文件复验同时覆盖资源门禁全部 171 项、安装 25 项、安装依赖链接、桌面入口、Goals 对象隔离、包成熟度和账号 Host 安全入口。

最终工作树的相对 `origin/main` health、包边界、公开 API 快照、测试源码/构建混用、页面资源与 diff 检查均通过。没有运行 CI Full suite，不将本轮定向回归表述为全仓全部通过。未提交、推送、部署或迁移真实数据；后续按 WORK-05 完成个人资料与安全管理。

## WORK-05：个人资料与账号安全

状态：开发与验证已完成；两项既有知识处理测试问题已通过干净基线对照确认，详情见下。

- **WUA-16** 已登录账号弹窗提供昵称、PNG 头像更新和移除；资料与登录方式读取经 `system.account` 动作提供方，中央版本冲突拒绝，保留本机 actor 与 Home。证明：`scripts/account-management.test.mjs`。
- **WUA-17** 邮箱密码、手机验证码、Google、GitHub 均可验证当前账号；绑定新方式须另验证，换绑固定原 binding；不能解绑最后一种可用方式，取消、退出、重启后临时证明不能继续操作。证明：`scripts/account-management.test.mjs`、`tests/security-invariants-account-host.test.ts`（S-113）。
- **WUA-18** 页面完成资料、登录方式及改密流程；改密保留当前登录并调用中央撤销其他登录规则；1440/1024/390 深浅色检查，不新增网络资源，外部服务保持 mock。证明：`scripts/account-management.test.mjs`。

资料的固定 HTTP 映射调用同一动作目录，不直接调用 Auth；凭据交互仍只走受保护认证协议。中央合同不变，新增 Work 公开安全 DTO 与 `account.login-methods.read@1`、`account.profile.update@1`，不增加凭据动作或插件专用入口。

资源：用户于 2026-11-05 批准本批 `workbench.js` +8,994 字节（1,083,008 → 1,092,002）；保持 51 个既有资源，其他资源不变。已把该精确值登记到原一次性放行，资源门禁相对 `origin/main` 通过。

最终验证（2026-11-05）：整体构建、包边界、相对 `origin/main` 的健康门禁、公开 API 快照、源码/构建混用、资源与 diff 检查通过。真实 Auth/WASM/D1 + 临时 Home + Chrome 的 WORK-05 资料安全联调通过；原 WORK-02 持久会话、WORK-03 注册登录/找回及 WORK-04 第三方回跳的真实联调再次通过。账号客户端 14 项、会话 23 项、Host 安全 12 项以及动作快照 25 项全部通过。

单进程点名回归 423 个文件，首轮 420 个通过。`tests/action-read-compatibility.test.ts` 对新增账号查询补充了明确断言：本地历史数据夹具没有中央账号配置时必须返回 `account.invalid_configuration`，其他查询和拒绝检查保持；真实登录方式读取由上述 Auth 联调验证。修正后该文件 6/6 通过，合并计算最终 421/423 个文件通过、4,309 项通过、两项未通过、两项既有可选验证跳过（未安装 Grok CLI、未启用公网沙箱探测）。未运行 CI Full suite，不将定向回归表述为全仓全部通过。

两项未通过均在独立、干净的 `4fd250564e8f48577f9f95d041106569773fcd1d` 基线、相同 Node/Swift/Chrome 环境下复现：`security-invariants-knowledge-lifecycle.test.ts` 的删除后停止知识任务在 60 秒超时；`model-first-setup.e2e.test.ts` 的知识卡为 `pending` 而非 `ready`，并伴随 `knowledge.organize` 的 `ERR_OUT_OF_RANGE`。未修改或跳过这两项测试。对照完成后临时基线工作树已清理。

本批未修改 Auth 中央合同或新增数据库迁移，未提交、推送、部署或操作真实 Home。外部服务继续 mock，Tauri 安装包端到端验证、真实投递/提供方与旧账号切换仍待后续阶段；下一批为 WORK-06 租户与成员页面。


## WORK-06：租户成员、交接及平台租户入口

状态：实现与验证已完成，外部服务继续 mock。

- **WUA-19** 个人/多租户选择、租户资料、成员与待处理邀请/交接都来自中央分页接口；切换或关闭使旧页面响应失效，不修改本地 actor 或 Home。停用租户仅显示必要状态，不请求详情和成员。证明：`scripts/account-tenants.test.mjs`。
- **WUA-20** 定向邀请、接受/拒绝/撤销、管理员任命、退出/移除均走同一动作目录；中央验证当前角色、版本及幂等键。普通成员不能邀请或使用平台入口；未知/重复查询、主体注入、错误来源、GET 正文被拒绝。证明：`tests/security-invariants-account-host.test.ts`（S-114）、上述真实 Auth 联调。
- **WUA-21** 所有者向现有成员发起交接，对方确认后原所有者成为普通成员，原席位保持；移除成员由 Auth 原子结束席位分配。证明：`scripts/account-tenants.test.mjs`，付费夹具由真实中央套餐、订阅和分配 API 创建。
- **WUA-22** 平台能力分别控制创建/分配、列表及启停，普通用户调用同一路由仍由 Auth 拒绝。Chrome 完成双方邀请/交接及平台创建、停用、恢复，1440/1024/390 深浅色检查无横向溢出；手机号切换到账号 ID 清除旧表单格式限制。证明：上述安全测试和真实浏览器联调。

新增 22 个 `system.account` 固定动作，公开 DTO 从原冻结合同生成，API 与动作快照同步更新。没有新增中央业务规则、数据库迁移或任意 HTTP 转发。邀请与成员合同仍只提供中央账号 ID/脱敏目标，界面据实展示，不增加跨账号资料查询。Work 的订阅和席位界面继续由 WORK-07 完成。

资源：用户于 2026-11-05 明确批准 `workbench.js` +8,918 字节（1,092,002 → 1,100,920）。已复用现有账号弹窗、输入和分页助手，浏览器程序压缩到同一资源，无新网络资源；其余资源不变，原一次性上限按精确实测更新。


2026-11-05 WORK-06 最终验证：官方 Node/Swift 环境整体构建、包边界、相对 `origin/main` 的健康门禁、公开 API/动作快照、冻结 Auth 合同、测试源码/构建混用、资源和 diff 检查通过。真实 Auth/WASM/D1 + 临时 Home + Chrome 专项联调通过 WUA-19 至 WUA-22，含停用后的最小状态显示和成员入口拒绝；没有真实外部服务调用。

本批按四个修改包 README 与直接影响范围点名 85 文件，首轮 84 通过。唯一失败是新增 S-114 安全夹具缺少合同必填 `personalScope`，被客户端按预期判为无效上游响应；补齐夹具后 Host 安全文件 13/13 通过，产品代码与拒绝断言未因此放宽。合计 85/85 文件、1,244 项通过；资源门禁另有 171/171 项通过，最终为 86 个不同文件、1,415 项通过，无失败或跳过。

本轮未运行 CI Full suite，不把定向验证等同全仓全量；前阶段记录的两项知识处理基线问题也未因此视为修复。未运行 Tauri 安装包 E2E，未提交、推送、部署或操作真实 Home/数据库。资源已按本轮批准准确冻结为 1,100,920 字节；下一批按 WORK-07 接入订阅席位及平台变更页面。


## WORK-07：订阅、席位与平台变更验收（2026-11-05）

- **WUA-23** 个人与租户范围真实读取套餐、期限、状态；所有者/管理员管理库存及分配、回收、换绑，成员仅看自身分配。保留分配与历史分开显示，到期不自动清除分配；续期不恢复已结束分配。证明：`scripts/account-billing.test.mjs` 的真实 Auth/Host/Chrome 流程，中央容量与历史规则继续由 Auth 持有。
- **WUA-24** 平台按能力开通个人/租户订阅，选择已发布套餐，分别调整套餐与数量、有效期、续期、停用/恢复；每次修改使用重新读取的版本并确认原因。数量不足、删除仍占用类型均拒绝；先回收再减量。目录为空不提供虚构套餐，首期不收款。证明：上述联调覆盖全生命周期与容量冲突、到期保留和回收后减量。
- **WUA-25** 商业操作从首次 UI 接入即进入唯一动作目录，按固定合同限定正文、查询及来源，拒绝主体注入。普通用户和普通成员不能调用平台/席位管理。平台商业操作记录按权限分页读取；新增库存只读接口不授予席位分配权限。证明：`tests/security-invariants-account-host.test.ts`（S-115）及上述真实联调的拒绝断言。

从 Auth 原始文件同步合同 1.1.0；新增平台订阅库存读取供非成员平台人员按真实容量维护订阅，其余商业规则不变。新增 15 个固定动作，原租户动作与商业动作共用 `management-actions.ts`。不增加数据库或任意转发入口，不改变本地 Home、actor；具体权益展示继续由 WORK-08 完成。

最终验证（2026-11-05）：官方工具链整体构建、包边界、相对 `origin/main` 的健康门禁、API/动作快照、中央合同摘要、测试加载边界和 diff 检查通过。真实 Auth/WASM/D1 + 临时 Home/Host + Chrome 的 WUA-23、WUA-24、WUA-25 流程通过；既有 WORK-06 租户与双方交接也复验通过。1440/1024/390 深浅色截图检查无横向溢出。

85 个 README 必跑与直接影响文件首轮 83 通过。动作错误扫描失败是重命名后旧 intent-to-add 索引仍枚举已删除文件，清理该索引后 15/15 通过；原有项目删除文件首轮清理回执为 pending，源码和断言不变单独复验 15/15 通过，保留首轮记录。最终该 85 个文件、1,245 项通过。工作台 README 要求的额外 10 个浏览器文件中，9 个通过，34 项通过、1 项未通过：`model-first-setup.e2e.test.ts` 的知识卡 pending/ready 断言及 `knowledge.organize` ERR_OUT_OF_RANGE，与前述干净基线已确认问题相同，未修改或跳过该断言。资源门禁 171/171 项、安装一致性 25/25 项通过。合计 97 个不同测试文件，96 个通过、1 个既有问题未通过；1,475 项通过、1 项未通过、无跳过。

用户批准的 +10,408 字节已准确登记：`workbench.js` 1,100,920 → 1,111,328，51 项既有资源合计 7,438,330 字节，其他资源不变。订阅卡片、错误状态与字段共用，减少重复代码后仍需此增量。没有新增网络资源。

未运行 CI Full、Tauri 安装包或部署后的全站 E2E，未提交、推送、部署或操作真实 Home/数据库。外部服务继续 mock，不接支付。原知识任务删除超时问题本轮未纳入上述范围，未视为修复。

## WORK-08：权益动作与来源展示验收（2026-11-05）

状态：功能实现与专项浏览器联调完成；最终回归结果见本节，外部服务 mock。

- **WUA-26** `account.features.list@1`、`account.entitlements.check@1` 注册在同一 `system.account` 动作目录。权益检查是 `account:read` 查询动作；HTTP POST 仍检查 Host/Origin/控制令牌并解析正文，但不向中央发送写操作幂等键。主体和产品来自当前会话，仅接受显式个人/租户 Scope 和功能 ID，不增加本地付费授权规则。证明：`tests/account-entitlements.test.ts`、`scripts/account-billing.test.mjs`。
- **WUA-27** 订阅页显示当前范围的功能决定及个人订阅/当前租户席位来源，按 Work/Shared 目录展示，读取完整分页；101 个功能分批查询通过，不比较不同请求的版本摘要。刷新先清空旧结果，网络失败显示不可确认；到 `validUntil` 自动重新查询，关闭或切换销毁旧页面监听与计时器。本地功能不依赖这份展示缓存。证明：`scripts/account-billing.test.mjs` 的真实 Host/Auth/Chrome 联调。
- **WUA-28** 联调使用真实中央套餐、订阅与席位接口，验证个人与租户功能取并集、来源叠加及独立失效、席位回收与权益变化；同时回归容量冲突、保留分配、版本和角色拒绝。未知租户/功能和主体注入均拒绝，离线不能沿用旧判断。证明：同一联调脚本 WUA-23 至 WUA-28；1440/1024/390 深浅色截图在忽略的评审目录。

新增两个动作，公开 DTO 从冻结 Auth 1.1.0 合同生成，API 与动作快照同步；无中央合同升级、支付或业务入口收费拦截。用户已批准本轮 workbench.js 最多增加 2,374 字节（1,111,328 → 1,113,702），沿用同一压缩资源，其他资源不变。


本轮最终资源实测为 `workbench.js` 1,113,668 字节（+2,340），比用户批准的最大增量少 34 字节；一次性放行和资源记录均按更小实测冻结，51 项资源总计 7,440,670 字节。


最终验证：整体构建、包边界、相对 `origin/main` 的健康门禁、公开 API/动作快照、测试源码/构建混用、资源和 diff 检查通过。真实 Auth/Host/Chrome 联调通过 WUA-23 至 WUA-28，新增 101 个 Work/Shared 功能的分批读取与 Club 功能拒绝验证。

按修改包 README 定向回归及界面必跑合计 98 个不同文件：97 文件通过，1,476 项通过、1 项失败，无跳过。失败为 `tests/model-first-setup.e2e.test.ts` 的首次模型卡片 `pending !== ready`，与前阶段在干净基线复现的知识处理失败一致，本轮未修改或声称修复。首轮历史数据夹具未认识新的中央功能目录查询，补成明确要求 `account.invalid_configuration` 后 6/6 通过；首次命令误列不存在的 `page-assets.test.ts`，已使用实际 `page-assets-budget.test.ts` 补跑 171/171 通过。

CI Full、Tauri 安装包验证未执行；外部短信、邮件和提供方为 mock，未提交、推送、部署或操作真实 Home。后续按 WORK-09 收口，真实旧身份接续依赖 Auth 的 AUTH-11。


## WORK-09：旧状态隔离与 Home 联合验收（2026-11-05）

复用现有中央 SecretStore 命名与 Host 边界，不新增旧凭据读取或数据转换。补充旧 personal 状态拒绝测试，并与 Club 在同一真实 Auth 中完成合成切换及回退；没有修改 Work 产品源码、公开合同或页面资源。

- **WORK09-01** 合成 personal SecretStore、旧 native capability 与浏览器 Cookie 不触发中央登录；无现行控制凭据拒绝访问，旧回调拒绝；重启仍匿名，新会话可以持久恢复，退出重启后不复活，旧材料原样保留。证明：`tests/security-invariants-account-host.test.ts` 的 WORK09-01（S-109/S-110）。
- **WORK09-02** 两产品重新登录到同一 Auth 主体，资料互相可见；Host 重启保持同一登录，access 失效只刷新一次，重启/刷新不增加用户活动；重启前事务句柄、旧回调拒绝；当前登录退出不影响 Club，全局退出在再次核验时失效。证明：Club 仓库 `scripts/test-account-cutover.mjs` 的 WORK09-02，直接加载本仓库公开构建入口并走真实 Host HTTP。
- **WORK09-03** 已有本地项目、文件和历史 actor 在登录、换成另一中央账号、离线、退出、加入/退出租户及中央回退后保持；其他产品 v1 会话仍可用，不恢复旧凭据或删除 Home。证明：同一联合脚本 WORK09-03 的逐值对照；本仓库 `tests/web-home-isolation.test.ts`、`tests/goal-management-identity.test.ts` 回归。

复现：构建 Auth WASM 与 Work 后，在 Club 检出设置 `MOLIS_AUTH_SOURCE`、`MOLIS_WORK_SOURCE` 两个绝对路径，运行 `node scripts/test-account-cutover.mjs`，遵守本仓库机器 browser 时段。脚本复用 AUTH-11 合成切换工具，创建和清理独立临时 Home/D1，不读取真实个人空间、数据库或浏览器材料；测试权限与审核证据均为夹具，不代表真实存量已审核。

本轮整体构建及账号客户端/会话、Host 安全、Home 隔离、Goals 本地身份和权益查询 6 个文件、71 项通过；联合测试通过真实刷新、重启、跨端资料、邀请/退租户、退出范围与保留历史的回退。未运行 CI Full 或 Tauri 安装包；前阶段已记录的知识处理基线问题未视为修复。Work 本轮无资源增长，也未调整资源门禁。

真实部署、personal 使用情况及完整旧 Client 集合仍未观察；D-09 真实凭据接续与外部服务验收不标完成。未提交、推送、部署或操作真实 Home。后续由 AUTH-12 汇总三仓库证据与剩余待办。

WORK-09 最终门禁：相对 `origin/main` 的健康、包边界、公开 API、冻结合同、测试源码/构建混用、页面资源与 diff 检查通过。51 项资源合计仍为 7,440,670 字节，workbench.js 仍为 1,113,668 字节；无新增放行。


## AUTH-12 证据汇总（2026-11-05）

本轮没有修改 Work 产品源码或合同。6 个账号/Home/身份定向文件、71 项，冻结合同和资源门禁复验通过；同一真实 Auth 下两产品交替开通订阅、分配/回收席位、读取历史和权益来源通过，仍使用临时 Home/D1 与 mock。两端独立会话的权益有效期分别验证，不要求时间戳相等。完整矩阵和源码版本摘要由 Auth `docs/unified-account/acceptance-matrix.md`、`delivery-manifest.json` 持有。

后续内部收尾包括 UAS-08 的全部方式丢失帮助动线、UAS-15 的资源访问合同夹具，以及最终提交/集成 head 的 CI Full 和既有基线问题复核。未执行这些项、真实外部服务、Tauri 安装包或真实数据迁移。本节记录现有证据与缺口，不增加新的业务验收条件。


## K-03 登录方式丢失帮助（2026-11-05）

- **K03-01** 登录和个人资料/安全共用“无法使用登录方式？”折叠说明；可用方式先验证后换绑，仅忘记密码走既有邮箱找回，全部丢失先找回原方式，不提供人工恢复；新账号不自动继承原内容。展开、收起后保留表单、会话和原登录操作。证明：`scripts/account-authentication.test.mjs` 中 K03-01 / UAS-08，真实 Auth、临时 Home 与 Chrome。

新增帮助只有静态说明，不新增恢复接口或资源请求；中文/英文词典同时更新。workbench.js 从 1,113,668 增至 1,114,199 字节（+531），使用同一折叠节点、现有样式及压缩构建；用户已批准最多追加 +537 字节；复用标准折叠标记后再减少 6 字节，按最终实测收紧放行，其他资源不变。验证结果见 Auth 的交付记录；真实外部服务、真实 Home 与存量数据仍未接入。

扩展回归发现账号入口缺少与其他标题栏按钮相同的 `data-slot` 标签：补齐标准按钮/标签标记及可访问名称，复用既有窄屏图标布局。K03-01 增加 390 宽度按钮位于标题栏内的断言；未增加 CSS 或放宽布局断言。

本轮定向验证按文件最新结果归并为 33 文件、415/418：K-01 首次模型知识卡仍 pending；项目入口的英文 768 宽度、667 横屏个人空间底栏溢出在干净 `4fd250564` 复现，登记 K-05。按钮标记修复后引导页 14/14、入口 13/15，标题栏裁切已消除，未放宽断言。整体构建、健康与资源门禁通过，未跑本地 Full；最终集成提交的 CI Full 仍待执行。

共用外壳视觉比对已执行：基线与当前各 13/13 采集检查通过；66 图中 4 张分别有 7–11 个像素、最大通道差 1，22 份计算样式快照只差既有账号入口由禁用提示变为启用时的 opacity 0.45 → 1。已审阅差异，未放宽零容差；比较命令按有差异退出 1。报告位于忽略的 `.impeccable/qa/review/visual/k03-compare/`，摘要与日志哈希记录在 Auth 交付记录；临时基线已清理。


## Work 基线失败修复（2026-11-05）

本轮针对 K-01 和 K-05 的三项已复现失败。知识卡与搜索索引 SQLite 语句使用 BigInt 接收整数结果，避免 FTS 内部行号越界让已成功的用量写入表现为失败；不改变表结构、账号合同或真实 Home。入口底栏在 900px 及以下复用已有双行布局，助理在上、操作在下；手机内容区的原 600px 规则保留。

- **K01-01** 首次配置后实际后台模型请求完成、知识卡变 ready；连续修订逐次整理且准确计量，无变化不重复计量，更新及删除成功。证明：`tests/model-first-setup.e2e.test.ts`、`tests/knowledge-cards.test.ts` 的同名注释/测试。
- **K05-01** 英文个人空间入口在各宽度不横向溢出。证明：`tests/project-arrival.e2e.test.ts` 的英文布局用例。
- **K05-02** 横屏、明暗及各入口状态的操作可见、可达、不被裁切。证明：同文件的全状态布局用例；引导页另由 `tests/onboarding-journey.e2e.test.ts` 回归。

直接复验：首次模型设置 4/4、项目入口 15/15、引导页 14/14；知识相关 6 文件 59/59。只修知识卡后的中间轮发现搜索索引相同的整数异常；补齐后 K-02 的排除/删除生命周期也恢复为 3/3，未改变 60 秒超时或安全断言。最终另 52 个文件 590/590，合计 58 个不同文件 649/649；整体构建、相对 origin/main 的健康、包边界、资源及 diff 检查通过。视觉基线与修复版采集各 13/13：66 图中 62 张相同，另 4 张仅 7–11 个像素、最大通道差 1；22 份计算样式只保留此前账号按钮启用的 opacity 变化。零容差比较退出 1，差异已核对，未改变阈值。另 10 张入口明暗截图及几何检查通过，英文 768 和横屏 667 均无溢出。干净基线知识卡文件 11/16、5 项相同搜索越界，修复后含新增回归 17/17。未运行本地 Full；最终集成提交仍需 CI Full。

入口样式表由 690,207 降至 690,165 字节（−42），同步收紧预算及已有一次性上限；其他资源不变，51 项共 7,441,159 字节。仅临时 Home、合成数据与本机模型替身；外部账号服务继续 mock，未操作真实数据。
