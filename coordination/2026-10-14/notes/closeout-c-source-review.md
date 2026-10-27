# C 暂停时的最新源码复审：009b773f

**P1-C02-1 的源码修复可接受；本轮未发现新增 Blocker/P1。** 取消首个 Notion 调用不再决定同账号其他有效等待者的结果，取消者仍以自己的原始错误退出。该结论补齐此前 1dad/2b 的源码评审，不将作者定向验证或本轮源码复审等同于 FI-C-02 全部独立验收、整批 C 采用或 Full 通过。

固定范围 `2b8c8ccc3e3f7a2f5e3b824afa584099fb3288a0` → `009b773f060ac61ceaa041b68d7681e075709b0a`，tree `0d716a408bb6de3f8ff1303c3050c66af2377678`。31-notion-shared-checkpoint.json 的 parent/head/tree 与 Git 固定对象一致；实际仅 notion-oauth.ts、connector-oauth-choice.test.ts 和原 spec §13 三路径 139+/13−。clean 是提交时的交付记录；本轮未读取或要求 实现方 当前工作树不变。

### 修复与调用边界

- `notion-oauth.ts:18–64` 继续使用原 Home/账号刷新 Map，只把条目扩为该次操作的参与者与 Promise。每个调用在 190 行先以自己的 beforeEffect/current 认权，再同步 join；参与者保存的是各自显式控制，不把首个调用的 signal 直接当成共享 signal。
- 取消事件只移除对应参与者及其监听器；最后一名参与者退出时置 ended 并 abort 共享控制。同步 current 和异步 beforeEffect 会剔除已失效参与者，至少一名仍有效时才允许共享操作继续。当前生产 sourcePull 的控制捕获原 scope/gate/账号/槽，调用它不会改用共享刷新所处的另一个调用上下文。
- 共享 fetch 在发送/响应时走共享控制，Notion token 的 JSON 解析完成后，221 行再 await 共享 beforeEffect，随后同步 current、原 refresh-token 比对、原 beforePersist 账号 revision 检查，最后进入原同步 saveTokens；这一段没有新增等待。没有有效参与者时无法写 access/refresh/workspace，也不能产生后续 API 读取。
- 已 ended 的条目不会接纳新调用，200 行创建新的操作；旧 finally 只在 Map 中仍指向自己的 pending Promise 时删除（226–228 行），因此不会删除同键后来的操作。操作正常结束会 close 并移除监听器；各方在 234–238 行返回或处理失败时仍核自己的控制，失效方抛自己的取消/授权错误，有效方可以消费合法共享结果。
- 原同 Home 单请求去重、跨 Home 隔离、账号 revision、refresh-token 一致性和同步持久化顺序保留；没有新增持久化表、队列、公开合同或新连接器范围。旧条目结束/新条目接替的 Promise 身份保护本轮是源码核对，新测试未单独制造该交错，不扩大为运行证明。

### 反例及作者运行原件

新增用例确实调用 `createCatalogConnector → resolveApiConnection → resolveUsableNotionToken`，没有替换 resolver 或共享逻辑；只有 HTTP 响应被控制。第一调用进入 token 请求后才启动第二调用，排空其入组微任务后检查只有一次请求；分别取消 0、1、两者，再放开响应。断言包括共享传输是否中止、取消者与自身 signal.reason 的对象一致性、幸存者 fulfilled 且 ok、只有一次 token 请求、真实 access/refresh/workspace 存储及账号 revision；两者取消时没有 API 读取或重试。原同 Home 去重/跨 Home 隔离测试没有放宽。它是实际 Catalog/凭据接线的反例，不冒称本用例重新跑了完整 Runtime 或真实外网 OAuth。

27 明确为 fixture setup 失败（OAuth 凭据尚未保存完整），不计产品反例。28 原 log 则在作者所称旧生产实现上，cancel 0 于“one remaining caller owns the shared request”断言得到 true 而期待 false，cancel 1/both 通过；父用例与子用例失败不计成两个独立缺陷。该记录支持此前所报首个调用控制污染共享请求的根因。

29 整体 pnpm build 自然 exit 0、17.332032 秒；workspace 报告 3/64 包构建、61 未变，随后根 clean/tsc/pty/manifest 链完成。30 两份整文件定向运行自然 exit 0、5.044823916 秒，jobs 1、browser-jobs 1、retries 0；原 log 报告 connector-oauth-choice 9/9（包含新增子用例）、security-invariants-connection-refresh 11/11，不重复累计子用例。

**证据归属须按原件表述：** 27～30 的 JSON 中 head 均仍是 2b8c8ccc；29/30 是提交前工作树上的作者运行，31 检查点及交付说明把修复后的源码和这些记录归到 009b773f。不能把 29/30 说成干净 2b 源码已通过，也不能说原件自带 009b 的独立执行绑定。本轮没有重建、重跑、重新计算源码摘要或独立 独立测试 结果。

既有 FI-C-02 timeout/close 的验证边界、Inbox 独立运行、业务 FI-C-03～07、SYS52、API/actions/其他最终生成物及整批 C Full/采用结论保持原范围；不因本 P1 修复扩大关闭。唯一写入为本报告，未运行测试、构建、门禁、浏览器、push 或云 Full。
代码已随暂停检查点 [fe93d322](https://github.com/molis-ai/molis-work/tree/fe93d322ff52813224e1e281816f237263b6fa04) 推送；本复审晚于该检查点里的“复审尚未收到”记录。该时间差只更新复审状态，不代表 C 批完成。
