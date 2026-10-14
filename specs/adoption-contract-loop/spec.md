# 采用合同与 Computer Use 闭环

状态：执行中（2026-10-13）。

把已经在 main 上的 Prologue 采用收成同一份合同，并补上桌面「看一次、点一次」还缺的那一截。防腐以 `docs/prompts/repository-anti-corruption.md` 为准，Computer Use 的禁区与挡法以 `specs/computer-use/spec.md` 的 D01–D19 为准。一个 PR 一个主题。

## 1. 要解决的事

编码轮次控制的公开 schema 只要求 `session_id`、`run_id`、`kind`。换模型要的供应商和模型、回答问题要的题目字段、补充要求要的文字，都是处理器才检查。schema 会放行处理器随后拒绝的调用。

灵光回复边写边出的阶段名写在宿主 `apps/local-host/src/lingguang-native-plugin-http.ts`。宿主在解释灵光的预览，而不只是按插件路由转发。

下发到浏览器的脚本可以少发注释和行首空白，但必须仍是仓库里的同一段程序、同一批名字。样式表不能把 `.a > .b` 收成另一种选择器。逐轮变更界面要能单独类型检查，不能再加一段没有页面类型的模板字符串。

桌面动作现在用观察当时的坐标。观察大约 10 秒就过期，看一次再做一次是两次来回。`surface-act` 的回执不带这一步之后的辅助功能树。模型也没有节点标识可点。

树被节点上限截断，或树里没有可点的东西时，模型仍然只看见字。当前 vendored 的 `prologue-sdk-0.0.0-rc.1-computer-use.tgz` 里，`UiAction` 没有节点标识，`UiSurface.perform` 返回空，`UiReceipt` 没有树也没有图。这一包表达不了「模型点一个节点」和「一轮中途收一张图」。不另放第三份 tarball，不改成每步都发图。Molis 这一侧把回执、过期坐标、注入前重算和「树不够才准备这一窗的图」做完；交不到模型手上的那一步停下并说明。

任务完成与否听模型自己说。窗口标题、文件和操作记录里的事实没有到，就不能算完成。

## 2. 不做

- 防腐第 4–6 波，把灵光整包迁到 Plugin Runtime，新开 `*-native-plugin-http.ts`，往工作台构建期插件名单加条目。
- 新增 `HostCapabilityDefinition` 或 `registerCapability`。模型调用仍只走 `horizontal/agent-host`。
- 换 SDK，私有 yield，多显示器，Intel，macOS 14/15，公证，OCR，重写屏幕悬浮条，右栏 Shelf。
- 抬 `tooling/gates/page-assets.json` 或健康门禁的阈值。不 `--admin`，不 force-push。
- 读旧形状，不写 `legacy`、`compat`、`backfill`、`goalboard`、`board_id`。
- 勾上没有新真机证据的 Computer Use 格子。屏幕锁着或有人在用这台机器时不跑真机，不发 Ctrl+Cmd+Q，不输入、不猜测密码。

## 3. 方案

### 3.1 编码轮次控制

`coding.runs.control` 版本留在 1。仓库里没有钉死 `coding.runs.control@1` 的引用。schema 用 `oneOf` 按 `kind` 写明必填字段，缺了就在动作校验处拒绝。处理器不再因为 schema 没要求的字段缺失而失败。页面、HTTP 和动作用同一份字段：`session_id`、`run_id`、`kind`，外加下表。受众仍只有 `user`。

| kind | schema 必填 | 旧调用 |
| --- | --- | --- |
| answer | `pending_id`、`pending_revision`，以及 `text` 或 `answers` 其中一份 | 字段齐全时仍有效 |
| steer | `text` | 同上 |
| stop、pause、resume | 只有身份字段和 kind | 同上 |
| switch-model | `provider_id`、`model_id` | 同上 |

模型是否在本插件的模型列表里，仍由处理器核对。那不是缺字段。页面上换模型仍从下一次模型调用起生效。

公开合同：`coding.runs.control@1` 的输入哈希从 `78d0a95586bb` 变为 `399b5b1e7ac5`，输出哈希仍是 `a2c799262a3c`。版本留在 1。调用方是页面、这条动作的 HTTP，和动作校验，三处读同一份 schema。仓库里没有工作流、Skill 或 MCP 钉死 `@1`。旧的五种 kind 在必填字段齐全时仍然有效。没有钉住这份输入的外部引用会按新 schema 被拒绝：只带 `session_id`、`run_id`、`kind` 的 `switch-model`、没有题目字段的 `answer`、没有文字的 `steer`。

### 3.2 灵光预览

回复流式预览的路径、开头阶段和进度帧移进 `plugins/native/lingguang`。宿主文件只按插件给出的帧转发，不再写出灵光的阶段名，也不解析预览正文。不新开 HTTP 装配。关掉请求仍不保存回复，输入留在页面上。

### 3.3 下发的程序

宿主可以继续去掉注释和行首空白。测试用宿主真正的下发函数证明：送出的脚本和源码是同一段程序、同一批名字；`.a > .b` 仍是 `.a > .b`。逐轮变更界面留在能单独类型检查的 TypeScript 模块里。体积变小才按实测改 `page-assets.json`。变大就先把脚本拆短。

### 3.4 桌面动作

`surface-act` 成功之后，驱动的回执带上这一步之后的辅助功能树。坐标来自一次已经超过约 10 秒的观察时，点下去之前拒绝，并说明要重新观察。动作带了节点标识时，助手在注入前用当时的树把标识解成落点，再做现有的落点核对；不用几秒前的坐标。截图仍进记录、给人看。树完整时，回执不给模型附图。树被节点上限截断，或没有可点节点时，才准备这一扇目标窗口的图。密码框和请求矩形相交，整张图仍不离开助手。窗口里的字仍是不可信内容。

当前 Prologue 包不能在一轮中途收下这一张图，也不能在 `surface-act` 上携带节点标识。准备好的那一张图不送进模型，这一步停下并说明，不改成每步都发图。不另造绕过 `surface-list` / `surface-observe` / `surface-act` 的工具。节点标识到不了现有的 `UiAction` 时，驱动侧的重算仍然留给带了标识的动作；模型路径在规格和测试里写明停在这一包上。

公开 API（`@molis-ai/molis-work-contracts/services/ui-surfaces`，快照 `tooling/gates/api/contracts/services/ui-surfaces.txt`）：

- `pointer` 增加可选 `node`。不带它的点击、以及浏览器驱动，仍按 `x`/`y` 工作。
- `perform` 的返回从 `Promise<void>` 改为 `Promise<HostSurfaceActReceipt | void>`。浏览器一步仍返回 `void`。桌面一步返回事后的树；只有树被截断或没有可点节点时才带 `model_image`。
- 新类型 `HostSurfaceActReceipt`。插件 SDK 的快照没有变。Prologue 的 `UiSurface.perform` 仍是 `Promise<void>`，适配器等桌面回执结束，不把回执交回 Prologue。

### 3.5 完成与否

完成只看事实：窗口标题、文件，或操作记录里出现要的结果。模型说完成但事实没有到，结果是未完成。二十步跨两个应用的那一格把这次的事实写进 `specs/computer-use/spec.md`。没跑就不勾。右栏 Shelf 不在这次。

## 4. 验收标准

1. **ACL-01** 只发 `kind=switch-model`、不带供应商和模型的调用，在 `coding.runs.control` 的公开 schema 处被拒绝。
2. **ACL-02** 回答问题缺题目字段、补充要求缺文字，同样在 schema 处被拒绝。字段齐全的 `answer`、`steer`、`stop`、`pause`、`resume` 仍通过 schema，处理器不因缺字段失败。
3. **ACL-03** 页面换模型仍提交 `provider_id` 与 `model_id`，并从下一次模型调用起生效。版本仍是 1，受众仍只有 `user`。
4. **ACL-04** 灵光回复仍边写边出现。关掉请求不保存回复，输入留在页面上。宿主那份 HTTP 文件不再写出灵光的预览阶段，也不解析预览正文。
5. **ACL-05** 一条测试证明宿主下发的脚本与源码是同一程序、同一批名字，且 `.a > .b` 保持不变。逐轮变更界面能单独类型检查。
6. **ACL-06** `page-assets` 对照 `origin/main` 通过。数字等于实测，只许变小。
7. **ACL-07** 桌面动作的回执带这一步之后的辅助功能树。过期坐标被拒绝。节点标识在落点核对之前重算成当时的落点。
8. **ACL-08** 树完整时回执不给模型附图。树被截断或没有可点节点时，只准备目标窗口的图。密码框相交时图出不去。当前包收不下一张中途图时，这一步停下并说明，不改成每步都发图。
9. **ACL-09** 模型说完成但窗口标题、文件和操作记录都没到，判定为未完成。事实到了才算完成。
10. **ACL-10** 二十步真机格按事实写入 `specs/computer-use/spec.md`。屏幕锁着或有人在用机器时写明没跑，格子保持未勾。

## 5. 验证

- `node scripts/run-tests.mjs tests/coding-run-control-contract.test.ts`
- `node scripts/run-tests.mjs tests/lingguang-actions.test.ts`
- `node scripts/run-tests.mjs tests/served-program.test.ts tests/coding-turn-changes.test.ts`
- `node scripts/gates/page-assets.mjs --base origin/main`
- `node scripts/run-tests.mjs tests/computer-use-act-loop.test.ts tests/computer-use-task-done.test.ts`
- `node scripts/check-health-gates.mjs --base origin/main`

碰了 contracts、agent-host 或跨三个以上包时，全量前先整体 `pnpm build`。

当前合同补记（2026-10-13）：coding.runs.control 输入形状改变，因此按现行合同规则用v2；不保留v1别名，不因没有外部固定引用而复用旧版本。同一runControl/schema、user受众与页面下一次调用换模语义保持。ADOPT-CONTROL-V2-01：公开schema拒绝缺字段、完整answer/steer/stop/pause/resume/switch-model可用，版本为2且页面/HTTP按当前定义调用；构建后更新实际动作快照与现行消费者，再按当前main检查。

ADOPT-CONTROL-V2-01候选验证（2026-10-13）：当前严格schema、v2和user受众在整体构建、实际动作快照、API、健康/边界以及三文件31条真实测试中通过，零失败/跳过/取消。页面与HTTP引用当前定义；没有内部消费者固定control v1，MCP/Agent本来不获此user-only动作。合入后才成为main现行合同，本验证不代替采用线其余桌面验收。
