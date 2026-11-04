# 统一输入公共组件：第 10 批实施方案与开工前检查

状态：方案待审（2026-11-04，A 轨起草，未写产品代码）；第 3 节的合同 C 轨已审、七条意见已改（[#1791 评论](https://github.com/molis-ai/molis-work/pull/1791#issuecomment-6635798469)），其余由统筹审；第 8 节四项统筹已定（2026-11-04，[#1791 评论](https://github.com/molis-ai/molis-work/pull/1791)）。原需求是[统一输入体验](spec.md) §2～5 与验收 UIV-01～04、UIV-11～17，定样见 [§10.1](spec.md) 与[原型](../../docs/design/unified-input/README.md)；核账见[第 10 批「本批核账」](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-audit)，现状逐项在[输入框盘点](input-inventory.md)。语音（§6～7、UIV-05～10）在第 53 批，这里只留麦克风的位置。

- **类型**：横向能力（公共输入组件与插件扩展）为主；产品线（助理、Coding）。按[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)第 1.1 节属**大需求**：跨 C1、D、A、B、E 五处，带一处公开合同与 SDK 扩展、一条新的安全不变量。
- **决策标记**：用户已定：组件归平台、开放注册（10-27）；键位与送达映射（10-27）；七块定样与 H4（11-04）。统筹已定：两层、键位一起改、创作台、决定理由型、IM 的 Esc（11-04，核账「已定的点」）。统筹已定：第 8 节四项（11-04）。没有要用户再定的界面；第 3.6 节组件板三处新增按已定的样做成标本。
- **用到的横向能力**：统一动作目录与动作网关（`+` 菜单里插件给的来源）、系统搜索（`@`）、输入回执（`createInputReceipts`）、长高（`data-fit`／`molisFit`）、拖入（`molisDropZone`）、组件板控件。**会改动的**：动作元数据多一种角色 `composer_source`；SDK 多一个页面全局 `molisComposer` 和一个首屏渲染函数。
- **相邻的线**：03 定样的「发给」与 PWA-130（同一行接收者）；ai-input-receipts（送达方式与回执，主人不变）；字体皮肤语言的 C 段切换窗口（第 16 批，组件的文字与样式要在窗口前按新格式写）；第 53 批语音。
- **负责人**：方案、组件、助理与首页的接入 A 轨；合同与 SDK 类型 C1；组件板标本与 SDK UI 子路径的导出行 D；Coding 的接入 B；其余插件入口 E。

## 1. 用户与统筹已定的

1. **组件归平台，开放注册**（用户 10-27，需求 §2.1～2.2）：一个公共输入组件，插件经公开合同与 SDK 使用和扩展；平台不写插件 id、不另开名单。
2. **键位与送达**（用户 10-27，需求 §4）：Enter 换行；⌘/Ctrl+Enter 发送，运行中即「补充」；⌘/Ctrl+Shift+Enter「下一轮再做」；「打断并改向」只从明确的按钮或菜单来，没有快捷键；Esc 只关局部菜单；Tab 保持焦点导航。
3. **定样**（用户 11-04，§10.1）：七块都照推荐，H4 选方案一；控件用组件板现成的 `mw-*`，三处组件板新增先做进组件板。
4. **分两层**（统筹 11-04）：所有输入框共用编辑器层；只有对 AI 说话的输入框带送达菜单。决定理由型（评审反馈、Jelly 指令、Goals 退回）只对齐长高、输入法和草稿，不绑发送键。

## 2. 产品检查

**从结果倒推。** 用户在首页底栏写一段话，中途按 Enter 换了两行，拖进一个文件、从 `+` 菜单选了一条待办，按 ⌘↵ 发出；框上方一直写着「发给：个人助理」。助理在跑时再写一句，按 ⌘↵ 是补充，从 ▾ 选「打断并改向」才打断。到 Coding 会话里，同样的键、同样的菜单、同样的附件条和状态行，只多了 Coding 自己的模式选择。切到别的会话再回来，没发出的字还在，各是各的。

**每一步站不站得住**（产品治理第 3 节）：

| 步骤 | 保护或解决什么 | 缺哪个事实或决定 | 之前给过没有 | 怎样少打断 |
| --- | --- | --- | --- | --- |
| 看「发给：对象」 | 不发错对象（需求 §4、PWA-130） | 当前接收者 | 由挂载页给，组件只显示 | 一行字，不弹窗；只在切到任务或子任务时换名字 |
| 选附件和资料 | 带上的是原主人可核对的引用，不复制正文 | 选哪些 | 没有 | 框里一项一项，读不到的当场说原因、可移除，不等发送时才失败 |
| 发送 | 不重发、不丢字（UIV-03） | 结果 | 没有 | 发送中锁按钮；成功才清草稿；不确定时写「待确认」并给「查一下」，不引人再按一次 |
| 打断 | 正在写的回复会丢（需求 §4、§10.1） | 是否打断 | 没有 | 菜单项带一句后果说明；只改这一次，发出后回到补充 |
| 一次提示 | 老习惯按 Enter 发不出去 | 新键位 | 发送键提示里一直写 ⌘↵ | 只在有人在一行字后按 Enter 时出现一次；⌘↵ 发过或点「知道了」后不再出现 |

**已有的接着用。** 助理的草稿（宿主按工作存）、Coding 的草稿（服务端按会话存，`plugins/native/coding/src/routes-sessions.ts` 的 `draft:<session_id>`）、Coding 的回执与纠正、IM 的「未能确认发送结果」、Issues 的幂等重试，都是组件要收进来的现成做法，不是从零写。升级后已存的草稿还在（第 6 节第 10 项）。

**AI 的部分。** 组件不调模型。送达方式只传给目标已有的公开动作，由回执合同如实回报「送达／读到／没读到」；组件不替模型解释，也不加提示词。

**归谁。** 没有主人存储的入口，草稿归组件；助理、Coding 的草稿归原主人，组件经 `draft.adapter` 读写。接收者显示、发送生命周期归组件；送达方式与回执归 ai-input-receipts；接收者是否有效归挂载页与子代理合同；资料的正文归各自主人。组件是平台能力，三入口是首批消费者。

**别漏掉的路径。** 中文输入法选词中按 ⌘↵／Enter；粘贴长文本后撤销；空白内容；只有附件；目标此刻不支持某种送达（菜单项不可选并写原因，不静默改成另一种）；运行刚结束时按「补充」（回执写「这一轮刚结束，留给下一轮」）；必需扩展失效；插件停用、卸载、撤权后它给的来源；同一页挂两个组件；切会话时有迟到的回执或选择结果；刷新、重启；窄屏 390；中英文；深浅色；只用键盘。

## 3. 设计

### 3.1 两层与挂载方式

组件是一段页面客户端加一个首屏渲染函数，沿用 `molisFit`、`molisDropZone`、`createInputReceipts` 的现行做法：客户端脚本在 `packages/design-system/` 里（与 `INPUT_RECEIPTS_CLIENT_SCRIPT` 同处），由工作台页面与沙箱框架（`apps/workbench/src/plugin-frame.ts`）各装一份，成为 `window.molisComposer`；类型写在 SDK 的 `page-globals.ts`，插件作者只装 contracts 与 SDK 就能用。首屏外壳由 SDK UI 子路径的 `renderComposer()` 输出，避免挂载时布局跳动：它是插件作者可用的 `/ui` 导出，实现在 plugin-sdk 自己里面（`packages/plugin-sdk/src/ui/composer.ts`，只拼组件板类名的 HTML 字符串，不依赖 design-system），签名进 API 快照，单独一片 K0c 先落（第 5 节）。

- **编辑器层**（`kind: "plain"` 与 `"ai"` 都有）：多行与长高（`data-fit`，上限后框内滚动）、输入法守卫（`isComposing` 与 keyCode 229 一处实现）、键位、草稿与恢复行、附件条（选、粘贴、拖入；读取中、读完、附不上带原因与移除）、状态行、防连点与 `request_id`、`+` 菜单与 `/`、`@`。
- **AI 层**（只有 `kind: "ai"`）：接收者行「发给：对象」、送达 split button（补充、打断并改向、下一轮再做）、运行中的停止与暂停、回执（把发送结果交给 `createInputReceipts`）。

决定理由型输入只用编辑器层，并把发送键关掉（`submitKeys: false`），按钮提交照旧。

### 3.2 挂载选项（页内，SDK 类型）

挂载页给出自己这一个实例的行为；这些都在挂载页自己的代码里，不需要注册，也不跨插件可见。

```ts
window.molisComposer(root: HTMLElement, options: ComposerOptions): ComposerHandle

interface ComposerOptions {
  kind: "ai" | "plain";
  entry: string;                          // 入口名，在插件内唯一，如 "session"
  draft: { conversation: string }         // 平台草稿：键里的项目与安装由页面上下文给（3.4）
       | { adapter: ComposerDraftAdapter }; // 草稿本是主人事实时（助理按工作存、Coding 服务端按会话存）用主人的读写
  receiver?: () => { label: string; reset?: () => void } | null;
  delivery?: () => ComposerDelivery;      // 只 ai：此刻能用哪几种、各自为什么不能用
  controls?: readonly ComposerControl[];  // 场景控件：select / toggle / button；组件按板子控件画、窄屏收进「更多」
  commands?: readonly ComposerCommand[];  // 本页自己的 / 命令（Coding 现有的那些）
  attachments?: { accept?: string; upload(file: File, signal: AbortSignal): Promise<ComposerAttachmentState> };
  sources?: boolean;                      // 是否列出已注册的插件来源（3.3），默认 kind 为 ai 时列
  required?: () => string | null;         // 挂载页自己的必填检查，返回缺什么
  submit(input: ComposerSubmission, signal: AbortSignal): Promise<ComposerOutcome>;
}
interface ComposerSubmission { text: string; materials: readonly ComposerMaterial[]; delivery?: AgentSteerMode; controls: Readonly<Record<string, string>>; request_id: string }
type ComposerOutcome =
  | { state: "sent"; receipt?: AgentSteerReceipt }
  | { state: "failed"; message: string }
  | { state: "unknown"; check(): Promise<"sent" | "not-sent" | "unknown"> };
interface ComposerHandle { setRunning(running: boolean): void; refresh(): void; focus(): void; insert(text: string): void; destroy(): void }
```

- **送达方式不另造类型**：直接用 `services/agent-inputs` 的 `AgentSteerMode`（`next-boundary`／`interrupt`／`after-run`），界面词按 GLOSSARY：补充、打断并改向、下一轮再做。目标不支持的方式在菜单里不可选并写原因（`ComposerDelivery` 给出），不降级为另一种（UIV-17）。
- **键位不可改**：选项里没有改键的口子；`commands` 与 `controls` 都不能拦 Enter、⌘↵、Esc、Tab（需求 §2.2 末段）。
- **挂载代次**：每次挂载、换会话（`draft.conversation` 变了）都换一个代次；迟到的上传、来源查询、发送结果只写回发出时的代次，别的代次直接丢弃（UIV-15）。同一个 `root` 再挂载先释放上一次，按钮、监听不会成双。

### 3.3 插件给的来源（注册，C1 合同）

需求 §2.2 的四种扩展里，只有「资料来源与选择器」要跨插件出现（别的插件把自己的对象放进助理或首页的 `+` 菜单）；其余三种（接收者与上下文显示、场景控件、提交适配）都是挂载页自己的事，用 3.2 的选项。所以合同只加一种动作角色，与 `search_source`、`file_source`、`intake` 同一个写法：

```ts
// packages/contracts/src/platform/composer.ts（新子路径 ./platform/composer），由 ActionMetadata 引用
// 一个声明挂在一个动作上，capability_id@version 已经唯一，不另设 source_id
interface ComposerSourceDeclaration {
  readonly title: string;                      // 菜单里的名字，翻译同 SearchSourceKind.title
  readonly subject_kinds: readonly string[];   // 返回的对象种类，必须是本提供方有对象读取器的种类
  readonly layers: readonly ("ai" | "plain")[];   // 出现在哪一层的输入框
}
// ActionMetadata 加：readonly composer_source?: ComposerSourceDeclaration;
export const COMPOSER_PICK_INPUT_TYPE = "molis.composer.pick.query.v1";
export const COMPOSER_PICK_OUTPUT_TYPE = "molis.composer.pick.items.v1";
// 平台定死的 schema，声明者的 input_schema／output_schema 必须与之一字不差（同沙箱集成包的 SANDBOX_INTEGRATION_CONTRACT）
export const COMPOSER_PICK_INPUT_SCHEMA: ActionSchema;   // query 0～200 字，limit 1～50，near 可选
export const COMPOSER_PICK_OUTPUT_SCHEMA: ActionSchema;  // items 至多 50 项
interface ComposerPickInput { query: string; limit: number; near?: ActionSubject }   // near：挂载页明确交出的当前对象，可没有
interface ComposerPickItem { ref: MaterialRef; title: string; hint?: string }        // 插件对象给 pin: { mode: "current", read_revision }
interface ComposerPickOutput { items: ComposerPickItem[] }
type ComposerMaterial =
  | { kind: "attachment"; ref: string; title: string }                       // 挂载页 upload 给的句柄，主人是挂载页
  | { kind: "material"; ref: MaterialRef; title: string;
      source: { capability_id: string; version: number; provider_id: string } };  // 同 AssistantMaterial.capability，只用于显示
```

- **资料身份用 05② 的 `MaterialRef`**（共用来源与呈现 §2（[#1771](https://github.com/molis-ai/molis-work/pull/1771) 的 `specs/shared-sources-and-surfaces/spec.md`），SSC-01）：选择器、附件条、发送都用同一个引用，不另起写法。合同依赖 05② 的 C-1（`platform/project-materials`）。
- **声明检查**（SDK 共用的那份，作者与平台同一套）：`inspectActionDeclarations` 里查 `kind: "query"`、`effect: "read"`、`scope` 为 `project` 或 `home`、`audiences` 含 `user`、`input_type`／`output_type` 是上面两个，且 `input_schema`／`output_schema` 与平台的两份一字不差（不然提供方能在同名类型下把输入放宽、多收字段，S-109 第 1 条就靠不住）。「`subject_kinds` 都是同一提供方读得了的种类」是同一次注册里的交叉引用，放在 `inspectActionCrossReferences`，与 `search_source` 的 kinds 用同一套对象读取器判定。不合就在 Manifest 解析时拒。
- **发现**：组件从动作目录读出当前范围可见、已授权的 `composer_source`，按提供方分组，写出插件名；宿主与工作台里不写插件 id、不另开名单。
- **调用**：用户点开分组、打字时才调；走动作网关，身份、项目与可达范围（Home 级插件的 `project_reach`）取自调用上下文，插件拿到的只有 `query`、`limit` 和挂载页明确交出的 `near`。个人助理不在项目里时，只列 `scope: "home"` 的来源。
- **选中的是引用**：`MaterialRef` 带 `pin`，发送时由目标按原主人的对象读取器再读一遍；读不到的在附件条上写原因，**不静默去掉后发送**（UIV-15、需求 §5 末条）。
- **到助理的对应**（K3）：`material` 一支变成 `AssistantMaterial` 的 `{ kind: "object", reference: { subject }, object: { kind, id, version: pin.read_revision, title }, explicit: true }`，`source` 照搬进 `capability` 只作显示；`attachment` 一支照助理现有的文件与图片上传。宿主照旧按主人再核。
- 第一版不开放跨插件的 `/` 命令与 `@`：`@` 继续走系统搜索（`search_source`），`/` 列本页的 `commands` 和助理已有的能力与方法。以后真有插件要往别人的 `/` 里加命令，再按同一写法加一种角色，不在本批。

### 3.4 草稿放在哪（统筹已定，第 8 节第 1 项）

**平台草稿存在本机浏览器存储**（`localStorage`，桌面壳的 WebView 跨重启保留），键由组件拼成 `mw.composer.draft:<project_id>:<install_id>:<entry>:<conversation>`，其中项目与安装取自页面上下文，插件只给 `entry` 和 `conversation`；不在项目里时（Home 级插件、个人助理的主对话）项目一段固定写 `home`。键名不带版本：现在不留版本兼容，以后形状要变按 [CONTRACT-CHANGES](../../docs/system/CONTRACT-CHANGES.md) 走，不读旧键。草稿本身已有主人存储的入口用 `draft.adapter` 接主人的读写，组件不另存一份：助理（宿主按工作存）、Coding（服务端按会话存，`routes-sessions.ts` 的 `draft:<session_id>`，统筹 11-04 定，不改成浏览器存储）。浏览器存储只给还没有主人草稿的入口。

- **删项目、卸载插件后不留**：组件启动时按页面上下文里的项目与安装列表，清掉不在其中的键；删除与卸载若有页面事件，也即时清。验收 UIC-10。
- **存储读写失败**（满了、被禁用）：在状态行就地写明「草稿没能保存在本机」，输入框里的字不动、照常能发；恢复后下一次编辑再写。验收 UIC-11。

理由（对没有主人存储的入口）：未发出的字是这台机器上的编辑状态，不是业务事实，不该进库；IM、Pages 已经这样存，跨重启没问题；不新建表，没有升级链。代价：不跨设备（需求也没要求）；同源的页内脚本本来就能读到页面状态，这一层不是安全边界，安全边界放在 3.5 能拒绝的地方。沙箱插件的框架是另一个源，读不到外面的草稿。

没选的另一种是宿主建一张草稿表（跨设备同步时更顺），要新表、新动作、进升级链。

### 3.5 安全边界（第 4 节有拒绝测试）

扩展拿到的只有本次调用的输入；组件不给扩展任何读草稿、读别的实例、提交、换接收者、批准的接口。来源动作走现行的动作网关与逐次授权，停用、撤权后目录里就没有它，迟到的结果按挂载代次丢弃。沙箱插件经框架桥只拿到自己挂载的实例。

### 3.6 组件板三处新增（D 先做成标本）

定样里标的三处（[原型 README](../../docs/design/unified-input/README.md)「和组件板对齐」），实现前先进组件板，组件只用标本里的类名：

| 新增 | 标本要有的样子 | 放在哪 |
| --- | --- | --- |
| 多行输入框外壳 `mw-composer` | 接收者行、附件条、写字区、状态行、底部操作行；空白、聚焦、有草稿、长高到上限后框内滚动、不可用、处理中、失败、待确认；与首页单行胶囊同一套圆角、阴影和焦点 | `packages/design-system/` 的样式部件与 `/__ui/catalog` 一节 |
| 菜单项说明行 `mw-menu__desc` | 菜单项下一行灰字，带与不带快捷键、不可选并写原因、深色 | 同上，挂在现有 `mw-menu` 下 |
| 麦克风图标 `mic` | 图标表里一项，16／20 两个尺寸；本批只占位，不接语音 | `packages/design-system/` 的图标表 |

每处都看浅深色、中英文、1440／1024／390；动效用现有的曲线与时长 token，不新加。原型里的 `.mwc*` 与 `mw-menu__desc` 是参照，不照抄进产品。

## 4. 安全不变量的变化

按 [SECURITY-INVARIANTS](../../docs/system/SECURITY-INVARIANTS.md) 第 3 节加一行。测试要先在没有保护的代码上红过。

**新增 S-109（暂编；第 18 批已暂占 S-108，落地时按表顺延）：输入组件的扩展只拿到本次调用。** 拒绝什么：

1. 来源动作的输入里没有草稿、接收者、别的附件：给 `composer_source` 动作的调用只含 `query`、`limit`、`near`；挂载页没交 `near` 时也没有当前对象；声明的 `input_schema` 与平台定死的那份差一个字（多收字段、放宽长度）就装不上。
2. 不合规的声明装不上：`composer_source` 声明在非 `query`、非只读、受众不含 `user`、种类不归自己的动作上，Manifest 解析被拒。
3. 停用、撤权、卸载后不出现、不被调：目录里没有，已打开的菜单再查被拒（`actions.missing` 或撤权码），迟到的结果不进框。
4. 选中的引用发送时再核对：目标读不到某个 `subject`（不存在、没权限、版本对不上）时这次发送被拦，草稿与选中项都在；不会去掉它再发。
5. 沙箱插件只拿到自己的实例：框架桥上没有读别的实例草稿或调别的实例提交的消息，伪造的被拒。

测试文件暂定 `tests/security-invariants-composer.test.ts`，进 `test:security`（不依赖浏览器的部分）；第 3 条与第 5 条的页面部分在 K2 的浏览器用例里。

## 5. 拆片与落地顺序

按[轨道规则](../post-anticorruption-roadmap/reference/tracks.md#section-5)：合同先行（规则 1），同路径一起落（规则 4），借文件由主人落（规则 7）。片号用 K（统一输入）；验收编号 UIC-xx 是本方案新加的，测试名或注释里写出编号，与需求的 UIV 编号并写。

| 片 | 内容 | 谁落 | 前置 | 验收 |
| --- | --- | --- | --- | --- |
| K0 合同 | `packages/contracts/src/platform/composer.ts`（新子路径）：`ComposerSourceDeclaration`、两个类型名与两份定死的 schema、`ComposerPick*`、`ComposerMaterial`（对象一支包 `MaterialRef`）；`ActionMetadata.composer_source`；SDK 的声明检查（`inspectActionDeclarations` 比 schema、`inspectActionCrossReferences` 查种类）；`page-globals.ts` 里 `molisComposer` 与 3.2 的类型；`pnpm api:update`（动作快照不变：本片没有声明者）。阶段 1 按 N35 原地改形状，不升版本 | C1，单独的合同 PR，C 轨评审；C 轨排期 | 02 交接；05② C-1（`MaterialRef`）合入，或与它同一片落；本方案审过 | UIC-01 API 快照只多这几项；UIC-02 声明检查的拒绝用例（S-109 第 1、2 条：schema 差一个字、非只读、种类不归自己） |
| K0b 助理送达字段 | `AssistantSendInput` 加 `delivery?: AgentSteerMode`（`packages/contracts/src/services/assistant.ts`，A 的文件）。不写等于 `next-boundary`（即今天的补充）；只在 `target` 为 `steer`（不写也是 steer）时有意义，与 `target: "answer"` 同时出现、或新开工作（没有 `work_id`）时出现都拒绝；HTTP 入口不认识的取值拒绝，不补成默认 | A，小合同 PR，C 轨评审 | 与 K0 同时或紧随 | UIC-03 API 快照只多这一项；UIC-12 三种拒绝（与 answer 同时、新工作、未知取值）各一条用例 |
| K0c 首屏渲染 | SDK `/ui` 导出 `renderComposer(options)`（`packages/plugin-sdk/src/ui/composer.ts`，A 独占），只拼 K1 标本的类名，不依赖 design-system；`pnpm api:update`。SDK 算共享核心，按共享核心跑全量 | A，小合同 PR，C 轨评审；`ui.ts` 的导出行 D 评审 | K1 合入（类名定了） | UIC-13 API 快照只多 `renderComposer` 与它的选项类型；输出与 K1 标本的结构一致 |
| K1 组件板标本 | 3.6 的三处 | D | 本方案审过；可与 K0 并行 | UIC-04 组件板有三节标本，三宽度、中英、深浅截图进 PR；页面资源增长写明字节 |
| K2 组件 | 3.1～3.5：`packages/design-system/` 里的组件客户端、工作台与沙箱框架装上 `molisComposer`；S-109；两个测试插件（一个注册 `composer_source`，一个用场景控件与提交适配）在临时 Home 里的高保真切片 | A（新建的组件文件归 A 独占，第 8 节第 2 项）；工作台与框架的装配行随这片落 | K0、K0c、K1 合入 | UIV-01～04、UIV-11、UIV-14～17（组件层）；VUX-16～18；UIC-05 键位与输入法（含 229）；UIC-06 一次提示只出现一次；UIC-07 挂载代次丢弃迟到结果；UIC-08 不支持的送达方式不可选且不降级；UIC-10 删项目、卸载插件后本机没有它们的草稿键；UIC-11 存储读写失败时就地提示、字不丢 |
| K3 首页与助理（第 11 批，与 K2 一起落） | `assistant-dock.ts` 等换成组件；草稿用助理的宿主适配；送达走 K0b；「发给」行接 03 定样与 PWA-130；`/`、`@` 进统一菜单；删掉被替换的私有实现 | A | K2、K0b 合入 | UIV-12、UIV-17（助理）；UIC-09 打断两步、发出后回到补充 |
| K4 Coding（第 11 批） | 主任务框换成组件（`kind: "ai"`），`draft.adapter` 接 Coding 现有的服务端会话草稿（`routes-sessions.ts` 的 `draft:<session_id>`），不搬到浏览器存储；同时删掉 `browser/draft.ts` 里的 `sessionStorage` 副本（`remember` 写、`local` 先读的那份），草稿只经服务端读写，不留第二份；adapter 的保存沿用现在那一个 PATCH，连同下一轮的选择（模型、方式等 `choices`）一起写，不只换 `draft` 字段，选择不丢；委托框只取编辑器层（`kind: "plain"`，统筹 11-04 定）；送达下拉换成 ▾ 菜单；模式选择改为场景控件 | B | K2 合入；可与 K3 并行 | UIV-12、UIV-13（场景控件与提交适配）、UIV-17（Coding） |
| K5 一个真实来源（第 11 批） | 一个 E 轨插件（推荐 Todo：对象有读取器、量小）声明 `composer_source` | E | K2 合入 | UIV-13（第二个插件，注册来源）；UIV-14 拒绝用例 |
| K6 其余入口 | 对 AI 说话的：IM、灵光、创作台、Shelf 终端行、7 个表单字段；决定理由型：评审反馈、Jelly 指令、Goals 退回（只编辑器层）；Issues、Pages 评论（plain 层，附件条以 Issues 为参照） | E（创作台、IM 等各插件），B（Coding 委托以外的 Coding 一族） | K3、K4 合入；排在第 11 批之后、第 16 批 C 段窗口之前（第 8 节第 3 项） | UIV-01（全部入口键位一致）；核账「已定的点」第 2、4、5 条 |

K0 与 K1 改不同的文件，并行；K0 由 C 轨排在 02 交接与 05② C-1 之后（或与 C-1 同一片），K0c 等 K1 定下类名。K3、K4、K5 改不同的文件，并行；按「一项交付完整做完才开 PR」，每片一个 PR，只有 K2 与 K3 合成一次落地（第 8 节第 4 项：让页面资源的净增长在 10 KB 内）。K2 是共享核心（SDK 类型在 K0），按共享核心跑全量，由统筹在整合分支跑。

## 6. 开工前检查

逐项回答[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)第 4 节。

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 新事实只有一项：「这个入口这个会话没发出的字」，没有主人存储的入口由组件存在本机浏览器存储（3.4）；已有主人存储的仍归原主人——助理按工作存的草稿归助理、Coding 按会话存的服务端草稿归 Coding，组件经 `draft.adapter` 读写，不出现第二份。送达方式与回执归 ai-input-receipts，接收者归挂载页与子代理合同，选中对象的正文归各自主人，都不出现第二个主人 |
| 2 | 插件同等待遇 | 组件经 SDK 的页面全局给所有插件，内置、个人、创作台生成、第三方同一套；来源经动作元数据注册、从目录读，宿主与工作台不写插件 id；沙箱插件经框架装同一份脚本。不新增构建期接线 |
| 3 | 能力注册 | 只新增一种动作角色 `composer_source`，在插件自己的动作声明里注册一次，页面从目录读；不新增平台动作。来源是只读查询，不等模型或外部服务，不需要 `scheduling: "concurrent"`；可信身份（项目、安装）取自调用上下文 |
| 4 | 合同 | 改：contracts 新子路径 `platform/composer`（资料身份用 05② 的 `MaterialRef`，不另起）、`ActionMetadata` 加一个可选字段、SDK 声明检查与 `page-globals.ts` 类型（K0，C1）；`AssistantSendInput` 加一个可选字段（K0b，A）；SDK `/ui` 加 `renderComposer`（K0c，A）。阶段 1 按 N35 原地改，不升版本。M1 之前，不留兼容期；新增字段都是可选，消费者在 K2～K6 换上。先单独开合同 PR |
| 5 | 放在哪个包 | 组件客户端在 `packages/design-system/`（与输入回执、长高、拖入同处，页面与沙箱都能装），首屏渲染在 SDK UI 子路径，类型在 SDK `page-globals.ts`，合同在 contracts。不是新的平台服务（没有宿主进程里的状态），所以不开 `horizontal/` 包；依赖方向不变 |
| 6 | 表与存储 | 不新建表、不新建存储。没有主人存储的入口用本机浏览器存储，键规则一处写在组件里；删项目、卸载插件后清掉对应的键（UIC-10）；助理的宿主草稿、Coding 的服务端会话草稿不变 |
| 7 | 兼容与迁移 | 不加。各入口旧的草稿键（IM／Pages／Issues 的 localStorage）在各自接入片里直接换成新键，不读旧键；助理与 Coding 的草稿不换存储，没有旧键问题；Coding 窗口里那份 `sessionStorage` 副本在 K4 删掉（见 K4 行），不读它；接入当时没发出的旧草稿会丢一次，在 PR 里写明（M1 之前，开发机之外没有装过） |
| 8 | 安全边界 | 碰动作网关与可信身份（来源动作的调用）和沙箱框架桥。新增 S-109（暂编），拒绝测试见第 4 节；不改 S-08、S-17 的文字，用例钉住它们在这里照样成立 |
| 9 | 调用次数 | 打开 `+` 菜单：读一次目录（与现在的 `/` 菜单共用一份，页面缓存到目录变化事件）；每个来源只在点开它的分组、打字停顿 250 ms 后查一次，只画最新一次的结果。发送：一次目标动作；选中引用由目标在这一次里核对，不逐个请求。草稿写本机存储，节流到 500 ms；不轮询 |
| 10 | 升级与数据 | 草稿键不带版本，升级不动；形状要变时按合同变更流程，不读旧键；助理的宿主草稿不变；已注册的来源随插件升级重新读目录，种类变了的旧选中项发送时按第 4 节第 4 条拦下并写原因 |
| 11 | 成果与过程项 | 不涉及：组件不产出成果，也不交过程项；附件由挂载页的 `upload` 交给原主人 |
| 12 | 页面与外壳 | 组件挂在插件自己的内容里或工作台已有的位置（首页底栏、助理浮层、插件主区），不出整页。不新增 DOM 事件（组件是函数接口）；若 K3 需要，登记在 `dom-events.ts`，按规则 4 同路径一起落。页面资源：K2 与 K3 一起落，K3 删掉助理的私有实现，净增长按 10 KB 以内打算；落地时实测，仍超过 10 KB 就带上字节数问用户（第 8 节第 4 项）。K1 的增长在它的 PR 写明 |
| 13 | 错误 | 新码用 `defineErrorCodes("composer", …)`：`composer.source_unavailable`（来源失效）、`composer.subject_unreadable`（选中对象读不到）、`composer.required_missing`（必填缺项）；`tooling/gates/error-owners.json` 加 `composer` 主人一行。不写 Error 子类 |
| 14 | 冲突面 | C1 独占：`packages/contracts/src/platform/`、SDK 非 UI 部分、`tooling/gates/api/`（K0）。D 独占：`packages/design-system/`、SDK `ui.ts`、组件板（K1）；其中新建的 `packages/design-system/src/composer*.ts` 与 `packages/plugin-sdk/src/ui/composer.ts` 归 A 独占（已写进[轨道表](../post-anticorruption-roadmap/reference/tracks.md#section-5) A 行），D 已有文件里的导出行由 D 评审。A：`services/assistant.ts`、`assistant-*.ts`（K0b、K3）。B：`plugins/native/coding/`（K4）。E：各插件（K5、K6）。热文件：`apps/workbench/src/plugin-frame.ts`、`page-assets.ts` 装配行随 K2 落；聚合文件 `scripts/gates/page-assets.mjs`、`tests/ci-product-subset.txt`、可能的 `dom-events.ts` 按规则 4 一起落。在途：#1761（助理底栏改 `<textarea>`）要先合，K3 在它之上 |

## 7. 预警

按[需求开发流程](../post-anticorruption-roadmap/reference/development-workflow.md)第 6 节，建议发一张，由统筹决定是否发到团队群：

1. **一句话**：输入框要换成一个公共组件，键位改成 Enter 换行、⌘↵ 发送，各插件自己的输入框和草稿键会被逐个替换。
2. **情形**：界面变化（三入口和其余对 AI 说话的输入框）；沉淀成横向能力（插件可注册 `+` 菜单里的来源）；页面资源会先涨后落。
3. **影响**：B（Coding 主框与委托框）、E（IM、灵光、创作台、Issues、Pages 评论、表单字段）、D（三处标本、SDK UI 子路径）、C1（合同）。
4. **方案**：本文。
5. **要谁回答**：统筹，已在 2026-11-04 答（第 8 节）。
6. **卡住哪部分**：现在只等 K0 合同与 K1 标本。
7. **时限**：1 个工作日。

## 8. 统筹的决定

统筹 2026-11-04 定（[#1791 评论](https://github.com/molis-ai/molis-work/pull/1791)），四项都按方案的推荐，另加三条：

1. **草稿存本机浏览器存储**，加主人适配（3.4）；已有主人存储的入口（助理、Coding 的服务端会话草稿）经 `draft.adapter` 接原存储，不改成浏览器存储（统筹 11-04 补定）。键名不带版本；删项目、卸载插件后清掉对应的键（UIC-10）；存储读写失败时就地提示、字不丢（UIC-11）。
2. **新建的组件文件归 A 独占**：`packages/design-system/src/composer*.ts`、`packages/plugin-sdk/src/ui/composer.ts`，已写进[轨道表](../post-anticorruption-roadmap/reference/tracks.md#section-5) A 行；D 已有文件里的导出行由 D 评审。
3. **K6 接在第 11 批之后、第 16 批 C 段窗口之前**，按插件拆给 E，键位一起改；写在[第 11 批](../post-anticorruption-roadmap/reference/batches/11.md)。
4. **K2 与 K3 一起落**，净增长按 10 KB 以内打算；落地实测仍超过 10 KB 时，带上字节数问用户（红线），现在不问。

安全编号：S-108 暂归第 18 批，S-109 暂归第 10 批，落地时按表顺延。
