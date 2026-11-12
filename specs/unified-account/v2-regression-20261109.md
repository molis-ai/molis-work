# V2 统一回归记录（2026-11-09）

2026-11-09 追加清理已完成：Auth 完整测试（合同 8 / Rust 16 / Worker 111 / Web 1 / SDK 2）与 11 组页面验收通过；Work 本轮 1,879 文件均执行，复验后 1,874 通过、5 个已知基线失败保留。最终清理范围与独立验证见文末 [追加清理后的完整回归](#追加清理后的完整回归)。其余原文保留首轮证据，不能把其中的服务凭据功能当作当前功能。

首轮状态：两个授权仓库的实现、构建、本地完整回归与失败对照已完成；Work 有 5 个基线可复现的失败文件，不满足全仓全绿或合并就绪。未提交、推送、部署，不操作真实 Home 或云端库。

## 最终范围

Auth 基于 `67904ef`，Work 基于包含 #1846、#1965 的 `e05887d142b849a70171be18bf5849e5587225f0`，均在 `codex/unify-v2-20261108` 独立工作树实现；未覆盖主检出的未提交改动。

Auth 拥有 V2 用户、登录方式、会话、租户策略、平台权限、订阅席位和权益。Work 的安装入口与 Home 共用同一 V2 会话，继续分开本机控制令牌、Home 租约与本地 actor。默认 SELF_SERVICE，可由服务端切为 PLATFORM_ONLY；平台代建仍单独要求 TENANT_CREATE。不保留 V1 登录恢复、旧 Token/Cookie/Team/VIEWER/Apple 兼容路径。没有改 Work 插件处理与业务内容归属。

## 完整回归与源码核对

Work 先整体 `pnpm build`，再执行以下三份；每份由标准测试运行器领取一个机器测试槽，每份同时一个文件：

```sh
node scripts/run-tests.mjs --jobs 1 --shard 1/3
node scripts/run-tests.mjs --jobs 1 --shard 2/3
node scripts/run-tests.mjs --jobs 1 --shard 3/3
```

固定 Node 24.15.0、pnpm 11.9，以及专用 Chrome 156.0.8078.80 的独立副本和临时浏览器资料。清单为 626/627/626，共 1,879 个不同文件，没有重复或遗漏；原始结果 1,866 通过、13 失败，三份退出码均为 1。此前定位批次不累计进本轮数字，用例内部原有的平台/环境条件跳过保持原样。

全量期间代码、测试、脚本、依赖冻结，源码 SHA-256 为 `085326a97fcdca6d7e86bccbe766f9fa80eafd707d455360ace4c9624f1d374a`。全量后只改 `tests/fixtures/parameterless-reads.ts` 与 `tests/account-refresh-pages.test.ts` 两个测试文件，分别补入新动作的配置拒绝和 V2 JSON 成功状态；原来的身份、取消、准备与恢复断言保留。重新整体构建，并复验两个直接用例和金样调用方。最终源码 SHA-256 为 `2312577a001815eaf967b096842fc6aed782181984315bedf061eaef26a261b6`；将这两个文件在内存中换回全量时内容后，摘要与全量一致，证明没有其他源文件漂移。

按明确复验结果更新后，1,874/1,879 个文件通过，仍有下表 5 个失败文件。不把原始失败抹除，也不把多次执行累计为更多通过文件。

## 复验与基线对照

基线工作树与 Work 起点同为 `e05887d142b849a70171be18bf5849e5587225f0`，使用相同 Node 与专用浏览器副本。

| 文件 | 最终结论 | 证据 |
| --- | --- | --- |
| `tests/workbench-deferred-clients.e2e.test.ts` | 基线同样失败，保留 | 756×469 下同一 Home 菜单入口被 Shelf 侧栏遮挡 |
| `tests/plugin-market-upgrade.e2e.test.ts` | 基线同样失败，保留 | 756×469 下市场菜单项被同一 Shelf 侧栏遮挡 |
| `tests/artifact-handoff.e2e.test.ts` | 基线同样失败，保留 | 同一助理关闭按钮被 Issue 侧栏遮挡 |
| `tests/connector-managed-install.test.ts` | 基线同样失败，保留 | 原 uv 低于要求，下载失败；临时补齐 uv 0.12.19 后，两边仍在合成 Python 包安装失败，基线诊断显示本地测试源返回 502；其余 5/6 通过 |
| `tests/golden-home.test.ts` | 账号回放补修通过；生成稳定性在基线复现，保留 | 最终 27/28；提示词使用记录在原正常/慢时序轮次交替出现差异。基线单文件曾 28/28，随后用原慢时序夹具第 7 次生成复现同一 `manifest.json:515` 与提示词库第 39 行差异：`knowledge.organize` 使用记录 16→17。未调整断言、归一化或业务处理 |

其他原始失败的复验：

- `tests/security-invariants-connection-card.e2e.test.ts`：基线 4/4、本分支复验 4/4。
- `tests/account-registration.e2e.test.ts`：基线 2/2、本分支复验 2/2；原始超时仍留在日志。
- `tests/home-package-project-reach.e2e.test.ts`、`tests/plugin-trust-home-upgrade.e2e.test.ts`、`tests/plugin-trust-view.test.ts`：原用例强制独立 `chrome-headless-shell`。补齐三个浏览器环境变量，使用专用 headless 151.0.7922.34，分别 3/3、1/1、6/6 通过；没有放宽专用引擎检查。
- `tests/native-checks.test.mjs`：原 PATH 选择了缺少 WASM 目标的 Homebrew Rust。复用实际已安装目标的 Rust 1.96.0 工具链后 36/36 通过，包含故意引入错误必须被拒绝的断言。
- `tests/action-read-compatibility.test.ts`：补齐新动作的配置拒绝后 6/6；不是忽略动作或接受未知异常。
- `tests/account-refresh-pages.test.ts`：按现行 V2 完成响应更新后 12/12；继续验证旧准备的取消不能撤销新登录，新身份必须为 carol。

## Auth 与联合验收

Auth 最终源码执行 `npm test`，合同 7、Rust 单元 16、Worker/WASM/D1 111、Web 1、SDK 2 项全部通过；`npm run build`、Rust/前端格式与 diff 检查通过。Cookie/CSRF 在匿名登录成功时原子轮换，旧匿名引用没有认证权限；中央失效会清除恢复材料，错误的再次验证密码保留有效登录。

`npm run test:browser` 使用真实 Auth/WASM/D1 与 Chrome，通过 11 组页面流程：手机注册登录、自助租户、资料、再次验证与绑定、改密、应用创建/停启、客户端登记/回调与来源修改/停启、服务凭据一次性展示/轮换/隐藏/停用、用户状态与显式权限授予/撤销、中央撤销后立即重登、退出及无浏览器 Token 存储。修正旧控制台双列样式影响新页面的问题；1440/1024/390 均检查页头位于主区上方且不横向溢出，截图经人工查看。

Work 与真实 Auth 的安装、管理、租户和商业专项通过；安装专项覆盖 A/B/A、同一 V2 会话、原有内容归属、重启、原生附着、旧 Cookie 拒绝及明暗三宽度。服务与投递使用受控 mock，不代表真实提供方、邮件、短信或生产部署验收。

## 门禁与交付限制

最终整体构建、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、中央固定合同一致性、公开 API/动作快照、同步 Rust clippy、版本与 diff 检查通过。`pnpm page-assets:check --base origin/main` 用独立基线实测 51 个资源，仅 workbench.js 净增 193 字节，其余 50 个不变；按任务独立记账，没有改预算规则。

原始完整日志为临时目录中的 `work-v2-final-full-{1,2,3}.log`；后续复验、基线与 Auth 最终日志同样按轮次保留，汇总为 `work-auth-v2-final-verification.json`。这些是本地证据，不是最终 PR 的 CI Full 或发布证据。5 个保留失败须独立处理，本次不侵入对应业务来消除失败。


## 追加清理后的完整回归

本次移除没有消费者的服务凭据管理页面、中央/BFF 操作与辅助逻辑，删除 5 个 schema、4 个操作和 SERVICE_READ/WRITE 两项能力，当前平台能力为 14 种。全新 Auth 库不创建 10 张旧会话、授权、Token、成员、邀请或服务表，应用不再有旧 actions/grants 列。Work 固定合同、来源摘要、DTO 和公开 API 快照同步更新；没有修改插件业务处理。V2 用户会话、验证码/回跳/证明、本机控制与原生附着票据仍按原 owner 使用。

Auth 本轮 `npm test` 合同 8、Rust 16、Worker/WASM/D1 111、Web 1、SDK 2 全通过；最终构建、格式、diff 通过。真实页面仍为 11 组：原服务 CRUD 组替换为“旧服务凭据控件不存在”，其他流程与安全断言保留。截图目录 `auth-v2-retire-browser-evidence`，人工查看 1440 与 390 平台页；完整页面脚本核对三个宽度。

Work 先整体构建并完成边界检查，再冻结代码与测试。3 个必须使用专用 headless shell 的文件以 151.0.7922.34 单独通过；其余 1,876 文件以专用 Chrome 156 分为 626/625/625，每批机器测试槽、`--jobs 1`，同一文件不重复分片。固定 Node 24.15、pnpm 11.9、uv 0.12.19 与实际已安装 WASM 目标的 Rust 1.96。原始 1,872 通过、7 失败，三个分片退出码 1/0/1。

新增两项原始失败的复验使用同一源码、环境和原断言：

| 文件 | 原始结果 | 复验与归因 |
| --- | --- | --- |
| `tests/onboarding-journey.e2e.test.ts` | 13/14，粘贴网页正文后的文件列表等待超时 | 14/14，通过；保留原始偶发失败日志 |
| `tests/plugin-methods-runtime.test.ts` | 10/11，混合注册升级时实际为“方法不可用”，期望“版本已变化” | 11/11，通过；保留原始偶发失败日志 |

按复验更新后，1,874/1,879 通过。仍失败的 5 项与上表首轮干净 e058 基线证据一致，复用已有相同失败的对照，没有伪称本轮重新跑过基线：`workbench-deferred-clients` 和 `plugin-market-upgrade` 的 Shelf 遮挡、`artifact-handoff` 的 Issue 遮挡、`connector-managed-install` 合成 Python 包安装失败、`golden-home` 的 `manifest.json:515` / `prompt_uses` 第 39 行时序差异（本轮 26/28）。本轮 Python 日志只给出安装失败，502 是首轮基线诊断，二者不混写。

全量前后源码摘要均为 `c8cdb75584ab2207f1a1d02a11c91461d2da616e1ab36f50fad2317f529e1f61`；期间只改 docs/specs，没有测试或源码漂移。全量包含账号注册 2/2、切换顺序 3/3、本机 HTTP 11/11、原生检查 36/36，完整清单汇总严格核对全部 1,879 文件，无重复或遗漏。

本轮整体构建、边界、基于 merge-base 的健康门禁、固定合同字节/摘要/DTO、公开 API/动作快照、版本、diff 与页面资源门禁均通过。页面资源比较实际隔离基线的 51 个资源，仍只有此前 workbench.js +193 字节，无新增增长。

日志：`/private/tmp/work-v2-retire-full-{1,2,3}.log`、`work-v2-retire-headless.log`、`work-v2-retire-recheck-{onboarding,methods}.log`；Auth 为 `auth-v2-retire-{tests,build,browser,format-check}.log`。最新独立汇总为 `/private/tmp/work-auth-v1-retire-final-verification.json`。这是本地验证，仍不满足全仓全绿，不替代最终 PR 的 CI 或 LIVE 提供方验收。没有为变绿修改业务逻辑、跳过或放宽断言。未提交、推送或部署，真实 Home 与已有库未操作。


## 退出登录连接修复后的验证范围

2026-11-09 用户要求完整全量回归留到最终提 PR 前。ASR-09 已修改源码，因此上文完整回归只代表修改前的版本。本轮整体构建通过，11 个账号相关文件共 89 个用例通过；最后增补嵌套页面变化保护后，直接相关 5 文件 36 个用例再次通过。真实 Auth/Work 预览浏览器登录、退出通过，约 417 毫秒返回登录入口。完整范围、测试归属和页面资源变化见同目录 `spec.md` 的 ASR-09；本轮未重新跑全量。

退出后跳转竞态修复后，浏览器相关 4 文件 14 个用例再次通过；真实预览最终脚本退出码 0，截图成功，Cookie 清理及旧 Cookie 入口稳定性均有断言。

最终过期 Cookie 拒绝分支复核：上述两个 HTTP 文件 24/24，通过后恢复 4307 预览；完整全量仍待最终 PR 前执行。
