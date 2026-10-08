# 依赖清单与 Prologue SDK 收敛方案（W1-20，§4.17）

状态：方案与清单（2026-10-08，量于 main 35d7f320）；已落实的只有根 `packageManager` 与 CI 读它；推送、删除 vendored 文件、改依赖版本都没有做，等用户确认后按 §4.4 的顺序分片执行

来源：路线 [roadmap-2026-10-07.md](roadmap-2026-10-07.md) §4.17 与 N-14、N-02；用户决定见 [spec.md](spec.md) §1「2026-10-08 Prologue SDK 收敛与私有包」。本文每条结论后面写了证据：代码路径、命令或外部记录；没有核对的写「未验证」，从代码读出来但没有运行的写「推断」。

## 1. 摘要

1. **pnpm 已固定**：根 `package.json` 加了 `"packageManager": "pnpm@11.9.0"`，CI 与发布工作流改成从这个字段取版本，不再各写一个数字；`pnpm install --frozen-lockfile --offline` 在新建的工作树里 3.8 秒通过，`pnpm-lock.yaml` 没有变化（§2）。Node 只是方案，没有改（§2.2）。
2. **第三方依赖**：没有真正没用的依赖；重复集中在 11 个多版本传递包和几处声明漂移；`pnpm audit` 有 2 高、11 中、1 低，**全部有已发布的修复版本**，其中一条高危落在代码真用的路径上（§3）。
3. **Prologue 的 SDK 比 README 写的好收敛得多**，有三件事和 10-08 弹窗时的前提不一样（§4.1）：
   - 源分支 `feat/molis-side-panel-surfaces-on-memory` **早已推到 Prologue 远端并合入**（PR #3，2026-09-30），远端现在只有 `main`，没有特性分支可推；`vendor/prologue-sdk/README.md` 里「暂未推到 prologue 远端」与 `specs/BACKLOG.md` 的 BL-024 都是过期的；
   - 现行 vendored 包**不需要任何补丁**：用上游提交 `9fc3b173` 的 `packages/sdk` 直接构建，打出的 tgz 与仓库里的逐字节相同（SHA-256 `942de9c5…846c`）；
   - 因此 25 个历史补丁，连同现行的 `side-panel-memory.patch`，重建都用不着（§4.5 给出 25 个的清单和 sha256；本片只列清单，不删）。
4. **私有包移出公开仓库**：推荐「私有仓库的 release 附件 + 仓库内只留清单与校验和」，保持 `file:` 依赖和锁文件不变，不改包名；CI 用 GitHub App 的短期令牌读取（§5）。GitHub Packages 不能托管 `@prologue/*`、`@adeptify/*`，原因见 §5.2。
5. **这个决定管不到的三件事要另问**（§7）：Git 历史里已有的 tgz 与补丁（公开、不改历史就还在）、发布出去的 DMG 与 npm 包里编译后的私有包、Prologue 没有 LICENSE。

## 2. 已落实：pnpm 与 Node 固定

### 2.1 pnpm

| 位置 | 之前 | 现在 |
| --- | --- | --- |
| 根 `package.json:18` | 没有 `packageManager` | `"packageManager": "pnpm@11.9.0"` |
| `.github/workflows/ci.yml:35-37` | `npm install --global pnpm@11.9.0` | 读 `package.json` 的 `packageManager` 字段再装 |
| `.github/workflows/release-macos.yml:31-33` | 同上 | 同上 |
| 本机 | pnpm 11.9.0，经 corepack（`~/.cache/node/corepack/v1/pnpm/11.9.0`） | 不变，现在字段与它相等 |

- 验证：在新建工作树（origin/main 35d7f320）加字段后执行 `pnpm install --frozen-lockfile --offline`，退出码 0，输出「Lockfile is up to date」「Done in 3.8s using pnpm v11.9.0」，`git status` 只有 `package.json` 与两份工作流有改动，锁文件没变。工作流里那条 shell 命令我在本机原样执行过，输出 `pnpm@11.9.0`；两份 YAML 用 PyYAML 解析通过。GitHub Actions 上的真实运行没有做（未验证）。
- 字段不带 `+sha512` 哈希：CI 用 `npm install --global` 装，npm 能不能解析带 `+sha512` 的写法我没有试，所以不加。
- 已知副作用：`apps/local-host/src/installer/npm-package.ts:84-93` 的 `publishMetadata` 只去掉 `scripts` 与 `devDependencies`，所以发布用的根 `package.json` 里也会带 `packageManager`。对安装方无影响（Corepack 只读当前目录往上的 `package.json`），要去掉就在那里再删一个字段并补断言；本片不动源码（不跑构建，改了也没法在本片里验证）。
- 上游 Prologue 的根 `package.json` 已经同时写了 `"packageManager": "pnpm@11.9.0"` 与 `engines.node: "24.14.0"`，并有 `rust-toolchain.toml`（`git archive 9fc3b173` 的内容）；Molis 照这个做法即可。

### 2.2 Node 与 Rust（方案，未改）

现状（均已核对）：本机 Node v24.14.0；两份工作流 `setup-node` 的 `node-version: 24`（取最新 24.x，会漂）；桌面包内置 Node 默认 24.14.0（`apps/desktop/tooling/prepare-macos-runtime.sh:7`，可被 `MOLIS_WORK_NODE_VERSION` 覆盖）；`@adeptify` 两个包是用 Node 24.19.0 打的（各自的 `provenance.json`）；没有 `.nvmrc`、`.node-version`；72 个 `package.json` 写 `engines.node: ">=24"`；根 `@types/node` 是 `^22.13.0`（锁在 22.20.1），低于运行时主版本；发布工作流用 `dtolnay/rust-toolchain@stable`，没有 `rust-toolchain.toml`。

方案（一片，改 CI 与脚本，要跑一次 CI 才能确认）：

1. 加 `.node-version`，内容 `24.14.0`（与桌面包内置版本一致）；两份工作流 `setup-node` 改成 `node-version-file: .node-version`；`prepare-macos-runtime.sh` 的默认值改读这个文件。
2. 根 `@types/node` 升到 `^24`（见 §3.3，与 TypeScript 主版本无关）。
3. 加 `rust-toolchain.toml` 固定到当前稳定版，发布工作流不再用 `@stable`。固定哪一版要在 CI 里先跑通，所以不在本片里猜。
4. `engines.node` 保持 `>=24`，不动 72 个文件。

## 3. 第三方依赖清单

量于 main 35d7f320（工作树安装后）。范围：73 个 `package.json`（根 1、工作区包 71、不在工作区里的 `examples/plugin-sample` 1；`pnpm install` 输出「Scope: all 72 workspace projects」），排除 `@molis-ai/*` 工作区包之后，第三方声明 68 条、43 个不同的包名，分布在 16 个 `package.json` 里（52 条 dependencies、16 条 devDependencies；其中 9 条是指向 vendored tgz 的 `file:`，对应 3 个包）。锁文件 `pnpm-lock.yaml` 有 336 个包条目，与 `pnpm audit` 报的 336 一致。

### 3.1 没有用到的

结论：**没有。** 方法：脚本逐个 `package.json` 扫该包目录下（排除 `node_modules`、`dist`、`vendor`）所有 `.ts/.tsx/.mts/.js/.mjs/.cjs/.html/.css/.sh` 里的 `from`、`import()`、`require()`、`import "x"`；找不到再看包自己的 `scripts`、`bin`，再看任意文件里有没有这个名字。68 条里 65 条在代码里直接引用，3 条要解释（脚本只认静态引用，动态拼接的名字它看不到）：

| 声明 | 为什么不是多余的 |
| --- | --- |
| `horizontal/agent-host` 的 `@tauri-apps/api@2.11.1` | 代码里不 import；它是 `@prologue/sdk` 的传递依赖，安装器遍历依赖时解析不到就拒绝安装，所以显式声明（`specs/plugin-platform-v2/architecture-review.md` §1.7；`scripts/workspace-packages.mjs:62` 的 `extraDependencies` 同步列着） |
| 根 devDependency `@tauri-apps/cli@2.11.4` | `apps/desktop/tooling/build-macos-release.sh:27` 执行 `node_modules/.bin/tauri build` |
| 根 devDependency `tsx` | 根 `package.json` 的 `cli`、`mcp`、`web`、`molis-work` 脚本 |

另有：根 `node-pty` 只在 `tests/runtime-payload.test.ts:56` 的字符串脚本里 `import('node-pty')`（检查安装后的运行时能加载），是安装器展平依赖需要的（推断）。

**反方向（代码引用了但没声明）**：1 处真实的。`tests/contextual-interaction.test.ts:6` 有 `import type { EditorView } from "prosemirror-view"`，根没声明 `prosemirror-view`；是纯类型导入，运行时被擦掉，而且 `tsconfig.json` 把 `tests` 排除在外，所以没有报错（`prosemirror-view` 现在只在 `plugins/native/pages` 声明）。其余几十条命中都是字符串里的 import 文本或测试夹具，不是依赖。`apps/desktop/tooling/prepare-runtime-payload.mjs:24-26` 动态 import `better-sqlite3`/`node-pty`/`ws`，运行在已准备好的运行时目录里，不解析自 `apps/desktop`。

### 3.2 重复的

**锁文件里一个包有多个版本**（11 个，与路线记录一致）：

| 包 | 版本 | 谁拉进来的（`pnpm why -r`） |
| --- | --- | --- |
| `htmlparser2` | 10.1.0 / 12.0.0 | 10.1.0 只来自 feed 的 devDependency `@types/sanitize-html@2.16.1`；12.0.0 来自 `pages` 的直接依赖与 `sanitize-html@2.17.7` |
| `entities` | 4.5.0 / 7.0.1 / 8.1.0 | 4.5.0 与 7.0.1 同样来自 `@types/sanitize-html`→`htmlparser2@10.1.0`；8.1.0 来自 12.0.0 |
| `dom-serializer`、`domelementtype`、`domhandler`、`domutils` | 各 2 个主版本 | 跟着上面两个 htmlparser2 |
| `postcss` | 8.5.26 / 8.5.28 | 8.5.26 来自 `sanitize-html`（feed）；8.5.28 来自 `vite`（alchemist 的 vitest） |
| `content-type` | 1.0.5 / 2.1.0 | 都来自 `@modelcontextprotocol/sdk`→`express@5.2.1` 的子树 |
| `readable-stream`、`string_decoder` | 2.3.8 / 3.6.2、1.1.1 / 1.3.0 | 2.x 来自 `mammoth`→`jszip`；3.x 来自 `better-sqlite3`→`prebuild-install`→`tar-fs` |
| `@types/better-sqlite3` | 7.6.13 / 9.6.0 | alchemist 写 `^7.6.13`，根与 `private-work-context` 写 `^9.6.0` |

处理建议：这 11 个里只有 `@types/sanitize-html`（拖进旧 `htmlparser2`/`entities` 一整串）和 `@types/better-sqlite3` 两条是我们声明造成的；前者升到 2.16.2 后是否还拉 10.1.0 没有验证，后者把 alchemist 改成 `^9.6.0`（要跑 alchemist 的类型检查）。其余是第三方自己的传递依赖，不处理；`pnpm-workspace.yaml` 里已有的 `overrides: safe-buffer: 5.2.1` 是同类取舍的先例。

**同一个包在多个 `package.json` 里各写一遍**：`better-sqlite3`（根、`modules/goals`、`modules/private-work-context`、`packages/storage`、`plugins/native/alchemist`，五处都是 `12.8.0`）、`@adeptify/search-evidence-layer`（五处）、`node-pty`（根与 `apps/local-host` 写 `^1.1.0`，`horizontal/runtime-host` 写 `1.1.0`）、`@adeptify/intelligence-client`（三处）、`fflate`（`apps/local-host` 与 `plugins/native/ppt`，都 `0.8.2`）、`marked`（feed `^18.0.11`，pages `18.0.11`）、`prosemirror-model`（根 `^1.25.11`，pages `^1.25.4`）、`@xterm/xterm` 与 `@xterm/addon-fit`（`shelf` 与 `work` 各一份）、`@modelcontextprotocol/sdk`、`esbuild`、`typescript`、`ws`、`@types/ws`（根与 `apps/local-host`）。

处理建议：用 pnpm 的 catalog（在 `pnpm-workspace.yaml` 里写 `catalog:`，各包写 `"better-sqlite3": "catalog:"`）把至少 `better-sqlite3`、`node-pty`、`marked`、`prosemirror-*`、`fflate` 的版本只写一遍；`better-sqlite3` 13 的升级（§3.3）正好是第一个要改五处的场合。不要为此改动依赖解析结果，所以先做 catalog，再升版本。

**功能重复**（读出来的，不是门禁）：压缩包有 `fflate`（`apps/local-host/src/material-documents-parser.ts:2`、`plugins/native/ppt/src/pptx.ts:1`）与 `jszip`（只作 `mammoth` 的传递依赖）；校验有 `ajv`/`ajv-formats`（`packages/kernel`）与 `zod`（只在 alchemist）；终端有 `@xterm/xterm` 在两个插件里各一份声明（同版本）。这三处不建议现在合并，写在这里是为了换版本时知道有两套。

### 3.3 过期的

`pnpm outdated -r`（2026-10-08，联网）：25 个落后，其中 5 个落后一个主版本。

| 包 | 现在 → 最新 | 声明处 | 建议 |
| --- | --- | --- | --- |
| `better-sqlite3` | 12.8.0 → 13.0.3（主版本） | 五处 | 不急；先做 catalog，再升并跑全量，原生模块要重新编译，安装器与 DMG 的运行时都要核对 |
| `typescript` | 5.9.3 → 7.0.2（主版本） | 根、`apps/local-host` | 不升；跨两个主版本，等专门一片 |
| `vitest` | 4.1.10 → 5.0.3（主版本） | alchemist | 先升到 4.1.11（安全修复），不跨主版本 |
| `@types/node` | 22.20.1 → 26.6.4（主版本） | 根 | 升到 `^24`（与运行时 24 对齐），不追 26 |
| `@types/better-sqlite3` | 7.6.13 → 9.6.0（主版本） | alchemist | 见 §3.2 |
| 小版本/补丁 20 个 | `@modelcontextprotocol/sdk` 1.30.1→1.32.1、`hono` 4.12.32→4.13.13、`fflate` 0.8.2→0.8.3、`mammoth` 1.11.0→1.13.0、`marked` 18.0.11→18.1.0、`sanitize-html` 2.17.7→2.18.0、`ws` 8.21.3→8.22.0、`pdfjs-dist` 6.3.289→6.4.299、`zod` 4.4.3→4.6.5、`lucide` 1.31.0→1.52.0、`highlight.js` 11.11.2→11.12.0、`@tauri-apps/api` 2.11.1→2.12.1、`@tauri-apps/cli` 2.11.4→2.12.1、`tsx`、`@types/ws`、`@types/sanitize-html`，以及四个 `prosemirror-*` | | 与公告相关的先升（§3.4）；其余按月批量升一次并跑全量；`@tauri-apps/api` 要和 vendored SDK 的要求一起看（SDK 声明的是 2.11.1） |

`pnpm-workspace.yaml:26-29` 的 `minimumReleaseAgeExclude` 只放行三个 vendored 包；其余版本发布不足 1440 分钟（pnpm 11 的 `minimumReleaseAge` 默认值，见 pnpm.io/settings/dependency-resolution）时 pnpm 不会装，所以「升到最新」要留意发布日期。

### 3.4 有公告的

`pnpm audit --json`（2026-10-08，联网）：336 个依赖里 2 高、11 中、1 低，与路线的记录完全一致。每条都有已发布的修复版本（`npm view` 核对过）。

| 级别 | 包@现版本 | 公告 | 修复版本 | 进入路径 | 代码里是否走到 |
| --- | --- | --- | --- | --- | --- |
| **高** | `@modelcontextprotocol/sdk@1.30.1` | GHSA-6qxp-vccf-f47h：OAuth 客户端会把凭据发给 MCP 服务端指定的授权服务器 | ≥1.31.0（最新 1.32.1） | 根 devDependency、`apps/local-host` dependency，都写 `^1.30.1` | **走到**：`apps/local-host/src/connector-mcp.ts:10` 引入 `auth`，`:228`、`:352` 调用 |
| **高** | `source-map-js@1.2.1` | GHSA-68fv-2mgg-jv7q：source map 段偏移导致事件循环拒绝服务 | ≥1.2.2（最新 1.2.2） | `sanitize-html`→`postcss`（feed 运行时）；`vitest`→`vite`→`postcss`（alchemist 开发） | 低：feed 用的 `sanitize-html@2.17.7` 解析样式时传 `{ map: false }`（安装目录里 `sanitize-html/index.js:516`），不读 source map；alchemist 一路只在开发与测试时跑 vite |
| 中 ×1 | `fflate@0.8.2` | GHSA-px8p-9vwx-vf98：畸形 ZIP64 使 `unzipSync` 死循环 | ≥0.8.3（最新 0.8.3） | `apps/local-host`、`plugins/native/ppt`，都固定 `0.8.2` | **走到**：`apps/local-host/src/material-documents-parser.ts:130` 对用户提供的文档调用 `unzipSync`；ppt 只调 `zipSync`，不受影响（路线里写成两处都受影响，核对后只有前者） |
| 中 ×7、低 ×1 | `hono@4.12.32` | GHSA-8j4g-w8fx-2239、-f23p-vx2j-j53r、-54fx-42gc-7vw4、-gqvv-2mrq-wpjv、-g6gw-c38x-mqfc、-crvj-82cr-hjcx、-hxh3-vqpv-xpqv；低：-79qm-7rj5-m7r9（CORS、memo、Language 中间件、`toSSG`、`parseBody`、查询解析、JSX 转义、Proxy） | ≥4.13.7（最新 4.13.13；低危 ≥4.12.34） | alchemist 直接依赖，固定 `4.12.32`；同一份也是 `@modelcontextprotocol/sdk` 的传递依赖（`pnpm why` 只有一个 hono 版本） | 低：alchemist 只用 `Hono` 与 `streamSSE`（`plugins/native/alchemist/src/studio/server/`），我没有在 `plugins/native/alchemist/src` 和 `apps/local-host/src` 里找到 cors、jsx、`parseBody`、`toSSG`、`memo` 的使用（推断） |
| 中 ×2 | `vitest@4.1.10`、`@vitest/mocker@4.1.10` | GHSA-82fw-gwwq-j7x9：mock 重定向可读任意文件 | ≥4.1.11（dist-tag `V4`） | alchemist devDependency，固定 `4.1.10` | 仅开发与 CI 的测试运行 |
| 中 ×1 | `sprintf-js@1.0.3` | GHSA-hp3w-g68c-fv3c：精度说明符导致拒绝服务 | ≥1.1.4 | `mammoth@1.11.0`→`argparse@1.0.10`→`sprintf-js ~1.0.2`（范围锁死，覆盖不了） | 间接；`mammoth@1.13.0` 的依赖里已经没有 `argparse`（`npm view`），升 mammoth 就消掉 |

处理顺序（每步一片，跑相关测试；除第 1 步外都不碰业务代码）：

1. `@modelcontextprotocol/sdk`：范围 `^1.30.1` 已经允许 1.32.1，`pnpm update @modelcontextprotocol/sdk -r` 只改锁文件；跑 `tests/connector-mcp.test.ts` 与 `tests/action-mcp-stdio.test.ts`。**最先做**，因为它在真实路径上，且凭据外泄方向。
2. `fflate` 两处改 `0.8.3`；跑 `tests/ppt-actions.test.ts` 和 `tests/material-documents.test.ts`、`tests/context-onboarding-documents.test.ts`、`tests/pages-import-files.test.ts`（这几个文件引用了解析器/zip）。
3. `hono` 改 `4.13.13`（alchemist），`vitest` 改 `4.1.11`，跑 `pnpm --filter @molis-ai/molis-work-plugin-alchemist test`（CI 里本来就跑）。
4. `source-map-js`：`pnpm update source-map-js -r --depth Infinity` 看锁文件是否取到 1.2.2；取不到再在 `pnpm-workspace.yaml` 加 `overrides`。
5. `mammoth` 1.11.0→1.13.0（顺带去掉 `sprintf-js`/`argparse`），跑 `tests/material-documents.test.ts` 等上一条的几个用例；它是固定版本，行为变化要看输出。

**护栏缺口**（已核对）：CI 没有任何依赖审计步骤；`.github/` 下没有 `dependabot.yml`；GitHub 侧 `dependabot_security_updates` 是 `disabled`；`vulnerability-alerts` 接口回 204（开关是开的）但 Dependabot 告警在任何状态下都是 0 条，依赖图 SBOM 接口回 404，而 `pnpm audit` 报 14 条——所以 GitHub 的告警在这个仓库里不是可用的信号（原因我推断是依赖图没有开，未验证）。建议：先加一个只告警不挡合并的 CI 步骤 `pnpm audit --audit-level high`（现在会红，要等上面的第 1、4 步做完才能挡）；再加 `dependabot.yml` 管 `github-actions` 与 npm 两个生态；这两项要改仓库设置与 CI，归用户决定。

## 4. Prologue SDK 收敛方案

### 4.1 复核后的现状

| 项 | 路线记录（10-07 普查） | 本片核对（2026-10-08） |
| --- | --- | --- |
| 源分支有没有推到 Prologue 远端 | `README.md` 与 N-14：暂未推到 | **已推并合入**：`gh pr view` 显示 `molis-ai/prologue` 的 PR #3（`feat/molis-side-panel-surfaces-on-memory`→`main`，头 `9fc3b17386419625a36359b74fb4789c17a3adc8`，2026-09-30T19:14:36Z 合并，5 个提交）、PR #2（记忆平台，头 `9773d59a`）、PR #1（有界结果，头 `18a1c827`）都已合并；`git ls-remote` 远端只有 `refs/heads/main`（`4f7110fe`），特性分支合并后被删 |
| 现行 tgz 是否含 Molis 私有改动 | 「补丁打在 af7375c7 上」 | **不含**：见下面的复现 |
| README 里提到的提交是否在上游 main | 15 个是祖先 | README 引用了 25 个不同的 Prologue 提交号（另有 1 个 `d9fe0a5e` 是 Molis 自己的提交），24 个是 `origin/main` 的祖先；`21cdfbf8`（README 第 75 行引用的网络授权增量）本地克隆里没有这个对象，它只出现在已不依赖的老包的说明里 |
| 上游 main 比现行包多多少 | 24 个提交，20 个动 `packages/sdk` | 同：`git log 9fc3b173..origin/main` 24 个提交；`packages/sdk` 239 个文件、+30,300/−13,004 行（其中 `src` 167 个文件）；包的版本仍是 `0.0.0-rc.1` 且 `private: true`；仓库 0 个 tag、没有 CI 工作流、没有 LICENSE |

**复现记录**（本片在临时目录执行，没有改任何仓库）：

```
git -C ~/code/prologue archive 9fc3b173 | tar -x -C <临时目录>
cd <临时目录>
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @prologue/sdk build
cd packages/sdk && pnpm pack --out <绝对路径>/prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz
```

结果：打出 953,138 字节，SHA-256 `942de9c594d8fc0bbb81d3b36d766761427ff51c2c4cee33aab342033c85846c`，与 `vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz` 相同；两个包解开后 524 个文件逐文件相同。环境：macOS arm64、Node v24.14.0、pnpm 11.9.0（上游根 `package.json` 钉的也是这两个版本）。另外 `side-panel-memory.patch` 对 `af7375c7` 能干净应用，应用后的 `packages/sdk` 与 `9fc3b173` 的 `packages/sdk` 逐文件相同（差异只在 `docs/slices` 下三份文档，不在包内）。

所以现行 vendored 包的来源可以一句话写完：**上游 `molis-ai/prologue` 提交 `9fc3b173` 的 `packages/sdk`，无补丁，Node 24.14.0 + pnpm 11.9.0 构建**。

### 4.2 与 10-08 决定的对照

决定原文：源分支推到 Prologue 远端特性分支，按一个合成流程与负责人收敛到上游基线；删掉重建用不着的 25 个历史补丁并记 sha256 与来源；三个 tgz 改从私有 registry 或 release 附件取。

| 决定的部分 | 核对结果 | 本方案怎么做 |
| --- | --- | --- |
| 推源分支 | 已经推过并合入，没有东西可推 | **不推送。** 想要一个有名字的定位点，可以在 Prologue 给 `9fc3b173` 打一个 tag（需要用户同意，可选）；提交号本身已经在 `main` 历史里，足够定位 |
| 收敛到上游基线 | 现行包就是上游的一个提交 | 第一步只补来源记录；是否前进到更新的上游头是另一个有风险的动作，见 §4.4 的第 5 步 |
| 删 25 个历史补丁，记 sha256 与来源 | README 引用的 25 个 Prologue 提交号里 24 个在上游 main 里（§4.1） | 清单与 sha256 见 §4.5；**本片不删**。决定写的是 25 个；现行的 `side-panel-memory.patch`（225,092 字节，sha256 `1f64a15c…7c55`）按 §4.1 的复现也已不需要，建议同时删，要用户确认 |
| 私有包出仓库 | — | §5 |

### 4.3 一个合成流程、一个负责人

原则：**Molis 只依赖 `molis-ai/prologue` 的 `main` 上的一个具名提交，不依赖分支，不依赖补丁。** 合成包不再「叠补丁」，只有「构建某个上游提交」。

流程：

1. Molis 需要 SDK 的改动时，在 Prologue 开 PR 到 `main`，PR 里写清 Molis 哪个消费者要它；合并由负责人。
2. 合并后，负责人在 Prologue 的那个提交上执行 §4.1 的构建命令（以后写成 `scripts/build-prologue-sdk-pack.mjs`，参数是提交号，先检查它是 `origin/main` 的祖先），得到 tgz、字节数、SHA-256、sha512 完整性串。
3. 把 tgz 作为 release 附件上传到私有存放处（§5.3），同时更新 Molis 的 `vendor/packages.json`（提交号、sha256、附件位置）。
4. **一个 Molis PR 完成换包**：清单、`pnpm-lock.yaml`、`horizontal/agent-host` 的适配与测试（agent-host 是唯一依赖 SDK 的包），不夹别的改动。
5. 在途分支需要试用一个未合并的 SDK 时，用第二条清单项并标 `in_flight: true`，写明 Prologue 分支与提交；Molis 的 PR 合并前必须换成 `main` 上的提交。门禁（§4.4 第 4 步）检查清单里没有 `in_flight` 的项，才放行 main。

节奏：不自动前进。只在三种情况换包：Molis 功能需要上游的改动；安全修复（例如上游 `f40af26c`：记忆召回的正文当外来数据处理、伪造的系统标记要中和，现行包还没有这个提交）；负责人每月看一次落后提交数，决定要不要追。过去的漂移是这样的：`git log --diff-filter=A -- 'vendor/prologue-sdk/*.tgz'` 显示 9 月 19 日到 30 日新增 46 次（45 个不同文件名，9 月 23 日 13 个、26 日 15 个），9 月 30 日之后没有再加（路线 N-14 记的是 33 个，口径不同，以这次实测为准）。靠「一个 PR 一个包、旧包不留」止住。

负责人：**提议 @yijunw0212 为唯一的 SDK 合成负责人**（10-07 决定里该账号负责全部；Prologue 上游约 2000 个提交中 1710 个是该账号，Molis 里 `vendor/prologue-sdk` 的 63 个提交中 56 个是该账号），@jingxusandra-gif 作为 `horizontal/agent-host` 的共同评审（10-07 决定里该账号同时负责 Agent Host）。写进 CODEOWNERS 与 `docs/system/PARALLEL-DEVELOPMENT.md` 属于 W1-13，本片只提议，等用户确认。

### 4.4 执行顺序

| 步 | 做什么 | 要谁同意 / 依赖 | 风险 |
| --- | --- | --- | --- |
| 0 | 本片：固定 pnpm、写本方案（已完成） | — | — |
| 1 | `vendor/prologue-sdk/` 加 `provenance.json`（照 `vendor/intelligence-client/*.provenance.json` 的格式：包名、版本、上游仓库与完整提交 `9fc3b17386419625a36359b74fb4789c17a3adc8`、文件名、字节数、sha256、integrity、构建用的 Node 与 pnpm、日期）和 `.sha256`；README 改成「上游提交 + 构建命令」一段，删掉「暂未推到」；`specs/BACKLOG.md` 的 BL-024 关闭 | 不需要；属于 W1-23「vendored provenance and patch cleanup」 | 低，只加文件、改文字 |
| 2 | 做取包机制，文件仍在仓库里：`vendor/packages.json`、`scripts/fetch-vendored.mjs`、`.gitignore`、发布资产代码与测试的调整、CI 步骤（§5.3–§5.5）；取包脚本在文件已存在且校验通过时什么也不下载 | 不需要 | 低；CI 步骤此时是空操作 |
| 3 | 用户操作：建私有存放处、上传三个附件、建 GitHub App、配凭据（§5.4）；在一个删除了 tgz 的分支上跑 CI 证明能取到 | 用户 | 中；CI 凭据配置错会让所有 PR 红 |
| 4 | 删 tgz 与补丁，换门禁（`tooling/gates/limits.json` 的 `vendoredPrologueSdk` 改成「已跟踪的 `vendor/**/*.tgz`、`vendor/prologue-sdk/*.patch` 为 0」，`scripts/check-health-gates.mjs:65` 的判断与 `tests/health-gates-merge-base.test.ts:51,97` 的夹具同改），改 `AGENTS.md:29` 的硬约束、`README.md:138` 的上手步骤、`docs/platform/PROLOGUE-AI.md:14`、`skills/molis-prologue-ai/SKILL.md:33` | 用户确认「删除 vendored 文件」 | 中；`skills/` 在全量回归期间不能改（AGENTS.md） |
| 5 | 是否前进到更新的上游头：另起一片，先在分支上换包跑 agent-host 全部用例，再用真实模型（MiniMax）走侧栏浏览器与 Coding 各一遍；上游变化很大（见 §4.1 最后一行），没有版本号可约束 | 用户；Prologue 负责人 | 高；要单独评估，不属于本方案的必做项 |

### 4.5 25 个历史补丁清单（计划删除，本片不删）

位置 `vendor/prologue-sdk/`，合计 2,566,805 字节；Git 历史里仍可取回（本片实测：64 个提交动过 `vendor/`，main 可达的 `vendor/` 下 169 个 blob、62.6 MiB）。「README 行」是 `README.md` 里最先提到它的小节的行号（小节从新到旧排列，所以是最近一次用到它的那一节）。

| 补丁 | 字节 | 文件数 | SHA-256 | README 行 |
| --- | ---: | ---: | --- | --- |
| `assistant.patch` | 65,093 | 17 | `256d92254d179a2e1fe9caff85c1895b9ba8a4488d00f4e6c140d68af2e2294a` | L44 |
| `board-same-state.patch` | 78,764 | 36 | `91761254666c6a3c4330a4236d2dd4bd00c2feca3797ce48796ce3d0438a7b8e` | L254 |
| `bounded-inference.patch` | 155,672 | 49 | `7c76c342b0c05ba47d7b6a4f507d9ae26a8ffa4fdb6d5dfc6ad8bd9ac3de594a` | L168 |
| `bounded-results-assistant.patch` | 99,441 | 30 | `3ca3e60f3a9a11bc2bfd372dc3875a58976de579dacb029272f34625ffe65845` | L44 |
| `bounded-results.patch` | 48,451 | 20 | `d5fb9392f14fad2c70d0c25d7ab8aa172c6c61f05ae81e150f8bc674241dfae3` | L83 |
| `cache-breakpoint.patch` | 247,275 | 74 | `67080d78dc1dc1638413234c1eb41b94d1b6d83cfa45bc2516d1fa8a70c1ff51` | L155 |
| `character-precheck.patch` | 87,269 | 40 | `dfca57cb8ab04f00d5c4d11157be2370499083a56cdaa53909d98c1d1c36478a` | L224 |
| `claims.patch` | 458,308 | 93 | `9248c7fdb87f650749d623b4ba64c93df595e05c94b3345793220bb54f176471` | L108 |
| `coding-inference.patch` | 240,972 | 72 | `8a2c2cb6b1c2380641d0286ed870687d6879a8f21ae4f04f0a1a6df5ef27966c` | L168 |
| `dispatch-denied.patch` | 10,191 | 4 | `5d425a16c2d0d4b112759e3fb63688f70ae8132027cc4e3d25b76bdc6cf38308` | L94 |
| `dispatch-key.patch` | 39,459 | 20 | `11cbafb86473bfb7b6ba77f350c8788c3b2952e3802dde7bff9622a9262fb944` | L346 |
| `file-mode.patch` | 43,090 | 22 | `28bf633436ca2ff2078a41f2768a6433169ca074ddd4b5768d9e723bcba5036d` | L329 |
| `large-read.patch` | 75,886 | 34 | `cebaa6cc540245c473b554afee480728cde58d34c403a4c386b83f3a01c5cd1f` | L269 |
| `ledger-status.patch` | 257,429 | 77 | `32121cd6f32bba0d3349e943f0077ab9bab60849a3f3143d172b8bc97f7fb8d8` | L141 |
| `memory-project.patch` | 3,363 | 2 | `64fbe525bc7428aa506e51c2504948dab35f1e7d64da9a1da8f25cd07dcf7e29` | L24 |
| `model-loopback.patch` | 21,154 | 12 | `f6a1c161b6f8a8a7dde0b0dce06c03fadb976740cb22fcfb0f1e12277ce88722` | L361 |
| `network-dispatch.patch` | 22,204 | 8 | `1698fe484443bcb07016fac87952b8d627b7dad1b63e328894094201a4072884` | L83 |
| `output-continuation.patch` | 34,225 | 17 | `8b5acc173ce76f1dc5ee11be1ef8c665ea4600b8d28dd593b10ed0a355cef2ae` | L361 |
| `parent-reads.patch` | 109,089 | 44 | `af374ba71bc14bc01b7f45a61b89948fcda1d7ea1d0b25c119b0e84f04e03e68` | L168 |
| `resource-intake.patch` | 122,692 | 37 | `6ad3f649ffbfba5733f29d80c7aa130913adf4471a8cba7908c77b4b799b89dc` | L24 |
| `role-tools.patch` | 91,553 | 41 | `67a3aa642d2ae3998aa7f8dddcb35d0496a81702adc4e6107d4b8c7b928fef44` | L209 |
| `search-file.patch` | 50,975 | 28 | `ce563d89dc0bab3268da2216652c580fc7dca750b593ccfd5d36f063a1bfe88e` | L314 |
| `search-large.patch` | 61,930 | 30 | `a6591f0a0072365d4f0c2ddb7033655913319f85977c65bff499a970e733767a` | L284 |
| `search-scope.patch` | 58,103 | 30 | `74148e65fb4de7c8ccb86157adeeea6858f5bd4569aca01242065f19bf5b3c6c` | L299 |
| `subagent-close.patch` | 84,217 | 39 | `4cfffc68f5a744a0f18c36e0d1ac903dc1a5571dc85af78ba28681941b4d82b9` | L239 |

「文件数」是补丁里 `diff --git` 的条数。不在清单里的第 26 个是 `side-panel-memory.patch`（225,092 字节，48 个文件，`1f64a15ce9d5d90d0f4ace90211c147efdea189d225c9236fc138438e86c7c55`），见 §4.2。四份文档在 vendor 目录之外引用了补丁文件名（其中 `claims.patch` 是 Markdown 链接），删除时要同改，否则链接断或说法过期：`specs/coding-plugin/spec.md`（`claims.patch` 的链接；`dispatch-key.patch` 的文字）、`specs/action-architecture/migration.md` 与 `specs/action-architecture/spec.md`（`model-loopback.patch`）、`specs/archive/system-assistant/implementation.md`（`memory-project.patch`）。

## 5. 私有包不再随公开仓库发放

### 5.1 现状

| 包 | 版本、大小 | 在哪声明（`file:` 依赖） | 来源与许可 |
| --- | --- | --- | --- |
| `@prologue/sdk` | 0.0.0-rc.1，953,138 字节 | `horizontal/agent-host/package.json:29` | 私有仓库 `molis-ai/prologue`（`gh repo view` 显示 PRIVATE），`private: true`，没有 LICENSE |
| `@adeptify/intelligence-client` | 0.2.2，86,017 字节 | 根 `package.json:70`、`apps/local-host/package.json:35`、`plugins/native/feed/package.json:33` | `provenance.json`：MIT，提交 `1f6babba…` 出自 `github.com/adeptify/trick-catalog`（这个账号解析不到） |
| `@adeptify/search-evidence-layer` | 0.4.1，268,243 字节 | 根 `package.json:71`、`apps/local-host/package.json:36`、`packages/storage/package.json:30`、`plugins/native/feed/package.json:32`、`plugins/official-integrations/rss/package.json:35` | 同上，提交 `149a69e2…`，MIT |

锁文件对三者都记了 `resolution: {integrity: sha512-…, tarball: file:vendor/…}`（`pnpm-lock.yaml:1308-1320`、`:1584`），`pnpm-workspace.yaml:26-29` 的 `minimumReleaseAgeExclude` 放行这三个精确版本。我在临时目录做了实验：pnpm 11.9.0 对 `file:` tgz 会校验锁文件里的 sha512，换了内容的文件报 `ERR_PNPM_TARBALL_INTEGRITY`，文件缺失直接读取失败——所以「文件不进 Git、安装前再取回来」时，取回来的字节必须与锁文件一致，pnpm 自己会拦。

**仓库里还有什么东西会随发布带走这些文件**（读代码和测试得出）：

- `apps/local-host/src/installer/release-assets.ts:15-30`：发布资产里 `vendor/` 下除 `prologue-sdk` 目录里的 `*.tgz` 之外的**全部**文件都带走，包括 26 个补丁、`README.md`，以及另外两个包的 tgz；`apps/local-host/src/installer/package-release-files.ts:35` 在 npm 包也走同一个函数。`tests/release-assets.test.ts:10-46` 断言补丁与 `vendor/other/current.tgz` 会被复制，`tests/runtime-payload.test.ts:21-36` 断言桌面运行时载荷里有两个 adeptify tgz 且字节与 `provenance.json` 的 sha256 相同，`tests/npm-package.test.ts:37-41` 断言 npm 包里有 `vendor/prologue-sdk/README.md` 且没有 prologue 的 tgz。
- 根 `package.json:24` 的 `files` 含 `vendor`。
- `.github/workflows/release-macos.yml` 的 `release` 作业把 DMG 发到公开仓库的 GitHub Release（`softprops/action-gh-release`；工作流现在只能手动触发，文件里写着 Temporarily manual-only）；DMG 里是否含 SDK 的编译产物，文档只写了「正式 workspace 运行依赖」（`docs/cli-and-development.md:188`），我没有打开 DMG 核对（推断：含）。npm 包含 `@prologue/sdk` 是确定的（`tests/npm-package.test.ts:39-40`）。

### 5.2 方案比较

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **A 私有仓库 release 附件（推荐）** | SDK 包作为 `molis-ai/prologue` 某个 release 的附件，两个 adeptify 包放在一个新的私有仓库的 release 里；Molis 仓库留清单（包名、版本、sha256、附件位置、来源提交）和取包脚本；`package.json` 的 `file:` 依赖与锁文件**一个字都不用改** | 不改任何包名与 import；锁文件完整性、`minimumReleaseAgeExclude` 现状继续有效；不需要运行任何服务；一个令牌就能读 | 每个新工作树、每台开发机、每个 CI 作业都要有取包这一步；离线首次安装做不到（已装过的可以离线） |
| B GitHub Packages 的 npm 仓库 | 发布成 npm 包，`.npmrc` 写 `@prologue:registry=…` | 依赖写法变成普通版本号 | **做不到不改名**：官方文档写明包名的作用域必须等于所属用户或组织（`@NAMESPACE/PACKAGE-NAME`），`molis-ai` 组织下只能发 `@molis-ai/*`；`@prologue/sdk` 与 `@adeptify/*` 要改名，涉及上述 9 条声明和约 43 个文件里的 import（`@prologue/sdk`：`horizontal/agent-host/src` 21 个、测试 6 个；`@adeptify/*`：16 个 `.ts/.mts` 文件）；且 pnpm 11 的发布时间复验会按包名访问 registry（`docs/molis-work-bug-cards.md` 第 47 行记录过 404），每台机器都要有 `.npmrc` 令牌 |
| C 自管或第三方私有 registry | Verdaccio、Artifactory 之类，保留原包名 | 依赖写法最普通 | 要运维一个服务、每台机器与 CI 都要令牌、费用；对 3 个包 1.3 MB 不值 |

推荐 A。如果以后 Prologue 变成有版本号、多个消费者的产品，再换 C，A 的清单可以直接变成 registry 的依赖。

### 5.3 推荐方案的具体样子

1. **存放处**（用户建）：SDK 包放在 `molis-ai/prologue` 的 release（tag 用 `molis-sdk-<提交前 8 位>`，例如 `molis-sdk-9fc3b173`，附件就是现在这个 tgz，字节完全相同）；两个 adeptify 包放在一个新建的私有仓库（名字提议 `molis-ai/molis-work-vendor`）的 release 里，附件即当前两个 tgz。三个附件的 sha256 就是 §5.1 表和 `vendor/*/*.sha256`、`provenance.json` 里已有的值。
2. **仓库里留什么**：`vendor/packages.json`（新）每个包一项：`name`、`version`、`file`（`file:` 依赖指向的原路径，不变）、`bytes`、`sha256`、`source`（仓库+完整提交）、`fetch`（仓库、tag、附件名）；现有的 `provenance.json`、`sbom.cdx.json`、`.sha256` 保留（它们是 MIT 包的来源与许可记录，且被 `tests/runtime-payload.test.ts` 读取）；`vendor/prologue-sdk/` 里补 `provenance.json`。tgz 与 `*.patch` 不再跟踪，`.gitignore` 加 `vendor/**/*.tgz`。
3. **`scripts/fetch-vendored.mjs`**（新，约 80 行，本片未写）：读 `packages.json`；目标文件已存在且 sha256 对 → 跳过；否则优先用本机缓存 `~/.cache/molis-work/vendor/<sha256>.tgz`（开发机上有四十多个工作树，不要每个都联网取），没有再用 `gh release download <tag> --repo <仓库> --pattern <附件>`（开发者用自己的 `gh auth`，CI 用 `GH_TOKEN`），下载后校验 sha256，不对就删掉并报错，错误信息写明缺的是哪个包、需要读哪个仓库的权限。`--check` 只校验不联网，给门禁与本机自检用。`package.json` 加一个 `vendor:fetch` 脚本；`scripts/start.mjs:432` 的安装步骤和 `README.md:138` 的上手步骤在 `pnpm install` 前先调它。
4. **不改**：9 条 `file:` 声明、锁文件、`pnpm-workspace.yaml` 的放行名单、`horizontal/agent-host` 是唯一依赖 SDK 的包这条约束。

### 5.4 CI 凭据

事实：`ci.yml` 顶层 `permissions: contents: read`，触发是 `pull_request`、`push` 到 `main` 和手动；`release-macos.yml` 只有手动触发，`permissions: contents: write`；仓库设置是 `allowed_actions: all`、不强制 SHA 固定；仓库本身是公开的、允许 fork；`gh secret list --repo molis-ai/molis-work` 没有输出（无密钥，或者我没有查看权限，未验证）；组织 `molis-ai` 是免费计划。

- 工作流自带的 `GITHUB_TOKEN` 只能访问当前仓库，读不了 `molis-ai/prologue` 和 vendor 仓库的 release，所以需要单独的凭据（推断，GitHub 令牌作用域的通行规则）。
- **推荐：一个组织拥有的 GitHub App**，名字提议 `molis-work-ci-vendor`，权限只给 Repository → Contents: Read-only（Metadata 默认只读），只安装到 `molis-ai/prologue` 和 `molis-ai/molis-work-vendor` 两个仓库。在 `molis-work` 仓库配置：变量 `VENDOR_APP_ID`、密钥 `VENDOR_APP_PRIVATE_KEY`。工作流在「Install dependencies」前加两步：用 `actions/create-github-app-token`（最新版本是 v3.2.0，我用 `gh api` 查到；固定到提交 SHA）按 `owner: molis-ai`、`repositories: prologue,molis-work-vendor` 换出一小时有效的令牌，再 `node scripts/fetch-vendored.mjs`，把令牌放进该步的 `GH_TOKEN`。令牌用完即失效，不绑任何人。
- 备选：细粒度个人令牌（所有者选 `molis-ai`、只选这两个仓库、Contents 只读、设过期日），放在密钥 `VENDOR_READ_TOKEN`。配置最快，但绑在个人账号上，人走令牌就失效，组织如果要求审批还要审批。
- **两份工作流都要加**：`ci.yml` 的 `architecture-boundaries` 作业（`:39` 之前）与 `release-macos.yml` 的 `build` 作业（`:41` 之前，矩阵里 arm64 与 x64 两个运行器都要）。`verify` 作业不安装依赖，不用加。令牌不要写进日志；取包脚本不打印令牌，不以 `set -x` 运行。
- **来自 fork 的 PR 拿不到密钥**，取包会失败，CI 在这些 PR 上会红。仓库的分支都在仓库内（路线记录已合并的 147 条远端分支），目前没有外部贡献者；接受这个后果并在 `README.md` 写明「外部贡献需要维护者读权限，或由维护者把分支推到仓库内」。**不要用 `pull_request_target` 去绕过**，那会把密钥交给 fork 的代码。
- 本机：开发者用自己的 `gh auth login`，需要是 `molis-ai` 成员且对两个私有仓库有读权限；已取到的文件留在 `vendor/` 与缓存里，离线可用。
- 缓存：作业里用 `actions/cache`，键是 `hashFiles('vendor/packages.json')`，路径是缓存目录，省掉重复下载。

### 5.5 取包机制上线前必须同改的代码与测试

均已核对存在：

- `apps/local-host/src/installer/release-assets.ts:15-30`：现在会把 `vendor/` 下的 tgz（prologue-sdk 目录除外）复制进发布载荷；tgz 取回到 `vendor/` 之后，这个函数要改成**所有** `*.tgz` 与 `*.patch` 都不进载荷，只带清单、`provenance.json`、`sbom.cdx.json`、`.sha256`、许可文本。对应改 `tests/release-assets.test.ts:10-46`、`tests/install.test.ts:753`（装完的 release 目录里没有 `historical.tgz`）、`tests/npm-package.test.ts:37-41`。
- `tests/runtime-payload.test.ts:21-36` 现在要求载荷里有两个 adeptify tgz，字节与 `provenance.json` 一致；MIT 包随产品分发时是否继续附原始包，要和 §7 第 2 条一起定，定了再改这个测试。
- `tests/npm-distribution-smoke.mjs:88-89` 读 `vendor/intelligence-client/sbom.cdx.json`，保留。
- `scripts/check-health-gates.mjs:65, 274-284`、`tooling/gates/limits.json`、`tests/health-gates-merge-base.test.ts:51, 97`：见 §4.4 第 4 步。
- 所有在新工作树里装依赖的地方（`AGENTS.md`「构建与测试」第一条、`README.md:138`、`scripts/start.mjs:432`、两份工作流）要在 `pnpm install` 前取包。

### 5.6 顺序与回退

顺序见 §4.4 的第 2、3、4 步；要点：**先让取包机制能用、再删文件**。第 4 步之前，仓库行为和现在完全一样，任何一步出问题都可以只回退那一个 PR。第 4 步之后如果取包源不可用，所有 CI 与新工作树都装不了依赖——所以第 3 步要在一个真删了 tgz 的分支上跑通 CI，再合第 4 步；两个 adeptify 包和 SDK 包同时放一份到另一个位置（例如用户本机的备份目录）作为兜底。

## 6. 这份方案没有动的东西

没有推送，没有删除任何 vendored 文件，没有改依赖版本，没有改源码与测试；`pnpm-lock.yaml` 没变。改动只有：根 `package.json` 加一个字段、两份工作流的「Install pnpm」一步、`spec.md` 里一行指针、本文。

## 7. 需要用户决定或操作的事项

1. **Git 历史**：把 tgz 和补丁从树里删掉，历史里还在（64 个提交动过 `vendor/`，main 可达的 `vendor/` blob 169 个、62.6 MiB，其中包含 Prologue 的源码补丁），公开仓库任何人都能取。10-08 的决定里「不改历史」只写在截图与根目录材料那一行。如果目的是不让外人拿到 Prologue 的代码，只有重写历史（`git filter-repo` 加强制推送，所有克隆、fork、PR 引用都要处理）才做得到，这是单独的、破坏性的决定，我没有做也没有假设。
2. **已经发出去的二进制**：GitHub Release 上的 DMG 和 npm 包里带的是编译后的 `@prologue/sdk`（npm 包确定含；DMG 推断含）。把 tgz 移出源码树不改变这一点。Prologue 仓库没有 LICENSE、包标着 `private: true`，对外分发它的编译产物是否允许，需要 Prologue 的负责人定；这也决定 §5.5 里 adeptify MIT 包要不要继续随载荷附原始 tgz。
3. 「删除 vendored 文件」（§4.4 第 4 步）要用户同意后才执行；同时请定要不要连 `side-panel-memory.patch` 一起删（§4.2）。
4. 建私有存放处、上传三个附件、建 GitHub App 并配密钥（§5.4）：都是用户的操作。
5. 确认 SDK 合成负责人（§4.3 的提议）。
6. 在 Prologue 给 `9fc3b173` 打 tag：可选，需要用户同意（推送到上游）。
7. 依赖升级的批次（§3.4 的 1–5 步）和 CI 里加依赖审计、`dependabot.yml`、仓库设置（§3.4 末尾）：升级属于代码改动，可以直接分片做；仓库设置归用户。

## 8. 未验证的范围

- GitHub Actions 上的真实运行（取版本的那一步、将来的取包步骤）。
- DMG 内容是否含 SDK 编译产物。
- 依赖图为什么没有生成告警。
- 升级后（§3.4）各条公告的实际消除，要升级后再跑 `pnpm audit`。
- `@types/sanitize-html` 升到 2.16.2 后是否还拉旧 `htmlparser2`。
- 重复声明改成 catalog 后锁文件的变化。
- 脚本只认静态引用；动态拼接的包名、配置文件里的包名不在扫描内（§3.1 已逐条人工补了三处）。

## 附：本片用到的命令

```
pnpm install --frozen-lockfile --offline          # 退出 0，锁文件不变
pnpm audit --json                                  # 336 个依赖：2 高 11 中 1 低
pnpm outdated -r --format json                     # 25 个落后，5 个主版本
pnpm why -r <包> --depth 6                         # 重复版本与 hono 的来源
node <临时脚本>                                     # 扫 import/require：未使用与未声明（不入库）
git -C ~/code/prologue merge-base --is-ancestor <提交> origin/main
gh pr list --repo molis-ai/prologue --state all    # PR #1 #2 #3 均已合并
git ls-remote --heads --tags origin                # 在 ~/code/prologue 里：只有 main
shasum -a 256 vendor/prologue-sdk/*.patch vendor/**/*.tgz
```
