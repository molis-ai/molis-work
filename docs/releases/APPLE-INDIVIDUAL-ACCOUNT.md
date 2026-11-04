# 个人 Apple 开发者账号：签名与公证的操作步骤

状态：2026-11-04 写（第 26 批第 1 项的仓库侧准备）。用户 2026-10-27 定：签名和公证用现有的**个人** Apple Developer 账号（[POLICY.md](POLICY.md) 第 6 节，BL-021）。真正对外发行在第 56 批。

第 1～6 步只能由账号本人做：工程不登录账号、不碰证书和凭据。第 7 步以后是仓库里已经接好的部分。发布规则以 [POLICY.md](POLICY.md) 为准，每次发布逐项勾 [CHECKLIST.md](CHECKLIST.md)。

## 0. 先知道三件事

- 个人账号不需要营业执照或 D-U-N-S，要的是开了双重认证的 Apple ID、本人法定姓名与住址，以及年费（99 美元，国内显示 ¥688）。断缴后不能再给新版本签名。
- 证书上显示的是**本人姓名**：`Developer ID Application: 姓名 (TEAMID)`。用户只有在查看签名信息时才看得到。
- 只有 Account Holder 能创建 Developer ID Application 证书。

## 1. 确认会员有效，记下 Team ID（5 分钟）

<https://developer.apple.com/account> → Membership details：会员状态有效，记下 10 位的 **Team ID**。后面证书名、`APPLE_TEAM_ID` 和本机公证都用它。

## 2. 创建 Developer ID Application 证书（30 分钟）

1. 「钥匙串访问」→「证书助理」→「从证书颁发机构请求证书…」→ 存储到磁盘，得到 `.certSigningRequest`；
2. <https://developer.apple.com/account/resources/certificates/list> → 加号 → **Developer ID Application** → 上传 CSR，下载 `.cer`；
3. 双击 `.cer` 装进钥匙串，确认它在「我的证书」里**带着私钥**；
4. 同时选中证书和私钥 → 导出为 `.p12`，设一个导出密码。

## 3. 公证凭据：二选一（5 分钟）

| 方式 | 要什么 | 适合 |
| --- | --- | --- |
| App 专用密码（现在发布工作流用的） | <https://account.apple.com> → 登录与安全 → App 专用密码；加上 Apple ID 邮箱、Team ID | 马上能用，不用改工作流 |
| App Store Connect API 密钥（推荐） | App Store Connect → 用户和访问 → 集成 → 生成团队密钥，得到 `.p8`、Key ID、Issuer ID | 不绑个人 Apple ID 的密码，适合 CI；**发布工作流要先改**（第 6 节） |

构建脚本两种都认（第 7 节）。App 专用密码不是 Apple ID 的登录密码，用登录密码公证会失败。

## 4. 本机先认一次身份（2 分钟）

```bash
security find-identity -v -p codesigning
```

输出里应该有一行 `Developer ID Application: 姓名 (TEAMID)`。

## 5. 放进 GitHub Secrets（10 分钟，改仓库设置）

仓库 → Settings → Secrets and variables → Actions，填 [release-macos.yml](../../.github/workflows/release-macos.yml) 检查的 6 个值：

| 名字 | 值 |
| --- | --- |
| `APPLE_CERTIFICATE` | `.p12` 的 base64（一整行） |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设的密码 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: 姓名 (TEAMID)`，与第 4 步输出一字不差 |
| `APPLE_ID` | Apple ID 邮箱 |
| `APPLE_PASSWORD` | 第 3 步的 App 专用密码 |
| `APPLE_TEAM_ID` | 第 1 步的 Team ID |

缺一个，打 tag 的构建就直接失败；手动触发的构建只出 ad-hoc 包。

## 6. 换成 API 密钥要改的工作流（未做，要先问用户）

改 `.github/workflows/` 属于要用户批准的事，这里只写改法：

- Secrets 换成 `APPLE_API_KEY`（Key ID）、`APPLE_API_ISSUER`（Issuer ID）和 `.p8` 的内容（例如 `APPLE_API_KEY_P8`）；
- 「Build signed and notarized DMG」之前加一步，把 `.p8` 写进 runner 的临时目录，路径作为 `APPLE_API_KEY_PATH` 传给构建；`HAS_APPLE_RELEASE_CREDENTIALS` 和缺凭据时的报错文字跟着改；
- `APPLE_ID`、`APPLE_PASSWORD` 不再需要。Tauri 与构建脚本都读这三个环境变量名。

## 7. 仓库里已经接好的（第 26 批第 1 项）

`pnpm desktop:build:macos`（`apps/desktop/tooling/build-macos-release.sh`）在给了 `APPLE_SIGNING_IDENTITY` 时按这个顺序走，任何一步失败就不出包：

1. **先查公证凭据**：只认环境变量名（`APPLE_API_KEY` + `APPLE_API_ISSUER` + `APPLE_API_KEY_PATH`，或 `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`），一组都不齐就在构建前停下。签了名却没公证的包不能给人。
2. **准备内嵌运行时**：下载并校验 Node，生成运行时，删掉 `node-pty` 里别的平台和另一架构的预编译。
3. **逐个重签内嵌运行时**（`sign-macos-runtime.mjs`）：Tauri 只签 App 的标准位置，`Contents/Resources` 下的代码它不签。脚本把里面每个 Mach-O 用同一身份重签，开 hardened runtime、带时间戳；`runtime/node` 带 [`node-runtime.entitlements`](../../apps/desktop/tooling/entitlements/node-runtime.entitlements)（JIT、可执行内存、放开库校验，**不带** `get-task-allow`）；电脑助手这类 `.app` 先签里面主程序以外的 Mach-O，再由里往外把 bundle 整体签，签完不再动里面的文件。
4. **Tauri 打包、签 App、公证并装订 App**。App 的 entitlements 是 `src-tauri/Entitlements.plist`（向 Safari、Chrome、Finder 发 Apple Events），说明文字在 `src-tauri/Info.plist` 的 `NSAppleEventsUsageDescription`。
5. **逐个检查签名**（`verify-macos-signatures.mjs --release`）：每个 Mach-O 和 bundle 签名有效、hardened runtime、没有 `get-task-allow`、Node 有 JIT 权限、都是 Developer ID、都带时间戳、只有一个 Team ID。
6. **签名、公证、装订 DMG**（`notarytool submit --wait`、`stapler staple`）。用户可能第一次在断网时打开下载的 DMG，所以 DMG 也要带自己的票据。
7. **Gatekeeper 评估**：App 和 DMG 各 `stapler validate` 一次，`spctl --assess` 一次。

不给身份时（本机），同样逐个 ad-hoc 签、开 hardened runtime，同样跑第 5 步的本机部分（不查证书、时间戳和 Team）。macOS 对 ad-hoc 签名也执行 hardened runtime，所以本机能跑起来，签法就和发行包一致。`tests/desktop-macos-signing.test.ts` 在 macOS 上用真实的 Node 和原生插件验这一套。

## 8. 第一次用真身份构建：要验的（等第 1～5 步做完）

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: 姓名 (TEAMID)"
# 公证凭据按第 3 步，二选一；只在当前终端里设，不写进文件
pnpm desktop:build:macos
```

脚本自己会做第 7 节的全部检查。另外人工确认：

- 在一台**没装过** Molis Work 的 Mac 上，断网和联网各打开一次 DMG，拖进「应用程序」后打开，Gatekeeper 不拦；
- 终端、核心服务、电脑助手都能用（Node 的 entitlements 是不是够，以真机为准）；
- 屏幕录制、辅助功能、输入监控要**重新授权一次**：签名身份从开发证书或 ad-hoc 换成 Developer ID，系统把它当成另一个程序；
- 公证被拒时，用 `xcrun notarytool log <submission-id>` 看逐个文件的原因，改完重新构建（每轮几分钟到几十分钟）。

## 9. 以后从个人换到公司主体

Team ID 一变，系统就把它当成新程序：

| 东西 | 换主体后 | 依据 |
| --- | --- | --- |
| 屏幕录制、辅助功能、输入监控（TCC） | **失效**，要在系统设置里重新勾 | `apps/desktop/adapters/tauri/src/shelf_hotkeys_macos.rs` 的 `AXIsProcessTrusted()` |
| 钥匙串里的主密钥 | 不受影响 | 条目经 `/usr/bin/security` 存取，信任的是这个系统工具（`packages/storage/src/adapters/file-secret-store.ts`），不是 App 的签名 |
| `~/.molis-work` 里的数据 | 不受影响 | 普通文件 |

> 换主体之前，不要把钥匙串的存取改成 `SecItem` 加 `kSecAttrAccessGroup`：access group 带 Team ID 前缀，换主体后新程序读不到旧密钥，加密过的内容就打不开了。

换主体那一版，发布说明里写明要重新授权，App 里对「辅助功能未授权」给出明确的引导。

## 10. 还没做的

- 真实的签名、公证与 Gatekeeper 结果：等第 1～5 步；
- 改用 API 密钥：等用户批准第 6 节的工作流改动；
- `@prologue/sdk` 能不能随安装包再分发，还没有书面答复（`specs/archive/repository-anti-corruption/c-end-readiness.md` §6 第 1 条）。没有答复之前，公证过的包只能内部用。
