# 合作源码与商业授权

状态：本分支已完成，待合入（2026-10-16）。负责人：Codex。仓库许可与分发材料已完成切换并通过定向验证：合作方能够阅读源码和参与开发，对外销售、提供收费服务或转授权须事先取得 Molis AI 权利方的书面授权；未发布、未改变仓库可见性、未修改已发布版本。按 main 上的实现判定归档，合入前保留本 spec。

## 目标、证据与边界

用户已确认采用专有许可与合作源码授权方向，先写 spec，再统一处理项目自身的 MIT 声明。切换前根 LICENSE 为 MIT，README 中英文与项目包元数据均声明 MIT；GitHub API 在本次检查中返回仓库为 public、许可为 MIT。许可修改无法追回已经按旧许可取得的权利，也不能靠文本保证侵权在技术上绝对不会发生。

用户指定名称为 **Molis AI**，它目前是概念组织，背后的主体公司尚未设立。许可证中的 Molis AI 是项目/组织名称；授权人是软件实际著作权人及其合法授权代表，不虚构公司法定名称、注册地或签约权限。未来公司只有取得相应权利或合法授权后才能据此出具商业许可。原有 Adeptify 署名作为历史通知保留，不用修改当前通知来推定已经发生权利转移。

范围包括根许可证、中英文 README、CHANGELOG 的未发布条目、项目自身 package.json（含 SDK、contracts、内置插件与示例）、桌面 Rust 包的许可指向、打包时许可证的携带、安装器生成运行时包时保留源许可字段，以及定向验证。第三方许可证、vendored 包及其来源记录保持原样；旧 spec 中描述历史或第三方 MIT 的文字保留。无关包字段、依赖、版本号、运行时业务、付费功能、在线校验、现有 Home、已发布安装包和 Git 历史不改。本次不设 SDK 的宽松许可例外，也不将用户原创输出或独立插件的版权归于 Molis AI。

## 场景与许可规则

1. 合法取得的软件可以用于个人或组织内部工作。合作方在获准的合作范围内可以阅读、复制、构建、测试、修改源码，并把修改交回授权人；源码访问、开发参与或付费开发本身不构成对外经营授权。
2. 未经实际权利人或其合法授权代表事先明确书面授权，不得对外销售、转售、出租、许可、发行软件或其修改版/实质部分，不得提供以软件功能为内容的收费托管、SaaS、API、白标或嵌入式服务，也不得转授权、向未获准第三方转交源码。改名、改 UI、加壳或免费捆绑进收费产品不改变此边界。
3. 书面授权应指明双方主体、软件/版本、允许行为、客户或用途范围、期限，以及能否再分发、转授权和费用安排。单纯授予仓库访问或接受贡献不视为此授权。合作协议可明确批准付费开发、部署或其他服务。
4. 合作开发的版权归属、公司成立后的权利转移、保密义务与离场处置由实际权利主体签署的协议约定；本仓库许可证不自动转让贡献者权利。不虚构法域、赔偿金额或对尚未成立公司的权利归属。
5. 第三方组件依其原有许可；用户用软件产出的独立文档、图片等不因使用本软件受本许可控制。旧版本已经合法获得的许可不被本次切换追溯撤销。

## 实现、取舍与依赖

根 LICENSE 是许可正文的唯一维护源，采用英文正式文本；中英文 README 提供一致摘要并链接正文，工程 spec 由仓库索引查阅。自定义许可证使用 npm 支持的 `SEE LICENSE IN LICENSE`；各项目包保存与根正文逐字一致的普通文件分发副本，更新时从根复制，用定向测试核对所有副本与元数据。副本不单独维护条款，不增加生成脚本或运行时机制。

原方案用包内相对链接引用根正文。实际回归发现：npm staging 能解引用，但 Home/桌面安装器按既有安全边界拒绝指向包外的依赖文件链接（`apps/cli/LICENSE`）；直接 npm pack 也会忽略符号链接。因此改为普通文件副本，保留安装器路径检查原样。独立包继续使用现有 pnpm pack，产品 npm 包继续走 pnpm package:npm 的 staging，均实测产物。

桌面 crate 使用 Cargo 的 license-file 指向根正文。现有 npm staging、Home release 和桌面 runtime payload 均已有许可证复制入口；在 `apps/local-host/src/installer/home-source.ts` 读取源包已有的字符串 license，经内部 `InspectedSource` 类型传给 `home-release.ts` 生成的运行时 package.json；源包未声明时不凭空授予许可。这补齐运行时打包到 Home 再安装时的许可元数据传递，不增加授权运行时或新的发布系统。依赖必须在隔离工作树安装，构建走机器槽位；不操作真实 Home。

改动分两步：先完成本 spec 和授权文本；再统一元数据、说明和打包验证。回滚只撤回本分支变更，不改历史提交及远端设置。上线前仍需核实实际权属与历史分发，并由律师审定正式合作协议；这些事实不能用工程测试代替。

## 验收标准

- **CSL-01** [人工] 许可正文允许约定范围内合作开发，明确要求对外销售、收费服务与转授权的事先书面授权，包含衍生版、实质部分和改名/捆绑场景；不把正常内部使用与原创输出一并禁止。
- **CSL-02** 所有项目包元数据不再声明 MIT，许可指向有效；根许可证为唯一维护源，包内普通文件副本逐字一致。第三方及历史记录不误改。
- **CSL-03** 实际 npm 成品包、桌面 runtime payload 及独立 SDK/contracts tarball 包含新的许可正文，元数据与正文一致；现有打包和插件使用路径仍工作。
- **CSL-04** [人工] 中英文说明和主体定义一致；Molis AI 未被写成已成立法人；贡献权属不被自动转让，旧授权与第三方许可保留。
- **CSL-05** [人工] 构建、定向回归、边界与健康检查通过，或对已有基线失败提供可复现证据；最终 diff 无其他会话改动或真实 Home 写入。

## 验证与结果

计划：安装 `pnpm install --frozen-lockfile --offline`，整体 `pnpm build`，再跑 `node scripts/run-tests.mjs --jobs 2 tests/license-materials.test.ts tests/npm-package.test.ts tests/runtime-payload.test.ts tests/e2e.test.ts tests/install.test.ts tests/installer-symlink-dependencies.test.ts`；另验独立包许可证、项目声明扫描、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`node scripts/check-spec-coverage.mjs` 与 `git diff --check`。本次改许可、包元数据、分发副本与相应测试，并补安装器的许可元数据传递；没有 SDK/公开合同/宿主装配及业务状态变化。验证集中在安装器、源与产物和路径拒绝合同，不运行共享核心及无关业务的全量。独立 SDK/contracts 的实际 tarball 由新增定向用例验证，插件浏览器使用流程未改变，因此不扩跑 `tests/plugin-sample.e2e.test.ts` 的浏览器批次。安装与重启链路由现有 `tests/e2e.test.ts` 和 runtime payload 用例覆盖。

2026-10-16 在独立分支 `feature/commercial-source-license` 完成，基线为 `446c05218`。最终结果如下：

| 验收项 | 结果与证据 |
| --- | --- |
| CSL-01 | 通过文本核对。根 LICENSE 第 2–4 节覆盖合作开发、内部使用、衍生版、收费服务、转授权、改名/捆绑与独立成果边界；商业许可须由实际权利方事先明确书面授予。 |
| CSL-02 | 通过。73 份项目 package.json 统一指向新许可；72 份包内普通文件副本与根正文一致，Cargo 指向根正文。`license-materials` 用例和逐项 diff 核对确认；未修改第三方许可、vendored 材料或历史记录。 |
| CSL-03 | 通过。实际 npm tarball、独立 contracts/SDK tarball、桌面 runtime payload 和安装后的 Home release 均携带完整正文与一致元数据；删除原 payload 后安装结果仍可独立启动。源包没有 license 字段的夹具不会凭空获得许可。 |
| CSL-04 | 通过文本核对。中英文说明与 LICENSE 的主体一致；保留历史署名、第三方许可与旧版本已合法授予的权利；没有把尚未成立的公司写成当前法人或自动取得贡献版权。 |
| CSL-05 | 通过。最终整体构建、6 个定向测试文件（32 项测试）、包边界和对照 merge-base 的健康门禁通过；独立工作树仅含本任务差异，安装验证使用临时 Home。 |

执行记录：`pnpm install --frozen-lockfile --offline`、`pnpm build`、上述 6 文件回归命令、`node scripts/check-package-boundaries.mjs`（完整构建后直接执行 `boundary:check` 的校验脚本，避免重复构建）、`node scripts/check-health-gates.mjs --base origin/main`、`node scripts/verify-release-versions.mjs`、`cargo metadata --offline --no-deps --format-version 1 --manifest-path apps/desktop/src-tauri/Cargo.toml`、`node scripts/check-spec-coverage.mjs` 与 `git diff --cached --check` 均通过。spec 覆盖报告为 5 项验收、2 项测试引用、3 项人工核对、0 项缺少证明；未提高或放宽门禁。

回归实际发现并修复两处问题：包内许可符号链接被安装器按安全合同拒绝，改为普通文件副本；运行时 package.json 原本遗漏源包的 license 字段，已沿现有安装器调用链传递。最终回归保留路径拒绝断言，未放宽安装边界。

首轮工程验收未构建签名/公证 DMG、未运行无关业务全量或浏览器用例，也未推送、开 PR、合入或发布。律师审定、合作签约及未来公司取得权利的手续不属于本次仓库工程验收；本任务不宣称这些事项已经完成。

2026-10-16 用户追加授权：复查遗漏、推送并开 PR，检查通过后合入 main。复查项目源码、元数据、分发文件选择和安装器调用链，未发现遗留的项目 MIT 声明；保留的 MIT 文本属于第三方、历史记录、依赖夹具或 MIT 新闻源。中英文 README 去掉指向未随安装包分发的本 spec 的相对链接，保留随包存在的 LICENSE 链接。后续按仓库合并队列验证 main 上的合并结果，不修改真实 Home 或发布版本。

## 参考

- [npm 自定义许可证字段](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#license)
- [Cargo license-file](https://doc.rust-lang.org/cargo/reference/manifest.html#the-license-and-license-file-fields)
- [开源许可与权属说明](https://opensource.guide/legal/)
- [OSI 开源定义](https://opensource.org/osd)：本项目改为受限制的合作源码许可，不再称为 OSI 开源软件。
