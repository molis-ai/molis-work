# BL-411 短设计：停用插件残留回调调平台服务，不再把 Home 进程带崩（② 10-22，待 ① 批）

> 状态：设计稿，待 ① 裁 D1–D3；批之前不动工。基线 origin/main `f6f0b1fd3`。

## 问题（BL-411，#989 评审建议 1）

插件实例停用以后，它残留的定时器、监听器再调平台服务，服务会同步抛错，或者返回一个被拒绝的 promise。这些错误来自三处：
- `assertActive`（项目插件在 `apps/local-host/src/plugin-host-services.ts`，Home 插件在 `home-plugin-executor.ts:62`）；
- `requireGrant`（`packages/plugin-runtime/src/activation-context.ts`，撤销后抛 `plugin.grant_denied`）；
- UI 宿主的 `ui_host.plugin_denied`。

这些回调不在任何调用里，抛出的错没人接。宿主进程上一个 `uncaughtException` / `unhandledRejection` 处理都没有（F9），Node 默认直接退出，launchd 约 5 秒后拉起，进行中的 Agent 一并断掉。

## 两个方向

| | A. 停用后统一的惰性形状（推荐） | B. 进程级兜底 |
| --- | --- | --- |
| 做法 | 交给插件的服务对象在激活时包一层。实例停用以后再调，不抛错，也不产生任何效果：同步方法返回 `undefined`，异步方法返回一个永远不结束的 promise；同时给这个安装记一条诊断 | 平台给停用错误打上标记；宿主进程装 `uncaughtException` / `unhandledRejection`，只吞带标记的错误并记诊断，其余照默认退出 |
| 覆盖面 | 插件怎么写都兜得住：`await` 链、`.then` 链、把错包一层再抛，都碰不到错误 | 插件把错包一层再抛就失去标记，照样崩；派生出来的 promise 也可能漏掉 |
| 与「停用后不写业务记录」的关系 | 一致：没有效果 | 一致 |
| 触及面 | plugin-runtime 一处包装，Home 与项目两条装配都经过它 | 进程入口加全局处理器；它抢的是 F9 崩溃捕获（W5-13）的位置，两边要一起设计 |
| 风险 | 停用插件的 `await` 永远挂着，靠 GC 回收；见下面的「停用钩子」 | 全局处理器改了整个进程的崩溃语义 |

推荐 A。B 留给 F9：插件自己代码抛的错（与平台服务无关）仍会崩进程，这一类归 F9 的崩溃捕获，本片不管。

## A 的做法

- **一处包装**：放在 plugin-runtime 把服务交给插件的地方（实现前核准确位置：项目的 `plugin-host-services.ts` 与 Home 的 `home-plugin-executor.ts` 是否都经过 runtime 的同一个口；不经过就在两处各调同一个函数）。`revocableServices(services, state, onStale)` 逐个包函数：

```ts
// 伪码
try {
  const r = fn(...args);
  return isThenable(r) ? r.then(ok => ok, e => stale() ? pending() : Promise.reject(e)) : r;
} catch (e) {
  if (stale()) { note(); return undefined; }
  throw e;
}
```

- **只在停用以后改形状**：实例活着的时候，错误原样交给插件，行为一点不变。`stale()` 指激活已撤回，而且停用钩子已经返回。
- **停用钩子期间不变**：仍按现状抛错或拒绝，让 `stop()` 能走完。现在宿主等 `stop()` 没有超时（grep 没找到），要是钩子里的 `await` 永远不结束，停用就会卡住。
- **同步方法有返回值的**：实现时逐个核一遍。返回值不是 `void` 的，停用后返回 `undefined`，可能让插件自己抛 TypeError，那就成了 F9 的范围。若存在这样的方法，在 PR 里列出来。
- **诊断（D2）**：只放内存，按（项目、插件、安装、服务方法）计数。每个安装、每个方法第一次出现时写一行日志，日志不含参数与正文；计数出现在监督器给这个插件的状态里。
  - 不落库，也不写 `last_error_code`，免得盖掉真正的错误。
  - 这一行属于平台诊断，不算业务记录。
- **文档**：`skills/molis-plugin-dev/ui.md` 与 `docs/platform/UI-PLATFORM.md` 仍要求在 `stop` 一开始清掉定时器和监听器，另加一句：停用后服务调用没有效果、不抛错，异步调用不会结束。

## 测试（编号 BL411-xx，写在测试名里）

| 编号 | 断言 |
| --- | --- |
| BL411-01 | 一个已停用的宿主内假插件，残留定时器先调 `ui.invalidate()`，再 `await services.actions.invoke(…)`：进程上没有出现 `uncaughtException` 和 `unhandledRejection`（测试里挂监听器断言次数为 0）；没有动作调用记录，也没有发出 invalidate；该安装的诊断计数为 2 |
| BL411-02 | 实例活着时，服务的错误照样交给插件（包装不吞活着时的错） |
| BL411-03 | 停用钩子里 `await` 一个服务，仍然得到拒绝，`stop()` 能走完 |
| BL411-04 | Home 级插件与项目级插件各跑一遍 01 |

## 要 ① 裁的

| # | 问题 | 推荐 |
| --- | --- | --- |
| D1 | 走 A（统一惰性形状）还是 B（进程级兜底） | A；B 并进 F9 |
| D2 | 诊断落哪 | 内存计数加首次日志，在插件状态里能看到，不落库 |
| D3 | 要不要安全不变量 | 不要：这是稳定性，不是安全边界；「停用后没有效果」现有规则已经要求，这片只把「抛错」改成「无效果」 |

## 规模与冲突

- **规模**：一个 PR，约 200 行。改 plugin-runtime，属共享核心，进批。
- **冲突**：开工前 `gh pr list` 核 `plugin-host-services.ts`、`home-plugin-executor.ts`、`activation-context.ts` 有没有在途改动；S0-2b-3（服务 gate 按实例区分）若同时在做，会碰同一批服务文件，两边先后排开。
