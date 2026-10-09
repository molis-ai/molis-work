# Package 边界规则

状态：已确认（F1）  
完整包清单：[`docs/SSOT-MATRIX.md`](../SSOT-MATRIX.md)

## 1. 依赖方向

```text
apps
  → composition roots
  → public Module / Service / Platform contracts
  → another App only along the listed launcher edges (§2)

modules
  → contracts/modules/*
  → contracts/services/*
  → kernel capability
  → never a Horizontal Service, App or Plugin

horizontal
  → contracts/modules/*
  → contracts/services/*
  → colocated adapter ports

plugins
  → plugin SDK
  → declared Module / Service / UI contracts and the action directory
  → never an App, Horizontal Service or Module implementation package (one listed exception, §2)

platform packages
  → contracts/platform/*
  → lower-level platform packages only
```

`server/`（身份、设备、接续回执与群聊领域）按 Module 规则检查，不算平台包：它有自己的业务事实（2026-10-08 决定第 4 项）。分类以 `scripts/workspace-packages.mjs` 的 `kind` 为准。

## 2. 强制禁止

- Module implementation 或 Store 导入另一个 Module implementation 或 Store。
- Module 导入 Horizontal Service、App 或 Plugin（代码 import 与 `package.json` 依赖都查，`module-upward-dependency`）。
- Plugin 导入另一个 Plugin implementation、Store 或未公开 UI 组件。
- Plugin 导入 App、Horizontal Service 或 Module implementation（`plugin-upward-dependency`）。在册的唯一例外：`plugins/native/shelf → modules/shelf`（Shelf 仍用 Shelf Module 的配方与设置解析，是待还的债，不是先例）。Goals 插件曾声明却从未导入 `modules/goals`，该依赖已删。
- App 导入另一个 App，列出的启动器边之外都拒绝（`app-dependency-not-allowed`）：产品根的启动器 → desktop / local-host / mcp，desktop → local-host，local-host → cli / mcp / workbench，`apps/server` → desktop / local-host。
- App Shell、CLI、MCP、Workbench 或 Desktop 直接写业务数据库。
- Horizontal Service 或平台产品服务（记忆、放置、搜索、情境排序）拥有或决定 Goal、Signal、Action、Session 等插件或 Module 的业务事实。
- Server Core 导入 Plugin payload schema 或完整 Local Module 状态机。
- `packages/contracts` 依赖 App、Module implementation、Plugin implementation、数据库或网络客户端。
- 通过 deep import 绕过 package public entrypoint。
- 用新的全局 `Manager`、`Service`、`Coordinator` 或共享 Store 代替旧 Huge Class。

## 3. 公开 Contract 形状

每个 Module 至少分开定义：

- Query：只读输入、结果、分页和权限 scope。
- Command：意图、版本/幂等键、成功结果和稳定错误码。
- Event：事务后事实、事件版本、幂等 identity 和最小 payload。
- Repository：仅实现内部可见，除测试端口外不从 public entrypoint 导出。
- Recovery：冲突、重试、恢复和 Compatibility 行为。

`packages/contracts` 是一个分发包，通过显式 subpath 暴露边界；禁止用根 barrel 再聚合所有类型。

## 4. package 建立标准

F2 创建目标地图里的全部 package。每个 package 必须有：

1. manifest 与 workspace 接线；
2. 单一 public entrypoint；
3. 允许/禁止依赖说明；
4. 就近 README；
5. 独立 build/typecheck；
6. import boundary 或 Contract conformance test；
7. `contract-only`、`partial` 或 `implemented` 状态；
8. 旧来源、剩余 caller 和移除条件。

`contract-only` package 只提供真实边界，不注册入口、不创建 Store、不返回伪成功。独立 package 默认是 Monorepo 私有包；只有 Contracts、Plugin SDK 和必要 UI Extension 类型进入潜在公共发布面。

## 5. Adapter 放置

不设顶层 `adapters/`：

- SQLite、Filesystem、Blob：`packages/storage/adapters/`
- PTY、Codex app-server：`horizontal/runtime-host/adapters/`
- Tauri、Keychain、Updater：`apps/desktop/adapters/`
- GitHub、Gmail、RSS 等：对应 `plugins/official-integrations/<provider>/`

Adapter 只翻译 Port 与具体技术调用，不拥有业务事实。只有形成独立发布物或多个真实消费者的版本压力时，才升格为 package。

## 6. 自动门禁

F3 已建立自动门禁，覆盖：public entrypoint、禁止 deep import、Module/Plugin/App 依赖禁区、Contract 清单一致性、package 独立 typecheck/build、循环依赖、README/状态矩阵存在。门禁通过不等于功能实现完成；行为还需由对应垂直 Goal 的兼容与端到端测试证明。

本地使用：

```bash
pnpm boundary:test   # 用失败样例证明规则真的会拦截
pnpm boundary:check  # 扫描当前实际 workspace package
pnpm workspace:verify # 门禁 + 所有目标 package 的 typecheck/build
```

`.github/workflows/ci.yml` 在 pull request 和 `main` push 上运行同一条 `workspace:verify`，并运行健康门禁（`health:check`）、页面资源预算（`page-assets:check`，宿主发出的样式表、脚本、插件客户端包与字体只许变小）、Goal 查询/存储边界、存储基线、发布资产、启动器类型检查、动作与插件合同、单一工作台外壳与成果门禁。全量产品测试仍在本地跑（见 PR 模板），但这些定向行为回归和 package 边界检查持续执行。

门禁由两层组成：

- `packages/test-kit` 提供纯规则：输入“谁在 import 谁”，返回具体违规；不读取数据库，也不复制业务判断。例外名单 `APP_IMPORT_ALLOWLIST`、`PLUGIN_MODULE_IMPORT_ALLOWLIST`（`packages/test-kit/src/boundaries.ts`）按包路径记边，只许减少，`packages/test-kit/tests/boundaries.test.mjs` 把它们逐项钉死；`unusedLayerExceptions` 找出名单里没有被用到的边。
- `scripts/check-package-boundaries.mjs` 读取 workspace manifest 与源码 import，把实际仓库信息交给纯规则，并检查依赖环和 Contract/README 清单。它记下每个 import 和 manifest 依赖实际有的边，名单里列了而仓库里没有任何 import 或依赖用到的边会报 `layer-exception-unused`：一条已经不存在的边不会留在名单里等着悄悄回来。

结构数字另由 `pnpm health:check` 对照 merge-base 只许减少（模块在 `scripts/gates/`，测试 `tests/health-gates-structure.test.ts`，规则与取数口径见各模块文件头）：

| 数字 | 量什么 | 为什么 |
| --- | --- | --- |
| `contractsPurity` | `packages/contracts/src` 里：定时器与 `AbortController`/`fetch`/`process`/`globalThis`，`Date.now()`、`new Date()`、`Math.random()`；Node 内置模块导入；模块级可变状态——`let`/`var`、`new Map/Set/WeakMap/WeakSet`，以及同一文件里被写入的模块级对象或数组字面量（成员赋值、`++`/`--`、`delete`、`push` 一类修改数组的方法、`Object.assign` 等；`as const` 和 `Readonly…` 类型的不算）；字面 HTTP 状态码；20 行以上的函数，不管写成声明、变量里的箭头或函数表达式、类和对象字面量的方法/访问器/构造函数/函数属性，还是交给某个调用的回调（逐个记行数，名字如 `validators.validateThing`；嵌套在别的函数里的算在外层里，匿名的按出现顺序叫 `<anonymous#N>`） | 合同包只放类型、Schema 与无副作用的小函数（N-11）；现有的运行时代码是基线，搬到所有者那里（W3-03）后数字下降 |
| `hostEntryExports` | `apps/local-host/src/index.ts` 的 `export *` 个数 | 宿主入口过宽，每个新 helper 都变成公开面（N-11） |
| `moduleRepositoryExports` | 各 Module 入口（`src/index.ts`）导出的 `…Repository`/`…Store` 名字，和导出的类、接口上公开的 `repository` 成员；顺着 `export *`、`export {…} from`、对 import 的 `export {…}` 找到声明，命名空间再导出（`export * as ns from "./x.js"`，或 `import * as ns` 后 `export { ns }`）里的每个名字按 `ns.<名>` 记（嵌套按 `a.b.<名>`）。没有追的：别名声明（`export const repo = GoalsRepository`、`export type R = GoalsRepository`）和把命名空间包进对象（`export const api = { ns }`），靠评审。Module 指 `scripts/workspace-packages.mjs` 里 `kind` 为 `module` 的包（`modules/*` 和 `server`），另加任何 `modules/<名>` 目录；对照 merge-base 时两边都读这份清单 | Repository 仅内部可见（§3）；去掉导出是下一步，这一步先不让它变多 |
| `typedCapabilities` | 按文件三项：①对 `HostCapabilityDefinition` 和包装它的类型别名的引用（别名由扫描仓库发现，今天是 `HostMethodCapability`，含 `import { 别名 as 本地名 }`；只读取定义类型的 `HostCapabilityInput` 一类不算）；②没有 `action` 的描述符字面量（转成上述类型的；同时带 `capability_id`、`version`、`operation` 的任何字面量，不管有没有转型；以及展开一个基础描述符、又给 `capability_id` 一个字符串字面量新 id 的，如 `{ ...base, capability_id: "x.y.v1" }`）；③typed 注册调用：`registerCapability(…)`；对“注册型”接收者的 `.register(…)` 或 `["register"](…)`——接收者在本文件里声明为注册型类型（`LocalHost`、`CapabilityRegistry`、Agent 与 Schedule 的 registrar 等：凡有一个 `register`/`registerCapability` 方法且第一个参数是 typed 定义的类或接口，也由扫描发现）、用 `new` 造出、是这类接收者的 `typeof`，或经一个声明了返回类型为注册型的函数取得（`getHost().register(…)`，本文件里的或导出的）；对这类接收者的 `register` 的非调用引用（`.bind(host)`、`.call(…)`、`.apply(…)`、`const add = host.register`、`const { register } = host`、`list.forEach(host.register)`，每处记一次，绑定出的名字再按下一条追）；调用第一个参数是 typed 定义的函数（本文件里的，如 `horizontal/agent-host/src/capability-registration.ts` 的局部 `register` 助手，它有 40 多处调用；或别的文件导出的，含 import 改名）；调用把自己的第一个参数原样交给上述任一种注册的本地函数（不论参数类型，逐层追到不再增加）；以及名为 `register`/`registerCapability` 的调用，第一个参数是内联的描述符字面量（有 `capability_id`，有 `operation` 或展开，无 `action`），不管接收者是什么类型 | 2026-10-07 N-12 决定：对外的只走动作，宿主能力（typed）只留作宿主内服务通道，不再新增条目。三项里任何一项变多都会失败，所以新的 typed 描述符（用类型名或别名）、新的注册点、新写出这些的文件都放不过；已有的 typed 能力被调用不在其内（见下面「看不到的」） |
| `layerExceptions` | `APP_IMPORT_ALLOWLIST`、`PLUGIN_MODULE_IMPORT_ALLOWLIST` 里的条目，一条边一条记录 | 名单和钉死它的测试可以在同一个 PR 里一起改；这里对照 merge-base，新增条目放不过，只能删。名单读不出来时也失败（合入前的 merge-base 还没有这两个名单，那一次不比）：读得出来指两个名单各是一个同名变量，初值是只含字符串字面量的数组；改名、挪走，或往里放展开（`...EXTRA_EDGES`）、标识符、函数调用、带替换的模板，都算读不出来 |
| `hostPluginFiles`、`registerProviderSites` | 宿主里以内置插件命名的 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts`；`apps/local-host/src` 里每个文件的 `registerProvider(` 调用 | 构建期装配路径冻结（AGENTS.md）；名单测试 `tests/builtin-plugin-assembly-gate.test.ts` 之外，这里对照 merge-base，改名单放不过 |
| `hybridPlugins` | 已由 Plugin Runtime 启动、宿主却还有同名文件或手工 `registerProvider(<插件>…Provider(…))` 的插件（现在：shelf、characters、coding、git），报告里标出 | 混合装配既不是 Runtime 形状也不是冻结的构建期形状，名单看不出来。Characters 按 2026-10-08 决定第 26 项将并进宿主或某个 Module，不再长期作为 Runtime 插件 |
| `pluginOutsideMentions` | 每个内置插件的包名在它自己的包之外出现在多少个源码或配置文件里（import、`package.json` 依赖、工作区清单） | 加一个插件除了它自己的包还要改几处；目标是 0（W4-01）。新插件最多可以被 7 个文件点名，等于现有最小的完整插件（text-stats） |

这些数字**看不到**的（没有类型检查器和跨文件数据流，靠评审；每个模块的文件头写得更细）：

- 所有结构数字按文件记录，只扫 `apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling` 下的 `.ts`/`.mts` 源码，不含声明文件、`dist/`、`node_modules/`、`tests/` 目录和 `*.test.ts`；`tests/` 之外的 `fixtures/` 目录会扫，生产代码躲不进名叫 fixtures 的目录。**拆文件会红**：把带记录的文件拆成两个，只有 git 认作改名的那一半带着记录走，另一半里搬来的条目算新增。W2/W3 里拆 `apps/local-host/src/project-capabilities.ts`（49 处注册）这类文件的重构，要么让带记录的那部分留在被判为改名的文件里，要么在同一个 PR 里改门禁（过评审）。
- `typedCapabilities`：只数定义和注册，不数使用者。对已有 typed 能力的调用（`client.invoke(已有定义, 输入)`、`host.invoke(…)`）不计数，任何文件（不管有没有记录）都可以新增这样的调用；N-12 说的是不新增条目，调用不新增。新文件里这样的调用若同时按包名点名了插件，由 `pluginOutsideMentions` 拦。也看不到：展开基础描述符、又没写字符串字面量 id（`{ ...base, capability_id: id }`），并经一个在本文件里没写出类型名的接收者（或只是别处导入的某物的 `typeof`）按变量注册；`host[name](…)` 这类计算键、`Reflect.apply(host.register, …)`、放在数组或 Map 里的 registrar、解构出来的参数（`({ register }) => register(…)`）；另一个文件里的、第一个参数没有类型的包装函数；签名里没写返回类型的注册型函数。
- `contractsPurity`：看不到经别名写入的字面量（`const alias = cache; alias.x = 1`）、交给别的函数去写（`fill(cache)`）、被别的文件导入后写入；函数里只要声明了与模块级字面量同名的局部，整个函数跳过这项检查；类的静态字段和闭包里的状态（`const counter = makeCounter()`）；经对象取的全局（`window.setTimeout`、`self.fetch`）；名字不像状态码的变量里的字面状态码（`const code = 404`）。
- `moduleRepositoryExports`：别名声明和把命名空间包进对象，见上表该行。
- `pluginOutsideMentions` 数的是包名字符串出现在多少个文件里；用相对路径指到另一个插件源码的 import 不在其内（那条路径由 `pnpm boundary:check` 的 import 规则管）。

typed 条目的新增、Repository 导出的新增、宿主入口的变宽、合同包里新副作用的出现、层间例外的新增，都不是加数字能放过的事：改动门禁本身要过评审。

旧根 `src/` 与 0.1.x 的根 SDK 都已退出产品实现，根包 `@molis-ai/molis-work` 只发布命令行入口，不导出代码。`pnpm boundary:check` 拒绝任何根目录 `src/`（不再有兼容白名单）；各包的大文件由 `pnpm health:check` 的巨大单元门禁只许变小。

Goal 的 typed compatibility capability 现在仍作为统一 Action 的薄适配存在，门禁检查其实际返回 `goalAction` 的结果。CLI 的 snapshot 仍消费该适配，标准 MCP 按 Action 目录发现，不要求恢复已退出的旧 MCP snapshot 分支。两者仍不得越过 Host 直接读写领域 owner。2026-10-07 的 N-12 决定是对外只走动作、没有生产调用方的 Goals typed 桥要删（W2-08、W3-07 做），在此之前 `typedCapabilities` 只许减少，不许新增。

Repository 仅内部可见是目标约束；当前 Goals/Artifacts 等 public entrypoint 仍导出构造类型，尚待将 Host 装配与普通消费者接口分清。`moduleRepositoryExports` 把现有导出冻结住，只许减少。不能将现有导出视为任意调用 Store 的许可，也不能通过删除此约束宣称边界已完成收口。
