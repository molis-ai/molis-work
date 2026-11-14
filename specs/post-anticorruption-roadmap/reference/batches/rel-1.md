# REL-1 · 外部资格与凭据

[执行目录](../../spec.md#release-batch) · [发行批总则](../release-batch.md#release-batch) · [下一批 REL-2](rel-2.md) · [执行规则](../execution-rules.md)

<a id="rel-1"></a>

## 给人讲清楚

对外发行要的账号、证书、审核和公开文件，大多只有你本人能办，而且要等几天到几个月。这一批把它们列清、按等待时间排好，工程能起草的（隐私政策、服务条款、申请材料）先起草。办好的凭据只填进 [26-9](26.md#batch-26-item-9) 收拢的发行配置所引用的位置（GitHub Secrets、Worker 的 `OAUTH_APP_*`），不改代码。需要你做的：办下面「要用户本人去办的」那几项；定下「要用户决定的」那几题。

## 交付与前置

- **阶段／类型**：发行；产品线（发布）
- **需求来源**：[C 端就绪 M1][CEND]、[服务接入 §8.1][ASC]、[产品建议 A1～5][P]
- **前置／待决**：开工由用户定（[发行批总则](../release-batch.md#release-batch)）；不等任何开发批，外部等待可以现在就开始；M1 包含哪几家服务看[决策记录](../decisions.md#section-7)第 18 项
- **可并行项**：与 REL-2～REL-4 互不等待
- **UI 要求**：无（正式授权的界面沿 13 已有的连接页）

| 交付项 | 做什么、产出什么 | 该项前置 |
| --- | --- | --- |
| <a id="rel-1-item-1"></a>Apple 签名与公证凭据 | 核个人会员、记 Team ID、建 Developer ID Application 证书并导出、生成公证凭据（App 专用密码或 API 密钥，推荐后者），填进发行配置引用的 GitHub Secrets；原 26-1 的外部部分 | 用户本人办 |
| <a id="rel-1-item-2"></a>公开主页、隐私政策与服务条款 | 以公司名义发布产品页、写明 OAuth 数据用途的隐私政策和服务条款，完成域名验证；工程起草（未开工前也可以起草文档，不发布），你定主体与定稿；它挡住 Google、Microsoft、Notion、Slack 等全部正式应用 | 法律主体由用户定 |
| <a id="rel-1-item-3"></a>正式 OAuth 应用 | 逐服务提交正式应用并完成服务侧准备，按服务各挡各的；开发阶段一直用测试应用，不等这一项（原 [26-2](26.md#batch-26-item-2)） | 本批第 2 项；账号与服务侧资格，只挡对应服务 |
| <a id="rel-1-item-4"></a>Prologue SDK 再分发许可 | 拿到 `@prologue/sdk` 能随安装包再分发的书面答复；没答复之前，公证过的包只能内部用（`c-end-readiness.md` §6 第 1 条） | 上游答复 |

<a id="rel-1-audit"></a>

## 核账 · 2026-11-04（只读核查，原在第 26 批）

F 轨核（只做定样／只读核查，认领见 #1743）。依据只有两样：官方公开文档，和 main（063b036bd）上的仓库内容。没有登录任何账号，没有读取或配置证书、钥匙串、凭据或令牌，也没有执行签名、公证或发布。用户已经定下：Apple 签名和公证用现有的**个人** Apple Developer 账号；正式 OAuth 应用优先放在**中国公司**名下，两件事分开管（`docs/releases/POLICY.md` §6、`specs/assistant-service-connections/spec.md` §8.1，均为 2026-10-27 定）。凡是标「未核实」的，都还没在官方文档里逐字找到原文，或者需要真账号才能确认。

### 一、Apple 签名与公证（第二台 Mac 能正常打开的前提）

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| 开发者账号 | 有效的 Apple Developer Program 会员。用户说已有个人账号，但「仍然有效、Team ID 是多少」还没核过 | 开了双重认证的 Apple ID；个人账号要的是本人法定姓名和住址，不需要 D-U-N-S。如果改成公司账号，要 D-U-N-S、能签约的法人、公司官网和同域名的工作邮箱 | 已有账号的话，登录看一眼就行。年费 99 美元，国内显示 ¥688。断缴后不能再给新版本签名 | **用户本人** | [enroll](https://developer.apple.com/programs/enroll/)、[app-account（中文）](https://developer.apple.com/cn/support/app-account/) |
| Developer ID Application 证书 | 给 App、内嵌的 Node、原生插件和两个助手程序签名。证书上显示的是**本人姓名**（`Developer ID Application: 姓名 (TEAMID)`） | 在本机钥匙串里生成 CSR，到开发者后台换证书，再连同私钥导出成 .p12 并设一个导出密码 | 半小时左右，不另收费。**只有 Account Holder 能创建**这种证书 | **用户本人**（生成证书、导出 .p12）；工程只写操作步骤 | [Developer ID](https://developer.apple.com/developer-id/) |
| 公证凭据 | 给 `notarytool` 用。可以用 App 专用密码加 Apple ID 加 Team ID（现在的工作流就是这种），也可以用 App Store Connect API 密钥（.p8、Key ID、Issuer，适合 CI） | 二选一 | 几分钟。生成 API 密钥要 Account Holder 或 Admin | **用户本人** | [公证说明](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)、[Tauri 签名](https://v2.tauri.app/distribute/sign/macos/) |
| 把凭据放进 CI | 往仓库的 GitHub Secrets 里填 6 个值：`APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`；改用 API 密钥的话换成 `APPLE_API_*` 那一组 | 上面两行的产物 | 10 分钟 | **用户本人**（改仓库设置、碰凭据）；工程负责改工作流 | `.github/workflows/release-macos.yml` |
| 公证本身 | 每一个可执行文件都要用 Developer ID 签名，并且开 hardened runtime、带安全时间戳、不带 `get-task-allow`；之后公证，把票据钉进 App 和 DMG，再用 Gatekeeper 评估 | 签名脚本、entitlements、Info.plist 里的说明文字（见第四节「缺口」） | Apple 说扫描「通常不到一小时」，实际多为几分钟。被拒后改完重交，每轮几分钟到几十分钟。工程量 4～7 人日（`c-end-readiness.md` §3.1 的估计） | **工程可准备**；真正的公证要用户先把凭据放好 | 同上；[Hardened Runtime](https://developer.apple.com/documentation/security/hardened-runtime) |
| 权限说明与 entitlements | 内嵌 Node 需要 `allow-jit`、`allow-unsigned-executable-memory`，还很可能需要 `disable-library-validation`（Node 官方的清单里也有，但官方清单带的 `get-task-allow` 必须去掉）。主程序会经 `osascript` 给 Safari、Chrome、Finder 发 Apple Events，所以要 `com.apple.security.automation.apple-events` 加 `NSAppleEventsUsageDescription`（要不要加属推断，未核实，要实机验）。Computer Helper 用到的屏幕录制、辅助功能、输入监控不需要 entitlement，但助手程序本身要按 bundle 签名 | entitlements 文件和 `src-tauri/Info.plist` | 1～2 人日，含在上一行的工程量里 | **工程可准备** | [Node osx-entitlements](https://github.com/nodejs/node/blob/main/tools/osx-entitlements.plist)、[Tauri bundle](https://v2.tauri.app/distribute/macos-application-bundle/) |

### 二、所有 OAuth 服务都要的前置：主体、域名与隐私政策

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| 回调与经纪服务 | 固定回调地址 `https://auth.molis.ai/callback`。Cloudflare 上的 Worker（`molis-oauth`）已经部署，2026-09-27 那一轮协议修复写着「尚未部署」。默认是关的，要靠宿主的环境变量 `MOLIS_WORK_CONNECTOR_BROKER_ORIGIN` 和 `MOLIS_WORK_CONNECTOR_BROKER_SERVICES` 才打开。安装包里没看到这两项的默认值（未核实） | Cloudflare 账号权限、`molis.ai` 的 DNS 控制权，每家服务一个 Worker Secret（`OAUTH_APP_<服务>`） | 部署只要几分钟，Workers 费用另计（未核实） | 部署和放密钥：**用户本人**或获授权的人。代码和开关：**工程可准备** | `apps/local-host/cloudflare/README.md`、`wrangler.jsonc`、`apps/local-host/src/connector-product-auth.ts` |
| 官网与隐私政策 | Google、Microsoft、Notion、Slack 等都要求一个公开主页加一份隐私政策，域名要在自己名下，Google 还要求主页链到隐私政策。现在 `https://molis.ai/privacy`（2026-10-18 版）只讲官网，**没有写 Molis Work 怎样通过 OAuth 读、存、分享第三方账号数据，也没写 Google 的 Limited Use**，并且写着「Google、GitHub 登录尚未开放」。官网上也**找不到服务条款页** | Molis Work 产品页、应用隐私政策（读哪些数据、只在本机存、令牌经 auth.molis.ai 中转但不落库、怎样删除、联系邮箱）、服务条款、支持邮箱 | 起草 1～2 天，法务看稿另算 | 起草：**工程可准备**。用公司名义发布、确认法律主体：**用户本人** | [Google 验证要求](https://support.google.com/cloud/answer/13464321)、molis.ai 首页 |
| 域名所有权验证 | Google 用 Search Console 验 `molis.ai`；Microsoft 的 publisher domain 要做 DNS 验证 | DNS TXT 记录 | 当天 | **用户本人**（DNS 和账号权限） | 同上；[Microsoft 发布者验证](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) |

### 三、逐家服务

服务目录里一共有 39 个 API OAuth 加 6 个其他方式（`plugins/official-integrations/catalog/src/oauth-methods.ts`、`apps/local-host/cloudflare/providers.ts`）。M1 具体要哪几家还**没定**，下面先列最可能进 M1 的几家，其余放在最后一张表。

**GitHub**（Feed 里的通知；Coding 共用 GitHub 账号，见 §8.3）

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| OAuth App | 已经建好，密钥 `OAUTH_APP_GITHUB` 已放进 Cloudflare，**真实登录回调还没走过**。现在要的权限是 `notifications`、`read:user`。插件同时声明了设备码登录，这个要在应用设置里**勾选「Enable Device Flow」** | 应用名、主页、回调地址 | 不审核，免费，当天就能用。组织开了 OAuth 应用访问限制的话，还要组织 Owner 批准 | 勾选设备码、确认应用归属：**用户本人**。真实回调验证：工程可准备、用户来登 | [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、`specs/archive/connector-experience/provider-readiness.md` |
| Coding 推送与开 PR | 现在声明的权限只够读通知，**推送、评论、开 PR 用不了**：OAuth App 得加 `repo`（权限很宽），或者改用 GitHub App 的细粒度权限 | 先定选哪种 | GitHub App 也不审核 | 选型：**用户定**。实现：工程 | `plugins/official-integrations/github/src/index.ts` |

**Google**（Gmail、Calendar、Drive）

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| 现状 | Web 客户端已经建好，密钥已放进 Cloudflare，API 已启用。真实回调、品牌和域名审核、发布资格**都还没做** | — | — | — | `provider-readiness.md` |
| 品牌验证（所有对外的 Google 应用都要） | 同意屏幕上的应用名、Logo、主页、隐私政策、已验证的域名 | 第二节那几样 | 通常 2～3 个工作日。没验证之前，最多 100 个新用户，并且有「未验证应用」提示 | **用户本人**（Cloud 项目 Owner 提交） | [Google 限制范围验证](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)、[未验证应用](https://support.google.com/cloud/answer/7454865) |
| Calendar 的 `calendar.readonly` | 敏感权限，要审核（按一般认知属「敏感」，官方页面上没有逐字找到，未核实） | 演示视频（英文界面，完整走一遍授权和用到这项权限的功能）、写清为什么不用更窄的权限 | 几天到几周（未核实） | 视频和说明：**工程可准备**。提交：**用户本人** | [Google 验证要求](https://support.google.com/cloud/answer/13464321) |
| Gmail 的 `gmail.readonly`、Drive 的 `drive.readonly` | **受限权限**（官方页面已确认）。审核「可能要几周」，另外每年要过一次 **CASA 安全评估**，前提是应用「能经第三方服务器访问数据」。我们的令牌要经 auth.molis.ai 中转，**大概率算在内，未核实**，最好先问 Google | 上一行的材料，加 CASA 评估（由 Google 认可的评估机构做） | 几周到几个月。CASA Tier 2 由 TAC Security 一类机构做，第三方页面上的报价约每个应用每年 540～720 美元，评估周期 1～3 周（**价格未核实**） | 付费和签合同：**用户本人**（以公司名义）。安全问卷和整改：工程可准备 | 同上；[Gmail 权限分级](https://developers.google.com/workspace/gmail/api/auth/scopes)、[Drive 权限分级](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)、[TAC CASA](https://tacsecurity.com/google-casa-cloud-application-security-assessment/) |
| 能缩小的范围 | Drive 改用 `drive.file`（非敏感，用户自己挑文件）就不用走受限审核。Gmail 没有更轻的只读选择，`gmail.metadata` 也是受限权限 | — | — | **用户定** | [Drive 权限分级](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) |
| 只在小范围用（Testing 状态） | 停在 Testing 状态时，最多 100 个测试用户，并且刷新令牌 7 天就过期（这一条凭一般认知，未逐字核实） | 测试用户名单 | 当天 | **用户本人** | [Google OAuth](https://developers.google.com/identity/protocols/oauth2) |

**Microsoft**（Outlook、OneDrive、SharePoint、Teams）

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| Entra 应用注册 | 多租户的委托权限应用，权限是 `User.Read`、`Mail.Read`、`Files.Read.All`、`Sites.Read.All`、`Chat.Read` 等，加 `offline_access`。现在**还没建** | 公司的 Entra 租户和工作账号（用个人 Microsoft 账号注册的应用不能做发布者验证） | 当天，免费 | **用户本人** | [发布者验证](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) |
| 发布者验证 | 2020-11 之后注册的多租户应用，如果没验证，开了风险提示策略的租户里用户**不能自己同意授权**。要做验证，得有一个**已通过验证的 Microsoft AI Cloud Partner Program 账号**（全球账号 PGA），邮箱域名和应用的 publisher domain 一致（不能是 onmicrosoft.com），发起人要有 MFA 和相应角色 | 公司营业资料、`molis.ai` 的 DNS 验证、公司域名邮箱 | Microsoft 说前提都满足的话「几分钟」，免费；但 Partner 账号本身的审核要几天（未核实）。世纪互联运营的国内版云不支持 | **用户本人**（以公司名义） | 同上 |

**Slack**

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| 公开分发（不上架 Marketplace） | Bot OAuth v2，现在要的权限是 `channels:read`、`groups:read`、`im:read`、`mpim:read`、`users:read`。打开「公开分发」不需要审核（未核实）。但 **2025-05-29 之后新建、又不在 Marketplace 上的商用应用**，读历史消息的 `conversations.history` 和 `conversations.replies` 每分钟只能调 1 次、每次最多 15 条 | 应用名、图标、回调地址、隐私政策 | 当天，免费 | **用户本人**（公司的 Slack 工作区） | [限流变化](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps) |
| 上架 Marketplace（不受上面限流） | 要先在**至少 10 个活跃工作区**装过，备好测试账号和演示视频 | 同上，加评审材料 | 初审最多 10 个工作日，功能评审最多 10 周 | **用户本人** | [Marketplace 评审指南](https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide) |

**Notion**

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| Public integration（API） | 走 OAuth，官方说「不需要 Marketplace 审核」。目前**真实验证通过的只有 MCP 方式**（动态注册，不用另建应用），API 方式的应用还没建 | 公司名、官网、隐私政策、服务条款、支持邮箱（这几项是 public integration 一般要填的，未逐字核实） | 当天，免费 | **用户本人** | [Notion 授权](https://developers.notion.com/docs/authorization) |

**飞书 / Lark**

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| 应用类型 | 企业自建应用「只能在同一企业内发布和使用」。要让别的企业的用户登录，得做**商店应用**（以服务商 ISV 身份）。权限：`im:chat:readonly`、`wiki:wiki:readonly`、`docx:document:readonly`、日历只读等，加 `offline_access`。Lark 国际版是另一个应用，凭据不能和飞书混用 | 公司做开发者企业认证（商店应用的资质和上架流程**未核实**） | 自建应用当天能用，只需本企业管理员审核；商店应用上架的时长未核实 | **用户本人**（以中国公司名义） | [应用类型](https://open.larkoffice.com/document/home/app-types-introduction/overview.md) |

**Figma**

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| 公开 OAuth 应用 | 草稿状态谁都不能用，私有状态只限本团队，**公开应用要 Figma 审核通过之后才能给外部用户授权**。现在要的权限是 `current_user:read`、`file_content:read`、`file_metadata:read`、`file_comments:read`。目前这条 API 只用来确认身份，读设计走的是 MCP | Logo、简介、回调地址、给评审人的测试步骤和测试账号 | 审核时长未写（未核实） | **用户本人** | [Figma OAuth 应用](https://developers.figma.com/docs/rest-api/oauth-apps/) |

**Linear、Atlassian（Jira、Confluence）、Dropbox**

| 项目 | 要什么 | 要准备的材料 | 大概多久 / 费用 | 谁来办 | 出处 |
| --- | --- | --- | --- | --- | --- |
| Linear | OAuth App，权限 `read`。其他工作区可以授权，文档没提审核（未核实） | 一个专门用来管理应用的工作区 | 当天 | **用户本人** | [Linear OAuth](https://linear.app/developers/oauth-2-0-authentication) |
| Atlassian 3LO | 默认是私有的，要在 Distribution 里**打开分享**。没经 Atlassian 审核的话，用户安装时会看到警告；要去掉警告，就走 Marketplace 的审核流程。另外，「让用户挑选站点」这一步**本身还没实现**（目前只支持一个固定站点） | 厂商信息、隐私政策（未逐字核实） | 打开分享当天就能用，审核时长未核实 | **用户本人** | [Atlassian 3LO](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) |
| Dropbox | 开发状态最多 500 个用户。**要先连上 50 个用户才能申请转正式**，连满 50 个之后两周内必须拿到批准，否则冻结、不能再新增用户 | 图标、品牌合规、API 用途说明 | 审核时长未写 | **用户本人** | [Dropbox 开发者指南](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide) |

**其余目录服务**（Box、Discord、Zoom、GitLab、Bitbucket、Vercel、Cloudflare、Hugging Face、Sentry、Supabase、Asana、ClickUp、monday、Airtable、Canva、Adobe、Salesforce、HubSpot、Intercom、Stripe、X、LinkedIn）：每家都要一个用公司名义建的产品应用，登记回调 `https://auth.molis.ai/callback` 和隐私政策。下面这些家另有额外资格，都**未逐家核实**：Zoom 上架 Marketplace、Canva 公开分发审核、Adobe 生产审批、X 的开发者资格和费用、Cloudflare 公开客户端的域名验证、Box 企业管理员批准。每家的配置要点见 `specs/archive/connector-experience/configuration-readiness.md`。目录里 6 个用密钥接入的服务（模型 API、TypeSafe、图像 API、远程 MCP、企业微信、Loom）不需要 OAuth 应用。

### 要用户本人去办的（等待最久的排前面）

1. **Google 的 Gmail、Drive 受限权限审核和 CASA 安全评估**：几周到几个月，每年重评一次，要付费。前提是第 3 项的官网和隐私政策先就位。也可以先定把 Drive 收窄成 `drive.file`，或者 Gmail 暂不进 M1。
2. **Slack 上架 Marketplace**（只在要读历史消息时才需要）：要先有 10 个活跃工作区，评审最多 10 周。
3. **公司名下的官网产品页、应用隐私政策、服务条款**：以公司名义发布，要确认法律主体（工程可以起草）。它挡住 Google、Microsoft、Notion、Slack 等所有正式应用。
4. **Microsoft AI Cloud Partner Program 公司账号的审核，以及发布者验证**：几天（未核实），要公司资料、DNS 和 MFA。
5. **飞书商店应用（ISV）的企业认证和上架**：时长未核实。如果只在本企业用，建自建应用当天就行。
6. **Figma 公开应用审核、Atlassian 去警告的审核、Dropbox 转正式（要先连满 50 个用户）**：按服务挡，不挡别的。
7. **Google Calendar 敏感权限审核和品牌验证**：2～3 个工作日到几周。
8. **Apple**：核对个人会员是否有效、记下 Team ID；创建 Developer ID Application 证书并导出 .p12；生成公证凭据（App 专用密码或 API 密钥）；填进 GitHub Secrets。账号已有的话，**半天之内能办完**。
9. **GitHub 应用设置里勾选 Device Flow；建 Notion、Linear 的应用；部署最新版 Worker 并放入各服务的 `OAUTH_APP_*`**：都是当天的事，不用审核。

### 仓库现状与缺口

- **已有**：Tauri v2 桌面壳（`apps/desktop/src-tauri/tauri.conf.json`，bundle id `com.molis.work`，产物是 app 和 dmg，最低 macOS 13，`macOSPrivateApi: true`）。构建脚本 `apps/desktop/tooling/build-macos-release.sh` 在没给签名身份时默认用 `-`（ad-hoc），最后只跑 `codesign --verify`。`tauri.macos.conf.json` 写死了 `signingIdentity: "-"`，但环境变量 `APPLE_SIGNING_IDENTITY` 可以覆盖它。发布工作流 `.github/workflows/release-macos.yml` 只能手动触发，arm64 和 x64 各构建一份；6 个 `APPLE_*` 凭据齐全时才导入证书，交给 Tauri 签名和公证；打 tag 的构建如果缺凭据会直接失败。
- **随包带的原生组件**（全部要签名）：`prepare-macos-runtime.sh` 下载并校验 Node 24.14.0（11-04 的快照，现为 24.15.0）；运行时里有 `better_sqlite3.node`、`pty.node`、`spawn-helper`（`node-pty` 还会带上其他平台和另一架构的预编译文件）；`apps/local-host/native/materials/bin/jelly-material`；`jelly-whisper`（SwiftPM 包，运行时会从 Hugging Face 下载约 626 MB 的模型）；`apps/local-host/native/computer/bin/Molis Work Computer Helper.app`（bundle id `com.molis.work.computer-helper`，用到屏幕录制、辅助功能、输入监控）。
- **缺口**：
  - main 上**没有** entitlements、`src-tauri/Info.plist`、对 Resources 里各个 Mach-O 逐个签名的步骤，也没有 `stapler` 和 `spctl` 校验。Tauri 只签 bundle 的标准位置，Resources 下的二进制它不签，这一点**属推断，未核实**。
  - Computer Helper 签名时用的是 `--timestamp=none`，也没加 `--options runtime`，**这样过不了公证**；而且它必须按 bundle 整体签名，不能只签里面的可执行文件。
  - 改用 Developer ID 签名后，屏幕录制、辅助功能、输入监控的授权要重新给一次；将来从个人账号换成公司主体（Team ID 变了）还要再给一次。
  - 下载的 Node 带着 `get-task-allow`，必须重签。
  - 未评审快照 `d6fa42998` 里已经有 Node 的 entitlements（`allow-jit`、`allow-unsigned-executable-memory`、`disable-library-validation`）、逐个 Mach-O 重签的脚本、`stapler` 和 `spctl` 校验、裁掉多余的 node-pty 预编译，以及个人账号的操作手册。但它会把 Helper.app 里的可执行文件当成单独文件去签，会破坏 bundle 的签名；也**没有** Apple Events 的 entitlement 和说明文字。要在本批评审后重新做。
  - `release-macos.yml` 现在用的是 Apple ID 加 App 专用密码；改用 API 密钥要改工作流。
  - OAuth 这边：经纪服务的代码有，但 2026-09-27 那一轮修复没部署；安装包里默认不开经纪服务（靠环境变量）。GitHub 只申请了读通知的权限，不够 Coding 推送和开 PR；Jira、Confluence 不能让用户挑站点；molis.ai 的隐私说明没有覆盖产品的 OAuth 数据，也没有服务条款页。
  - 另外还有一个外部依赖（不是账号）：`@prologue/sdk` 能不能随安装包再分发，还没有书面答复（`c-end-readiness.md` §6 第 1 条）。没有答复之前，公证过的包只能内部用。

### 要用户决定的（同见 REL-5）

1. Apple 签名就用个人账号（证书上显示本人姓名，一年后换成公司主体时授权要重给），还是现在就用公司账号（要 D-U-N-S，Apple 审核时间更长）。现在的决定是个人账号；这里只请再确认一次，不是改决定。
2. 公证凭据用 App 专用密码（现在的做法），还是 App Store Connect API 密钥（推荐，不绑个人 Apple ID 的密码）。
3. **M1 包含哪几家服务**（决定第 18 项还没定）。建议先上不用审核或审核短的：GitHub、Notion（MCP）、Linear、飞书自建应用。Gmail、Drive 这类受限权限要等几周，加上每年的 CASA，单独排期。
4. Google 这边：Drive 收窄成 `drive.file`？Gmail 进不进 M1？愿不愿意承担 CASA 每年的费用？还有，令牌经 auth.molis.ai 中转算不算「经服务器访问」，要不要先问 Google？
5. Slack 只做公开分发（读历史消息每分钟 1 次），还是去上架 Marketplace。
6. 飞书只服务本企业（自建应用），还是做商店应用给其他企业用。
7. Coding 推送和开 PR 用 OAuth App 加 `repo` 权限（宽），还是另做一个 GitHub App（细粒度）。
8. 隐私政策和服务条款以哪个公司主体发布，由谁定稿。

<a id="goal-prompt"></a>

## Goal Prompt

把下面整段复制给执行这一批的会话。

```text
你在 Molis Work 仓库里推进发行批 REL-1「外部资格与凭据」。照 specs/post-anticorruption-roadmap/reference/batch-runbook.md 从头做到尾：全批一个 PR，由你这个主会话自己写、派评审、入合并队列，并在合入前做收尾五问、清理和需求映射与依赖图的更新。交付、前置、可并行项和界面要求以本批文件 specs/post-anticorruption-roadmap/reference/batches/rel-1.md 为准；它和这段对不上时以它为准，并顺手改正这段。完成程度按每项交付写的来，不停在方案、原型或几个样例，也不自行降级。

发行批：我没明确说这一批开工之前，只做只读核查和设计（手册「发行批」）。发行用的配置只改 26-9 收拢的那一份发行配置，不在代码里另写；要改 CI 工作流、动凭据或真实账号，先问我。

原需求（行为与验收以它们为准）：specs/archive/repository-anti-corruption/c-end-readiness.md；specs/assistant-service-connections/spec.md；docs/product-operations/产品优化建议.md

本批交付：
1. Apple 签名与公证凭据（本批文件 #rel-1-item-1）
2. 公开主页、隐私政策与服务条款（本批文件 #rel-1-item-2）
3. 正式 OAuth 应用（本批文件 #rel-1-item-3）
4. Prologue SDK 再分发许可（本批文件 #rel-1-item-4）

界面：无新增界面。

本批另有：
- 要我本人办的、要我定的，按本批文件「核账」一节攒成一批问；不替我登录任何账号，不读取或配置证书、钥匙串、凭据或令牌。
```

[ASC]: ../../../assistant-service-connections/spec.md
[CEND]: ../../../archive/repository-anti-corruption/c-end-readiness.md
[P]: ../../../../docs/product-operations/产品优化建议.md
[UPG]: ../../../upgrade-continuity/spec.md
