# 依赖清单与 Prologue SDK 收敛方案（W1-20，§4.17）

状态：方案与清单（2026-10-08；数量量于 main 35d7f320，行号已按合并 origin/main cad49419 之后的树复核；两者之间依赖声明与锁文件没有变化，只多了根 `package.json` 的 `secrets:check` 脚本与 CI 的 `secret-scan` 作业）；已落实的有根 `packageManager` 与 CI 读它（W1-20），以及 §4.4 第 1 步（W1-23，分支 `chore/repo-hygiene`：`vendor/prologue-sdk/` 的 `.sha256`、`.provenance.json`、`patch-history.json`，25 份历史补丁已删，README 与 BL-024 已改）；推送无从做起（§4.1：早已合入上游）；删除 tgz 与 `side-panel-memory.patch`、改依赖版本都没有做，等用户确认后按 §4.4 的顺序分片执行

来源：路线 [roadmap-2026-10-07.md](roadmap-2026-10-07.md) §4.17 与 N-14、N-02；用户决定见 [spec.md](spec.md) §1 的「2026-10-08 Prologue SDK 收敛与私有包」一行（`spec.md:119`，已在 main）。本文每条结论后面写了证据：代码路径、命令或外部记录；没有核对的写「未验证」，从代码读出来但没有运行的写「推断」。

## 1. 摘要

1. **pnpm 已固定**：根 `package.json` 加了 `"packageManager": "pnpm@11.9.0"`，CI 与发布工作流改成从这个字段取版本，不再各写一个数字；`pnpm install --frozen-lockfile --offline` 在新建的工作树里 3.8 秒通过，`pnpm-lock.yaml` 没有变化（§2）。Node 只是方案，没有改（§2.2）。
2. **第三方依赖**：没有真正没用的依赖；重复集中在 11 个多版本传递包和几处声明漂移；`pnpm audit` 有 2 高、11 中、1 低，**全部有已发布的修复版本**，其中一条高危落在代码真用的路径上（§3）。
3. **Prologue 的 SDK 比 README 写的好收敛得多**，有三件事和 10-08 弹窗时的前提不一样（§4.1）：
   - 源分支 `feat/molis-side-panel-surfaces-on-memory` **早已推到 Prologue 远端并合入**（PR #3，2026-09-30），远端现在只有 `main`，没有特性分支可推；`vendor/prologue-sdk/README.md` 里「暂未推到 prologue 远端」与 `specs/BACKLOG.md` 的 BL-024 都是过期的（W1-23 已改正 README、关闭 BL-024）；
   - 现行 vendored 包**不需要任何补丁**：用上游提交 `9fc3b173` 的 `packages/sdk` 直接构建，打出的 tgz 与仓库里的逐字节相同（SHA-256 `942de9c5…846c`）；
   - 因此 25 个历史补丁，连同现行的 `side-panel-memory.patch`，重建都用不着（§4.5 给出 25 个的清单，每个带 sha256、基线、来源和产出的包；W1-20 只列清单，W1-23 把清单落成 `patch-history.json` 并删掉了这 25 份，`side-panel-memory.patch` 留到用户确认）。
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

- 验证：在新建工作树（origin/main 35d7f320）加字段后执行 `pnpm install --frozen-lockfile --offline`，退出码 0，输出「Lockfile is up to date」「Done in 3.8s using pnpm v11.9.0」，`git status` 只有 `package.json` 与两份工作流有改动，锁文件没变。合并 origin/main（f8ea20b9，随后 cad49419）后在本分支又跑了一次：退出码 0，「Lockfile is up to date」，锁文件仍没变。工作流里那条 shell 命令我在本机原样执行过，输出 `pnpm@11.9.0`；两份 YAML 用 PyYAML 解析通过。GitHub Actions 上的真实运行没有做（未验证）：`ci.yml` 的改动会由本分支 PR 自己的 CI 跑到；`release-macos.yml` 现在只能手动触发（`.github/workflows/release-macos.yml:5` 只有 `workflow_dispatch`），没有 PR 会运行它，它的改动只在本机验证过那条表达式。合并 origin/main 后新增的 `secret-scan` 作业（`ci.yml:99`）不装 pnpm，不受影响。
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
| 中 ×7、低 ×1 | `hono@4.12.32` | GHSA-8j4g-w8fx-2239、-f23p-vx2j-j53r、-54fx-42gc-7vw4、-gqvv-2mrq-wpjv、-g6gw-c38x-mqfc、-crvj-82cr-hjcx、-hxh3-vqpv-xpqv；低：-79qm-7rj5-m7r9（CORS、memo、Language 中间件、`toSSG`、`parseBody`、查询解析、JSX 转义、Proxy） | ≥4.13.7（最新 4.13.13；低危 ≥4.12.34） | alchemist 直接依赖，固定 `4.12.32`（`plugins/native/alchemist/package.json:34`）；同一份也是 `@modelcontextprotocol/sdk` 的传递依赖：SDK 声明 `hono: ^4.11.4`（最新的 1.32.1 同样），锁文件里 SDK 与 `@hono/node-server@2.1.1` 都解析到 `4.12.32`（`pnpm-lock.yaml:2933`、`:2949`；`pnpm why -r hono` 只有这一个版本） | 低：alchemist 只用 `Hono` 与 `streamSSE`（`plugins/native/alchemist/src/studio/server/`），我没有在 `plugins/native/alchemist/src` 和 `apps/local-host/src` 里找到 cors、jsx、`parseBody`、`toSSG`、`memo` 的使用（推断）；经 MCP SDK 的那条路：SDK 里只有 `server/streamableHttp.js` 用 hono（在已安装的 `dist/esm` 里搜过），产品代码只引入 SDK 的客户端、stdio 与 `server/index.js`，`server/streamableHttp.js` 只在 `tests/connector-mcp.test.ts:11` 引入（`git grep`） |
| 中 ×2 | `vitest@4.1.10`、`@vitest/mocker@4.1.10` | GHSA-82fw-gwwq-j7x9：mock 重定向可读任意文件 | ≥4.1.11（dist-tag `V4`） | alchemist devDependency，固定 `4.1.10` | 仅开发与 CI 的测试运行 |
| 中 ×1 | `sprintf-js@1.0.3` | GHSA-hp3w-g68c-fv3c：精度说明符导致拒绝服务 | ≥1.1.4 | `mammoth@1.11.0`→`argparse@1.0.10`→`sprintf-js ~1.0.2`（范围锁死，覆盖不了） | 间接；`mammoth@1.13.0` 的依赖里已经没有 `argparse`（`npm view`），升 mammoth 就消掉 |

处理顺序（每步一片，跑相关测试；除第 1 步外都不碰业务代码）：

1. `@modelcontextprotocol/sdk`：范围 `^1.30.1` 已经允许 1.32.1，`pnpm update @modelcontextprotocol/sdk -r` 只改锁文件；跑 `tests/connector-mcp.test.ts` 与 `tests/action-mcp-stdio.test.ts`。**最先做**，因为它在真实路径上，且凭据外泄方向。
2. `fflate` 两处改 `0.8.3`；跑 `tests/ppt-actions.test.ts` 和 `tests/material-documents.test.ts`、`tests/context-onboarding-documents.test.ts`、`tests/pages-import-files.test.ts`（这几个文件引用了解析器/zip）。
3. `hono`：alchemist 的固定版本改 `4.13.13`，**同时**执行 `pnpm update hono -r --depth Infinity`。只改 alchemist 的话，锁文件里 `@modelcontextprotocol/sdk` 与 `@hono/node-server` 这条路径会留在 `4.12.32`（它们的范围 `^4.11.4`、`^4` 允许 4.13.x，但锁文件不会自己前进），审计仍然红；做完用 `pnpm why -r hono` 确认只剩一个 ≥4.13.7 的版本，再跑 `pnpm audit`（这条更新的实际效果未验证，做的时候才知道）。`vitest` 改 `4.1.11`。跑 `pnpm --filter @molis-ai/molis-work-plugin-alchemist test`（CI 里本来就跑）。
4. `source-map-js`：`pnpm update source-map-js -r --depth Infinity` 看锁文件是否取到 1.2.2；取不到再在 `pnpm-workspace.yaml` 加 `overrides`。
5. `mammoth` 1.11.0→1.13.0（顺带去掉 `sprintf-js`/`argparse`），跑 `tests/material-documents.test.ts` 等上一条的几个用例；它是固定版本，行为变化要看输出。

**护栏缺口**（已核对）：CI 没有任何依赖审计步骤；`.github/` 下没有 `dependabot.yml`；GitHub 侧 `dependabot_security_updates` 是 `disabled`；`vulnerability-alerts` 接口回 204（开关是开的）但 Dependabot 告警在任何状态下都是 0 条，依赖图 SBOM 接口回 404，而 `pnpm audit` 报 14 条——所以 GitHub 的告警在这个仓库里不是可用的信号（原因我推断是依赖图没有开，未验证）。建议：先加一个只告警不挡合并的 CI 步骤 `pnpm audit --audit-level high`（现在会红，要等上面的第 1、4 步做完才能挡）；再加 `dependabot.yml` 管 `github-actions` 与 npm 两个生态（npm 生态要先解决 §5.4 的 Dependabot 密钥问题，否则 §5.3 的取包上线后每个 Dependabot PR 都会在取包一步红）；这两项要改仓库设置与 CI，归用户决定。

### 3.5 W2-18 之后新增的第三方依赖（2026-10-09）

W2-18 待决 11（用户定：固定版本并收窄环境）把飞书/Lark MCP 连接器原来用 `npx -y @larksuiteoapi/lark-mcp` 临时下载的包，改成 `apps/local-host` 的精确依赖 `@larksuiteoapi/lark-mcp@0.5.1`，由 `pnpm-lock.yaml` 管（它此前不在清单里，因为清单只查声明过的包，运行时 `npx` 拉的包没有声明）。Host 用自己的 Node 运行包里的 `dist/cli.js`（`apps/local-host/src/lark-mcp-launch.ts`），子进程只拿到 App ID、App Secret、令牌、已设置的代理与证书变量，加 MCP SDK 默认的 `HOME`、`PATH` 这类基本变量。

- 锁文件只增不改：+62 个包（`axios`、`proxy-agent` 一串、`protobufjs`、`keytar`、`open`、`@larksuiteoapi/node-sdk` 等），原有包的版本没有变；`pnpm audit` 的依赖数从 336 到 398。
- `pnpm-workspace.yaml` 的 `allowBuilds` 里 `keytar: false`、`protobufjs: false`：pnpm 11 对没有表态的构建脚本直接报错。`keytar` 是原生模块，`lark-mcp` 的 `mcp` 模式只在它自己的「保存登录」路径上才加载它（Molis Work 用环境变量传令牌，不走这条），不构建时子进程启动会在标准错误里打一行 `Failed to initialize encryption` 的警告，功能不受影响（`tests/lark-mcp-launch.test.ts` 真的启动了这个包并列出了工具）；`protobufjs` 的 postinstall 只打印一条命令行提示。
- **审计新增 1 条高危**：`basic-ftp <=6.2.0`（GHSA-c475-qrg2-pj4r，Client.list() 的解析器二次方耗时），进入路径 `lark-mcp → proxy-agent → pac-proxy-agent → get-uri → basic-ftp@5.3.1`。`get-uri` 声明 `^5.3.1`，修复版本 ≥6.2.1 是另一个主版本，所以没有加 `overrides`。可达性：只有代理配置成指向 FTP 上的 PAC 文件时才会走到 FTP 客户端，连接器不设置这种代理，我判断走不到（推断，没有运行验证）。要不要用 `overrides` 强升到 6.x 由用户定。

## 4. Prologue SDK 收敛方案

### 4.1 复核后的现状

| 项 | 路线记录（10-07 普查） | 本片核对（2026-10-08） |
| --- | --- | --- |
| 源分支有没有推到 Prologue 远端 | `README.md` 与 N-14：暂未推到 | **已推并合入**：`gh pr view` 显示 `molis-ai/prologue` 的 PR #3（`feat/molis-side-panel-surfaces-on-memory`→`main`，头 `9fc3b17386419625a36359b74fb4789c17a3adc8`，2026-09-30T19:14:36Z 合并，5 个提交）、PR #2（记忆平台，头 `9773d59a`）、PR #1（有界结果，头 `18a1c827`）都已合并；`git ls-remote` 远端只有 `refs/heads/main`（`4f7110fe`），特性分支合并后被删 |
| 现行 tgz 是否含 Molis 私有改动 | 「补丁打在 af7375c7 上」 | **不含**：见下面的复现 |
| README 里提到的提交是否在上游 main | 15 个是祖先 | README 引用了 25 个不同的 Prologue 提交号，**全部**是 `origin/main`（`4f7110fe`）的祖先（逐个 `git merge-base --is-ancestor`）。另外两个提交号是 Molis 仓库的，不是 Prologue 的：`21cdfbf8`（Molis PR #95 的合并提交，2026-09-29；README 第 75、87 行写的「main」指 Molis main，它带来了 `network-dispatch.patch`）与 `d9fe0a5e`（Molis PR #91 的合并提交，2026-09-28，README 里用作取旧包的例子） |
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

决定原文：源分支推到 Prologue 远端特性分支，按一个合成流程与负责人收敛到上游基线；删掉重建用不着的 25 个历史补丁并记 sha256 与来源；三个 tgz 改从私有 registry 或 release 附件取，不再放进公开仓库（CI 需配私有源凭据）。

| 决定的部分 | 核对结果 | 本方案怎么做 |
| --- | --- | --- |
| 推源分支 | 已经推过并合入，没有东西可推 | **不推送。** 想要一个有名字的定位点，可以在 Prologue 给 `9fc3b173` 打一个 tag（需要用户同意，可选）；提交号本身已经在 `main` 历史里，足够定位 |
| 收敛到上游基线 | 现行包就是上游的一个提交 | 第一步只补来源记录；是否前进到更新的上游头是另一个有风险的动作，见 §4.4 的第 5 步 |
| 删 25 个历史补丁，记 sha256 与来源 | README 引用的 25 个 Prologue 提交号全部在上游 main 里（§4.1）；每个补丁的基线、来源和产出的包见 §4.5 | 清单与 sha256 见 §4.5；**W1-20 不删**，W1-23 删（见 §4.4 第 1 步）。决定写的是 25 个；现行的 `side-panel-memory.patch`（225,092 字节，sha256 `1f64a15c…7c55`）按 §4.1 的复现也已不需要，建议同时删，要用户确认 |
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
| 1 | **已由 W1-23 做完（分支 `chore/repo-hygiene`）**：`vendor/prologue-sdk/` 加了 `prologue-sdk-0.0.0-rc.1-side-panel-memory.tgz.provenance.json` 与 `.sha256`（文件名和格式照 `vendor/intelligence-client/` 的同类文件：包名、版本、上游仓库与完整提交 `9fc3b17386419625a36359b74fb4789c17a3adc8`、文件名、字节数、sha256、integrity、构建用的 Node 与 pnpm、日期；另记 2026-10-08 在 macOS arm64、Node 24.14.0、pnpm 11.9.0 上从该提交无补丁重建出逐字节相同的包）；§4.5 的三张表落成 `vendor/prologue-sdk/patch-history.json`（每个补丁的字节数、SHA-256、git blob、基线、来源、产出的包的字节数、SHA-256、git blob，另加 9 个没有补丁的历史包；数字由脚本与补丁实际字节、Git 历史里的 tgz 核对过，7 份有提交的补丁重新 `git apply` 后与提交的树逐文件相同，18 份能干净应用在所写的基线上，记到的 19 个 Prologue 提交都是上游 main 头 `4f7110fe` 的祖先）；25 份补丁和记录在同一个 PR 里一起进 main（PR 内的提交怎么分不作保证：补丁先删、记录在后一个提交里；PR 以合并提交进入，main 上不会有只删了补丁、还没有记录的状态）；README 缩成「上游提交 + 重建步骤 + 记录说明」，删了「暂未推到」和各历史小节（README 文件本身留着：`skills/molis-prologue-ai/SKILL.md:33`、`specs/coding-plugin/spec.md`（:1345、:2507）引用它）；`specs/BACKLOG.md` 的 BL-024 关闭。新增 `scripts/gates/vendored-provenance.mjs`（接进 `pnpm health:check`）核对三个 vendored 包的 tgz 与各自的 `.sha256`、`.provenance.json` 相符、包换掉后记录不留、`patch-history.json` 格式、已记为删除的补丁不回到目录里，`tests/vendor-provenance.test.ts` 逐条破坏验证。`side-panel-memory.patch` 仍在，记在 provenance 的 `alsoBuildableFrom`，等用户确认删（§7 第 3 项） | 不需要；属于 W1-23「vendored provenance and patch cleanup」 | 低，只加文件、改文字 |
| 2 | 做取包机制，文件仍在仓库里：`vendor/packages.json`、`scripts/fetch-vendored.mjs`、`.gitignore`、发布资产代码与测试的调整、CI 步骤（§5.3–§5.5）；取包脚本在文件已存在且校验通过时什么也不下载 | 不需要 | 低；CI 步骤此时是空操作 |
| 3 | 用户操作：建私有存放处、上传三个附件、建 GitHub App、配凭据（§5.4）；在一个删除了 tgz 的分支上跑 CI 证明能取到 | 用户 | 中；CI 凭据配置错会让所有 PR 红 |
| 4 | 删 tgz 与剩下的 `side-panel-memory.patch`（25 份历史补丁已在第 1 步删掉），换门禁（`tooling/gates/limits.json` 的 `vendoredPrologueSdk` 改成「已跟踪的 `vendor/**/*.tgz`、`vendor/prologue-sdk/*.patch` 为 0」，`scripts/check-health-gates.mjs:65` 的判断、`:274-285` 的度量和 `tests/health-gates-merge-base.test.ts:51,97` 的夹具同改），改 `AGENTS.md:29` 的硬约束、`README.md:138` 的上手步骤、`docs/platform/PROLOGUE-AI.md:14`、`skills/molis-prologue-ai/SKILL.md:33` | 用户确认「删除 vendored 文件」；前提：第 1 步的 `patch-history.json` 已在 main（其中的补丁 SHA-256 与 §4.5 一致，已核对）；删 tgz 时同改 `.sha256`、`.provenance.json`，门禁 `scripts/gates/vendored-provenance.mjs` 在 tgz 不在时要么随之调整，要么由 `vendor/packages.json` 接替 | 中；`skills/` 在全量回归期间不能改（AGENTS.md） |
| 5 | 是否前进到更新的上游头：另起一片，先在分支上换包跑 agent-host 全部用例，再用真实模型（MiniMax）走侧栏浏览器与 Coding 各一遍；上游变化很大（见 §4.1 最后一行），没有版本号可约束 | 用户；Prologue 负责人 | 高；要单独评估，不属于本方案的必做项 |

### 4.5 25 个历史补丁：基线、来源与产出的包（W1-23 已删，记录在 `patch-history.json`）

位置 `vendor/prologue-sdk/`，合计 2,566,805 字节；删除后仍可从 Git 历史取回（本片实测：64 个提交动过 `vendor/`，origin/main 可达的 `vendor/` 下 169 个 blob、62.6 MiB）。10-08 的决定要求「记 sha256 与来源」，下面三张表就是这份记录：每个补丁自带 SHA-256、基线、来源和产出的包，不指向 README 的行号，因为 README 在 §4.4 第 1 步会缩成一段。第 1 步（W1-23）把这三张表落成 `vendor/prologue-sdk/patch-history.json`，并在同一个 PR 里删了补丁（同一次合并进 main，不是同一个提交）：记录由补丁的实际字节生成，补丁本身都留在 Git 历史里，按记录里的 `gitBlob` 取回。

信息取自 README 里对应的小节（按「产出的包」名找），再逐项核对过：

- **基线**：每个补丁都用 `git archive <基线>` 解到临时目录、`git apply --check -p1` 通过。在 `a7e785b8`、`af7375c7`、`03c6ba0b`、`4702abe3` 四个候选基线里，除 `memory-project.patch` 四个都能应用外，每个补丁只在表里写的那个基线上能应用。
- **提交**：甲表 7 个补丁施加到基线后，整棵树与表里写的提交的树 `diff -r` 无差异。
- **包**：丙表的 SHA-256 取自 README，与 Git 历史里同名 tgz 的实际字节逐个核对相同（`git rev-list --all --objects -- vendor` 取出全部 tgz blob，共 65 条记录，逐个算 SHA-256，再 `git cat-file blob <blob> > <文件>` 即可取回）。其中 `assistant`、`bounded-results-network` 两个用 `git log --all -- <路径>` 没有输出，要按内容扫描才找得到。`network-dispatch` 的 `7ee09e00…` 来自 `d4a2f41b` 时期的 README（现行 README 已不再写它），也与历史里的 tgz 字节相同。

**甲　7 个有 Prologue 提交的补丁**（补丁施加到基线上得到的整棵树，与该提交的树逐文件相同；已用 `git archive` 出基线与提交、`git apply -p1`、`diff -r` 实测）。

| 补丁 | 基线 | 来源（molis-ai/prologue） | 字节 | 文件数 | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| `claims.patch` | `a7e785b8` | `codex/molis-coding-collab`，提交 `af7375c7` | 458,308 | 93 | `9248c7fdb87f650749d623b4ba64c93df595e05c94b3345793220bb54f176471` |
| `dispatch-denied.patch` | `af7375c7` | `fix/molis-dispatch-denied`，提交 `03c6ba0b`（父提交 `af7375c7`） | 10,191 | 4 | `5d425a16c2d0d4b112759e3fb63688f70ae8132027cc4e3d25b76bdc6cf38308` |
| `bounded-results.patch` | `03c6ba0b` | `~/code/prologue-dispatch-denied`，分支 `feature/molis-bounded-results`，提交 `4b6cd9bc` | 48,451 | 20 | `d5fb9392f14fad2c70d0c25d7ab8aa172c6c61f05ae81e150f8bc674241dfae3` |
| `assistant.patch` | `af7375c7` | `~/code/prologue-assistant`，分支 `feat/molis-assistant-app-mode`，提交链 `03c6ba0b`→`6f530d5a`→`22a1be08`→`4702abe3`，终点 `4702abe3` | 65,093 | 17 | `256d92254d179a2e1fe9caff85c1895b9ba8a4488d00f4e6c140d68af2e2294a` |
| `bounded-results-assistant.patch` | `af7375c7` | `~/code/prologue-dispatch-denied`，分支 `feature/molis-bounded-results`，提交 `93bbe1db`（合并 `4b6cd9bc` 与 `4702abe3`） | 99,441 | 30 | `3ca3e60f3a9a11bc2bfd372dc3875a58976de579dacb029272f34625ffe65845` |
| `memory-project.patch` | `4702abe3`（另可干净应用在 `a7e785b8`、`af7375c7`、`03c6ba0b` 上） | `~/code/prologue-assistant`，分支 `feat/molis-assistant-app-mode`，提交 `ac4d1135`（父提交 `4702abe3`） | 3,363 | 2 | `64fbe525bc7428aa506e51c2504948dab35f1e7d64da9a1da8f25cd07dcf7e29` |
| `resource-intake.patch` | `af7375c7` | `~/code/prologue-dispatch-denied`，分支 `feature/molis-bounded-results`，提交 `18a1c827`（基于 `93bbe1db`） | 122,692 | 37 | `6ad3f649ffbfba5733f29d80c7aa130913adf4471a8cba7908c77b4b799b89dc` |

**乙　18 个没有自己的 Prologue 提交的补丁**（都能干净应用在所写的基线上，已用 `git apply --check -p1` 实测）。

| 补丁 | 基线 | 来源 | 字节 | 文件数 | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| `network-dispatch.patch` | `af7375c7` | 已提交的 `03c6ba0b`（dispatch-denied）加上当时未提交的网络回调与 MCP 取消收尾；补丁只保存在 Molis 仓库（`d4a2f41b`，经 Molis 的 `21cdfbf8` 合入 main）；README 称 `4702abe3` 并入了这部分增量；实测补丁新增的 196 个非空行在 `4702abe3` 的同名文件里全部找得到 | 22,204 | 8 | `1698fe484443bcb07016fac87952b8d627b7dad1b63e328894094201a4072884` |
| `model-loopback.patch` | `a7e785b8` | `~/code/prologue-action-loopback`（分离 HEAD 的工作树，未提交） | 21,154 | 12 | `f6a1c161b6f8a8a7dde0b0dce06c03fadb976740cb22fcfb0f1e12277ce88722` |
| `output-continuation.patch` | `a7e785b8` | `~/code/prologue-output-continuation`（分离 HEAD 的工作树，先应用 `model-loopback.patch` 再改，未提交） | 34,225 | 17 | `8b5acc173ce76f1dc5ee11be1ef8c665ea4600b8d28dd593b10ed0a355cef2ae` |
| `dispatch-key.patch` | `a7e785b8` | 同上，累计 | 39,459 | 20 | `11cbafb86473bfb7b6ba77f350c8788c3b2952e3802dde7bff9622a9262fb944` |
| `file-mode.patch` | `a7e785b8` | 同上，累计 | 43,090 | 22 | `28bf633436ca2ff2078a41f2768a6433169ca074ddd4b5768d9e723bcba5036d` |
| `search-file.patch` | `a7e785b8` | 同上，累计 | 50,975 | 28 | `ce563d89dc0bab3268da2216652c580fc7dca750b593ccfd5d36f063a1bfe88e` |
| `search-scope.patch` | `a7e785b8` | 同上，累计 | 58,103 | 30 | `74148e65fb4de7c8ccb86157adeeea6858f5bd4569aca01242065f19bf5b3c6c` |
| `search-large.patch` | `a7e785b8` | 同上，累计 | 61,930 | 30 | `a6591f0a0072365d4f0c2ddb7033655913319f85977c65bff499a970e733767a` |
| `large-read.patch` | `a7e785b8` | 同上，累计 | 75,886 | 34 | `cebaa6cc540245c473b554afee480728cde58d34c403a4c386b83f3a01c5cd1f` |
| `board-same-state.patch` | `a7e785b8` | 同上，累计 | 78,764 | 36 | `91761254666c6a3c4330a4236d2dd4bd00c2feca3797ce48796ce3d0438a7b8e` |
| `subagent-close.patch` | `a7e785b8` | 同上，累计 | 84,217 | 39 | `4cfffc68f5a744a0f18c36e0d1ac903dc1a5571dc85af78ba28681941b4d82b9` |
| `character-precheck.patch` | `a7e785b8` | 同上，累计 | 87,269 | 40 | `dfca57cb8ab04f00d5c4d11157be2370499083a56cdaa53909d98c1d1c36478a` |
| `role-tools.patch` | `a7e785b8` | 同上，累计 | 91,553 | 41 | `67a3aa642d2ae3998aa7f8dddcb35d0496a81702adc4e6107d4b8c7b928fef44` |
| `parent-reads.patch` | `a7e785b8` | 同上，累计 | 109,089 | 44 | `af374ba71bc14bc01b7f45a61b89948fcda1d7ea1d0b25c119b0e84f04e03e68` |
| `bounded-inference.patch` | `a7e785b8` | 共享推理线，`~/code/prologue-action-loopback`（未提交，含 `model-loopback` 的修复） | 155,672 | 49 | `7c76c342b0c05ba47d7b6a4f507d9ae26a8ffa4fdb6d5dfc6ad8bd9ac3de594a` |
| `coding-inference.patch` | `a7e785b8` | `~/code/prologue-molis-integrated`（分离 HEAD 的工作树，`parent-reads` 与 `bounded-inference` 三方合并，未提交） | 240,972 | 72 | `8a2c2cb6b1c2380641d0286ed870687d6879a8f21ae4f04f0a1a6df5ef27966c` |
| `cache-breakpoint.patch` | `a7e785b8` | 同上，累计 | 247,275 | 74 | `67080d78dc1dc1638413234c1eb41b94d1b6d83cfa45bc2516d1fa8a70c1ff51` |
| `ledger-status.patch` | `a7e785b8` | 同上，累计（README 称为「Prologue 线」） | 257,429 | 77 | `32121cd6f32bba0d3349e943f0077ab9bab60849a3f3143d172b8bc97f7fb8d8` |

**丙　每个补丁产出的包**（README 里记的 SHA-256，与 Git 历史里同名 tgz 的实际字节逐个核对相同）。包名是 `prologue-sdk-0.0.0-rc.1-<后缀>.tgz`。

| 补丁 | 后缀 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| `claims.patch` | `claims` | 932,493 | `0a616614ae5882d20016c4ac07de30f149e0d78e05ff459e29689c0b5eefb43c` |
| `dispatch-denied.patch` | `dispatch-denied` | 933,116 | `3b8dcca04121e458e3c5f6d4fed77617f2e68178dccaad5cfcdb602601bc7c6f` |
| `bounded-results.patch` | `bounded-results-network` | 935,708 | `2269225bc71c3fd4fccaf4cdd5690244f6608348b79a56b73d50bbe6aef6b04a` |
| `assistant.patch` | `assistant` | 935,709 | `22265b9165486a265cacbed3b080f8b172a0e161b7e718da3220e7d01a9301a5` |
| `bounded-results-assistant.patch` | `bounded-results-assistant` | 938,095 | `32201e9e8d3ea6bb8de7cd74b155c1e31677b4b61d9bdd431506ac88419b024f` |
| `memory-project.patch` | `assistant-memory` | 935,828 | `6c356f5cda731a402c5c5db1bb233f3ea22d2881593c0f7966e50439448998ca` |
| `resource-intake.patch` | `resource-intake` | 938,808 | `2f7c0eb3eda0d748079d628d1260eac1a812afd50d08153483ff502ceb707974` |
| `network-dispatch.patch` | `network-dispatch` | 933,284 | `7ee09e00ef074b761c0d44a86a7d357e11485ea26868f3e77fb99ed757ae384e` |
| `model-loopback.patch` | `loopback-model` | 884,573 | `5eb410ce861d12c987f45515fc605acc59dc8ee558fcd1786b792d6eaae3e3ae` |
| `output-continuation.patch` | `output-continuation` | 885,574 | `a8a8d1563cf7257015f54ac385f58c189b6e0407b2f4a6a1a5889d88c4a36c6b` |
| `dispatch-key.patch` | `dispatch-key` | 885,899 | `35367d16ad89cc9b1aac0beaab9fa105e79f07c48addea19cf19d36c52ef81b8` |
| `file-mode.patch` | `file-mode` | 886,145 | `f9ca532288b8b6a3d3f68b575f48458f948f8ab93ac29244beb7fce840438398` |
| `search-file.patch` | `search-file` | 886,495 | `fd822866fe9125a641123f056c0f4e94c6416540ac5cbc56677c94bb08e93551` |
| `search-scope.patch` | `search-scope` | 886,931 | `11307936c5b68c42460865a407cf4db5c0081a5ac444be674b246b53346a2bb4` |
| `search-large.patch` | `search-large` | 887,132 | `4a40774bf8f6fb111e12da40b83304f1253ea4fcb4b7ca1975d1c8c2da4ac123` |
| `large-read.patch` | `large-read` | 888,150 | `9ec1243b2eb0bd08fdb866926021a8e714dd77cff8c1afa9da23c64ea46c4ebb` |
| `board-same-state.patch` | `board-same-state` | 888,271 | `4070d1b2939a084c5da2caa88f979e03ee355334c9262f6ddb5333a07b9a6e7d` |
| `subagent-close.patch` | `subagent-close` | 889,245 | `c054fe2e7fd45b0a78c4f0a0614436cda5e27fd1341bafc9abc082505e51dd1e` |
| `character-precheck.patch` | `character-precheck` | 889,764 | `2015571474b5dbc6033d74d54f6a9456fac7ddc588a737536e3811d0fe76cecc` |
| `role-tools.patch` | `role-tools` | 890,116 | `8e544ec408c6f6ea5c6321d20080c6f7001a91c41fe7163f4d61249a3bcb99b2` |
| `parent-reads.patch` | `parent-reads` | 891,068 | `3584a8b6c21c6761d65f9ed9c4320ecf570bcd52aba5ee470d6f984eb75d34e3` |
| `bounded-inference.patch` | `bounded-inference` | 894,573 | `9c6d6c0975334c029328d98306c5d5b58a764390d3196a4cdce94e48d4d8166e` |
| `coding-inference.patch` | `coding-inference` | 901,261 | `76fc2bda33a3f94d28e0f27be3f83dc2a2a2d5f061c080dc5dc977a016b93c03` |
| `cache-breakpoint.patch` | `cache-breakpoint` | 901,501 | `61bb2ee7a56b70c42e5a65dbbec3159cf08620a9f75f1d9672238aaa5d7bb964` |
| `ledger-status.patch` | `ledger-status` | 901,565 | `a50e14cd8bd4afb2fa2f041e639855d21848ee4c9ffbe3c0a010b136e714f2fd` |

**乙表的内容没有丢**。这 18 个补丁没有自己的 Prologue 提交，来源工作树（`~/code/prologue-action-loopback`、`prologue-output-continuation`、`prologue-molis-integrated`）已不在本机（`ls ~/code/prologue*` 只剩 `prologue` 与 `prologue-cleanup-backup-20261001`）。查到的去向有两处：

- 17 个以 `a7e785b8` 为基线的补丁，新增的非空行（按去掉首尾空白的整行比对）在 `af7375c7` 的同名文件里除少数行外都找得到。没找到的行数：`coding-inference`、`cache-breakpoint` 各 4；`search-file`、`search-scope`、`bounded-inference` 各 3；`board-same-state`、`subagent-close`、`character-precheck`、`role-tools`、`ledger-status` 各 2；`search-large`、`large-read`、`parent-reads` 各 1；其余 0（推断是被后面的改动改写过的行，没有逐行追查）。`af7375c7` 是 Prologue `origin/main` 的祖先。`network-dispatch.patch` 的 196 个非空行在 `4702abe3` 里全部找得到，`4702abe3` 同样是祖先。
- 2026-10-01 清理时，这几个工作树的未提交状态另存在 `~/code/prologue-cleanup-backup-20261001/wip.bundle`（`git bundle list-heads` 看得到 `refs/backup/action-loopback`、`refs/backup/output-continuation`、`refs/backup/molis-integrated`；同目录的 `README.txt` 写了恢复方法）。该目录的 `output-continuation.patch` 与 `parent-reads.patch` 逐字节相同（SHA-256 `af374ba7…8e68`）。这个目录在用户的机器上、不在仓库里，只能当补充，不能当长期记录。

「文件数」是补丁里 `diff --git` 的条数。不在清单里的第 26 个是 `side-panel-memory.patch`（225,092 字节，48 个文件，`1f64a15ce9d5d90d0f4ace90211c147efdea189d225c9236fc138438e86c7c55`），见 §4.2。vendor 目录之外有四份文档引用了补丁文件名，删除时要同改，否则链接断或说法过期：`specs/coding-plugin/spec.md`（`:1172` 的 `claims.patch` 是 Markdown 链接，`:1444` 也写了 `claims.patch`，`:682` 写了 `dispatch-key.patch`）、`specs/action-architecture/migration.md:360` 与 `specs/action-architecture/spec.md:542`（`model-loopback.patch`）、`specs/archive/system-assistant/implementation.md:679`（`memory-project.patch`）。路线记录 `roadmap-2026-10-07.md:942` 提到 `side-panel-memory.patch` 的文件名，那是当时的普查记录，不用改。

## 5. 私有包不再随公开仓库发放

### 5.1 现状

| 包 | 版本、大小 | 在哪声明（`file:` 依赖） | 来源与许可 |
| --- | --- | --- | --- |
| `@prologue/sdk` | 0.0.0-rc.1，953,138 字节 | `horizontal/agent-host/package.json:29` | 私有仓库 `molis-ai/prologue`（`gh repo view` 显示 PRIVATE），`private: true`，没有 LICENSE |
| `@adeptify/intelligence-client` | 0.2.2，86,017 字节 | 根 `package.json:71`、`apps/local-host/package.json:35`、`plugins/native/feed/package.json:33` | `provenance.json`：MIT，提交 `1f6babba…` 出自 `github.com/adeptify/trick-catalog`（这个账号解析不到） |
| `@adeptify/search-evidence-layer` | 0.4.1，268,243 字节 | 根 `package.json:72`、`apps/local-host/package.json:36`、`packages/storage/package.json:30`、`plugins/native/feed/package.json:32`、`plugins/official-integrations/rss/package.json:35` | 同上，提交 `149a69e2…`，MIT |

锁文件对三者都记了 `resolution: {integrity: sha512-…, tarball: file:vendor/…}`（`pnpm-lock.yaml:1308-1320`、`:1584`），`pnpm-workspace.yaml:26-29` 的 `minimumReleaseAgeExclude` 放行这三个精确版本。我在临时目录做了实验：pnpm 11.9.0 对 `file:` tgz 会校验锁文件里的 sha512，换了内容的文件报 `ERR_PNPM_TARBALL_INTEGRITY`，文件缺失直接读取失败——所以「文件不进 Git、安装前再取回来」时，取回来的字节必须与锁文件一致，pnpm 自己会拦。

**仓库里还有什么东西会随发布带走这些文件**（读代码和测试得出）：

- `apps/local-host/src/installer/release-assets.ts:15-30`：发布资产里 `vendor/` 下除 `prologue-sdk` 目录里的 `*.tgz` 之外的**全部**文件都带走，包括补丁（量时 26 个；W1-23 删了 25 个，只剩 `side-panel-memory.patch`）、`README.md`，以及另外两个包的 tgz；`apps/local-host/src/installer/package-release-files.ts:35` 在 npm 包也走同一个函数。`tests/release-assets.test.ts:10-55` 断言补丁与 `vendor/other/current.tgz` 会被复制，`tests/runtime-payload.test.ts:21-37` 断言桌面运行时载荷里有两个 adeptify tgz 且字节与 `provenance.json` 的 sha256 相同，`tests/npm-package.test.ts:37-41` 断言 npm 包里有 `vendor/prologue-sdk/README.md` 且没有 prologue 的 tgz。
- 根 `package.json:26` 的 `files` 含 `vendor`。
- `.github/workflows/release-macos.yml` 的 `release` 作业把 DMG 发到公开仓库的 GitHub Release（`softprops/action-gh-release`；工作流现在只能手动触发，文件里写着 Temporarily manual-only）；DMG 里是否含 SDK 的编译产物，文档只写了「正式 workspace 运行依赖」（`docs/cli-and-development.md:194`），我没有打开 DMG 核对（推断：含）。npm 包含 `@prologue/sdk` 是确定的（`tests/npm-package.test.ts:39-40`）。

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

事实：`ci.yml` 顶层 `permissions: contents: read`，触发是 `pull_request`、`push` 到 `main` 和手动，现有三个作业：`architecture-boundaries`（`ci.yml:20`，装依赖）、`secret-scan`（`:99`，只读 Git 历史，不装依赖）和汇总的 `verify`（`:126`）；`release-macos.yml` 只有手动触发，`permissions: contents: write`；仓库设置是 `allowed_actions: all`、不强制 SHA 固定；仓库本身是公开的、允许 fork；`gh secret list --repo molis-ai/molis-work` 没有输出（无密钥，或者我没有查看权限，未验证）；组织 `molis-ai` 是免费计划。

- 工作流自带的 `GITHUB_TOKEN` 只能访问当前仓库，读不了 `molis-ai/prologue` 和 vendor 仓库的 release，所以需要单独的凭据（推断，GitHub 令牌作用域的通行规则）。
- **推荐：一个组织拥有的 GitHub App**，名字提议 `molis-work-ci-vendor`，权限只给 Repository → Contents: Read-only（Metadata 默认只读），只安装到 `molis-ai/prologue` 和 `molis-ai/molis-work-vendor` 两个仓库。在 `molis-work` 仓库配置：变量 `VENDOR_APP_ID`、密钥 `VENDOR_APP_PRIVATE_KEY`。工作流在「Install dependencies」前加两步：用 `actions/create-github-app-token`（最新版本是 v3.2.0，我用 `gh api` 查到；固定到提交 SHA）按 `owner: molis-ai`、`repositories: prologue,molis-work-vendor` 换出一小时有效的令牌，再 `node scripts/fetch-vendored.mjs`，把令牌放进该步的 `GH_TOKEN`。令牌用完即失效，不绑任何人。
- 备选：细粒度个人令牌（所有者选 `molis-ai`、只选这两个仓库、Contents 只读、设过期日），放在密钥 `VENDOR_READ_TOKEN`。配置最快，但绑在个人账号上，人走令牌就失效，组织如果要求审批还要审批。
- **两份工作流都要加**：`ci.yml` 的 `architecture-boundaries` 作业（`:39` 之前）与 `release-macos.yml` 的 `build` 作业（`:41` 之前，矩阵里 arm64 与 x64 两个运行器都要）。`secret-scan` 与 `verify` 两个作业不安装依赖（前者的注释写着「No dependencies and no build」，只 checkout 与 setup-node 之后跑 `scripts/check-secrets.mjs`），不用加。令牌不要写进日志；取包脚本不打印令牌，不以 `set -x` 运行。
- **来自 fork 的 PR 拿不到密钥**，取包会失败，CI 在这些 PR 上会红。仓库的分支都在仓库内（路线记录已合并的 147 条远端分支），目前没有外部贡献者；接受这个后果并在 `README.md` 写明「外部贡献需要维护者读权限，或由维护者把分支推到仓库内」。**不要用 `pull_request_target` 去绕过**，那会把密钥交给 fork 的代码。
- **Dependabot 触发的运行同样拿不到这些密钥**：GitHub 文档写明 Dependabot 触发的工作流用的是 Dependabot 密钥，不是 Actions 密钥（原文「Your secrets are available in Dependabot secrets rather than as GitHub Actions secrets」，docs.github.com 的 Automating Dependabot with GitHub Actions，2026-10-08 读取）。§3.4 建议加的 `dependabot.yml` npm 生态，每个 PR 的 CI 都会跑到 `architecture-boundaries` 的取包一步，没有密钥就红。二选一：（a）把同一把 App 私钥再存成 Dependabot 密钥（用户的操作：`gh secret set VENDOR_APP_PRIVATE_KEY --app dependabot --repo molis-ai/molis-work`）；`VENDOR_APP_ID` 是 Actions 变量，文档没写 Dependabot 触发的运行能不能读变量（未验证），所以 App ID 也存一份 Dependabot 密钥，或直接写进工作流文件（App ID 不是机密）；（b）`dependabot.yml` 里不放 npm 生态，只管 `github-actions`，依赖升级靠 §3.4 的 `pnpm audit` 步骤和批量手工升级。另外，tgz 不在树里时，Dependabot 自己的更新作业（不是仓库里的工作流，由 GitHub 一侧运行）在 tgz 不在树里时能不能解析 `file:` 依赖与锁文件，也没有验证。
- 本机：开发者用自己的 `gh auth login`，需要是 `molis-ai` 成员且对两个私有仓库有读权限；已取到的文件留在 `vendor/` 与缓存里，离线可用。
- 缓存：作业里用 `actions/cache`，键是 `hashFiles('vendor/packages.json')`，路径是缓存目录，省掉重复下载。

### 5.5 取包机制上线前必须同改的代码与测试

均已核对存在：

- `apps/local-host/src/installer/release-assets.ts:15-30`：现在会把 `vendor/` 下的 tgz（prologue-sdk 目录除外）复制进发布载荷；tgz 取回到 `vendor/` 之后，这个函数要改成**所有** `*.tgz` 与 `*.patch` 都不进载荷，只带清单、`provenance.json`、`sbom.cdx.json`、`.sha256`、许可文本。对应改 `tests/release-assets.test.ts:10-55`、`tests/install.test.ts:753`（装完的 release 目录里没有 `historical.tgz`）、`tests/npm-package.test.ts:37-41`。
- `tests/runtime-payload.test.ts:21-37` 现在要求载荷里有两个 adeptify tgz，字节与 `provenance.json` 一致；MIT 包随产品分发时是否继续附原始包，要和 §7 第 2 条一起定，定了再改这个测试。
- `tests/npm-distribution-smoke.mjs:88-89` 读 `vendor/intelligence-client/sbom.cdx.json`，保留。
- `scripts/check-health-gates.mjs:65, 274-285`、`tooling/gates/limits.json`、`tests/health-gates-merge-base.test.ts:51, 97`：见 §4.4 第 4 步。
- 所有在新工作树里装依赖的地方（`AGENTS.md`「构建与测试」第一条、`README.md:138`、`scripts/start.mjs:432`、两份工作流）要在 `pnpm install` 前取包。

### 5.6 顺序与回退

顺序见 §4.4 的第 2、3、4 步；要点：**先让取包机制能用、再删文件**。第 4 步之前，仓库行为和现在完全一样，任何一步出问题都可以只回退那一个 PR。第 4 步之后如果取包源不可用，所有 CI 与新工作树都装不了依赖——所以第 3 步要在一个真删了 tgz 的分支上跑通 CI，再合第 4 步；两个 adeptify 包和 SDK 包同时放一份到另一个位置（例如用户本机的备份目录）作为兜底。

## 6. 这份方案没有动的东西

这是 W1-20 一片的范围：没有推送，没有删除任何 vendored 文件，没有改依赖版本，没有改源码与测试；`pnpm-lock.yaml` 没变。改动只有：根 `package.json` 加一个字段、两份工作流的「Install pnpm」一步、`spec.md` 里一行指针、本文。

## 7. 需要用户决定或操作的事项

1. **Git 历史**：把 tgz 和补丁从树里删掉，历史里还在（64 个提交动过 `vendor/`，main 可达的 `vendor/` blob 169 个、62.6 MiB，其中包含 Prologue 的源码补丁），公开仓库任何人都能取。10-08 的决定里「不改历史」只写在截图与根目录材料那一行。如果目的是不让外人拿到 Prologue 的代码，只有重写历史（`git filter-repo` 加强制推送，所有克隆、fork、PR 引用都要处理）才做得到，这是单独的、破坏性的决定，我没有做也没有假设。
2. **已经发出去的二进制**：GitHub Release 上的 DMG 和 npm 包里带的是编译后的 `@prologue/sdk`（npm 包确定含；DMG 推断含）。把 tgz 移出源码树不改变这一点。Prologue 仓库没有 LICENSE、包标着 `private: true`，对外分发它的编译产物是否允许，需要 Prologue 的负责人定；这也决定 §5.5 里 adeptify MIT 包要不要继续随载荷附原始 tgz。
3. 「删除 vendored 文件」（§4.4 第 4 步）要用户同意后才执行；同时请定要不要连 `side-panel-memory.patch` 一起删（§4.2）。
4. 建私有存放处、上传三个附件、建 GitHub App 并配密钥（§5.4，包括要不要把私钥再存成 Dependabot 密钥）：都是用户的操作。
5. 确认 SDK 合成负责人（§4.3 的提议）。
6. 在 Prologue 给 `9fc3b173` 打 tag：可选，需要用户同意（推送到上游）。
7. 依赖升级的批次（§3.4 的 1–5 步）和 CI 里加依赖审计、`dependabot.yml`、仓库设置（§3.4 末尾）：升级属于代码改动，可以直接分片做；仓库设置归用户。

## 8. 未验证的范围

- GitHub Actions 上的真实运行（取版本的那一步、将来的取包步骤）；`release-macos.yml` 的改动没有任何 PR 会运行。
- Dependabot 触发的运行能否读 Actions 变量；tgz 不在树里时 Dependabot 的更新作业能否处理 `file:` 依赖（§5.4）。
- `pnpm update hono -r --depth Infinity` 是否真的把 MCP SDK 那条路径带到 ≥4.13.7（§3.4 第 3 步）。
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
git archive <基线> | tar -x -C <临时目录>; git apply --check -p1 <补丁>   # §4.5 的基线与提交核对（再 diff -r 对提交的树）
git rev-list --all --objects -- vendor | grep '\.tgz$'   # 逐个 blob 算 SHA-256，核对 §4.5 丙表
git bundle list-heads ~/code/prologue-cleanup-backup-20261001/wip.bundle
```
