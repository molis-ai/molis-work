# PG-038 平台一半：随激活存活的后台作业（设计稿，交 ① 批）

② 写，2026-10-21。① 选了 Y（#955 里 ③ 列的两条路之一）。这份稿子按 ① 要的六点写，批之前不写代码。行号取自 `feat/c8-1-work-executors`（从 `f52677501` 开）。

**10-21 ① 已批，附一处收窄（下面各节已按批复改）**：
- 「调用取消、撤权后作业还写」不是 ① 定的例外，是用户 10-12 定的窄例外（`specs/repository-anti-corruption/spec.md` §12.10）：撤权以后只收敛已经派出的那件事的实际结果和回执，不发起新的业务请求、不继续交接、不以记回执为名派发下一步。§3.5 条文与 §4.2 已改。
- 作业的 control 里没有原调用者的身份和受众；作业发出的动作调用都算安装自己的（`plugin` 受众），调不到只给原调用者受众的动作，也不记成原调用者做的。§3.3、§3.5 已写，§3.5 加第 11 条拒绝测试。
- 200 ms 复查改成每个激活共用一个定时器；从库里重读安装记录放到写的时候和这个共用定时器里做（§3.3）。
- 「已提交」改成「通过了最后一次授权检查」；之后提交失败，作业找不到要跟的东西，不写任何东西就结束（§3.1）。
- ① 要核的 Coding 唤醒循环 actor：核过，宿主不把它当可信身份，见 §4.4。

## 0. 一句话

在现有的 `services.background` 上加第二种用法 `keep(job, work)`：作业属于插件的这次激活和一个项目，用插件自己安装的权限跑。它只能在三处登记：插件自己的命令提交之后、激活的 `start()` 返回之前、同一激活同一项目的另一个作业里。插件停止、安装撤权、项目关闭或删除、Home 关闭时作业停，单次调用取消时不停。停了以后，经平台服务的写一律拒。

## 1. 现状（核过的事实）

- **有限执行（`services.background.start`）**
  - 合同在 `packages/contracts/src/platform/plugin-background.ts:3-14`，实现在 `packages/plugin-runtime/src/background-service.ts:13-74`。
  - 只能在本插件声明了 `background_job` 的并发 command 里受理（`:26-32`）。
  - 它一直拿着原调用的授权（`retainBackgroundAuthority`，`:40`），原调用被撤权或取消，执行就停。
  - 执行记着受理它的项目，删项目时按项目停（`stopProject`，`:65-68`，C4 做的）；插件停止时全停（`close()`，`:69-73`）。
  - 只给宿主运行的定义，沙箱不给（`apps/local-host/src/plugin-background-service.ts:5-7`）。
- **Coding 的跟随者和唤醒循环不在平台里**
  - 跟随者在 `plugins/native/coding/src/start-round.ts:31-69`，`:213-216` 在 `finally` 里起它。唤醒循环在 `wake-loop.ts:105-138`。
  - 两者都挂在模块级的 `activations` 表和 `setTimeout` 上（`route-activation.ts:42-67`），靠 `AsyncResource.bind` 绑在 `start` 那一刻的上下文里，不在任何动作范围内。
  - 平台服务对动作范围以外的写不问调用者（`packages/plugin-runtime/src/action-scope.ts:88-92`，`if (!scope) return;`），只看激活还在不在、授权还有没有。
  - 跟随者写会话状态前只问「激活还活着、没有更新的一轮接手」（`stillFollowing`）。
  - R-CODING-RECEIPT-01/02 要求：调用在 Run 受理之后被拒或取消，这个 Run 还要继续跟到底（`tests/coding-session-follow.test.ts` 的 `cancel-receipt`、`revoke-receipt`；`tests/coding-message-wait.test.ts:105`）。
- **撤权**：运行中的插件不能改授权（`packages/plugin-runtime/src/index.ts:377-379`，先停再改）。所以「安装撤权」在 Runtime 里总是先停、撤销激活（`revokeContext`，`:712-717`）。
- **授权快照**：项目实例的授权是激活时冻住的快照（`activation-context.ts:6-24`）。Home 实例每次重读安装记录（`home-plugin-executor.ts:60-64` 的 `activeRecord()`）。
- **项目关闭**：`closeProjectRuntime`（`project-host.ts:432-441`）→ `releaseProjectPlugins`（`project-plugins.ts:79-101`），项目插件全停。Home 插件在这个项目里的执行不受影响：关闭时没有任何一步通知 Home 实例。
- **删项目**：
  - `ProjectDeletionService` 先 `releaseProject`，也就是先关项目（`project-deletion-service.ts:26-40`），再删目录。
  - 删目录时，`plugin-project-cleanup.ts:61-95` 先 `stopProjectBackground`，再关库、purge。
  - 这满足裁定 7（`privileges.md:305`）：删之前先经后台作业服务停掉该项目的作业。

## 2. 合同草案

```ts
// packages/contracts/src/platform/plugin-background.ts
export interface PluginBackgroundClient {
  start<T>(...): Promise<PluginBackgroundExecution<T>>; // 有限执行，不变
  /**
   * 随这次激活存活的作业。只在三处登记：本插件的命令在提交之后，激活的 start() 返回之前，同一激活同一项目的另一个作业里。
   * 作业只有安装自己的授权，不带原调用的授权；单次调用取消不停它。
   */
  keep(job: string, work: (control: PluginJobControl) => Promise<void>): PluginKeptJob;
}
export interface PluginJobControl extends PluginExecutionControl { readonly job: string } // signal、beforeEffect、assert_authority_current、project_id
export interface PluginKeptJob { readonly done: Promise<void>; cancel(): void }
```

Manifest 声明（v2 顶层，新字段）：

```ts
background?: { jobs: readonly { job_id: string; reason: string; permissions: readonly string[] }[] }
```

- `keep()` 只认声明过的 `job_id`，没声明的拒（`plugin.background_undeclared`，和有限执行同一个码）。
- `permissions` 必须是 Manifest 已声明的权限（SDK 查）。登记时要都有授权，之后每次写前、每 200 ms 都再查一遍。
- 声明了作业的定义，`hasPluginBackground` 就给 `services.background`。删项目时的「只停后台作业」那一步也自动带上它。

## 3. ① 的六点

### 3.1 启动点

1. **通过最后一次授权检查之后登记**。平台在动作范围里记一笔：原调用的 `beforeEffect()` 成功返回过一次就置上（插件拿到的 `caller.beforeEffect`，即写之前的那次授权检查）。
   - 在动作里调 `keep()`，要满足三条：范围属于本安装、动作是 command、通过过授权检查。
   - 调用在通过授权检查之前被拒或取消，`keep()` 拒（新码 `plugin.background_job_unchecked`），什么都不登记。所以 Run 没受理时作业也不登记，S-18 照旧。
   - 通过之后调用再被取消或被撤权，`keep()` 照样收：受理的东西已经在外面了（Run 已经开始），作业接着跟，正是 R-CODING-RECEIPT-02 要的。
   - 通过检查之后的提交本身失败了（比如 Run 没开成），作业找不到要跟的东西，要能不写任何东西就结束：作业的 `work` 自己判断，平台不替它补任何记录。
   - Coding 现在在 `finally` 里起跟随者，迁过去以后写法几乎不变。
2. **激活时恢复（唤醒循环）**。平台在执行 `definition.start()` 时开一个「启动窗口」，`start()` 返回就关。
   - 窗口内、不在任何动作里的 `keep()` 收，记为恢复作业。
   - 窗口关了以后，在动作和作业以外调 `keep()` 一律拒（`plugin.background_job_origin`）。例如在 `start` 里设一个定时器，过后再登记，不行。
3. **作业里起作业**。作业的 `work` 在平台的作业范围里跑，用的是和有限执行一样的 `runInPluginAction` 一类范围，作业范围内调 `keep()` 收。
   - 这样跟随者发现一轮停在等待上，就能起唤醒循环；唤醒循环接上下一轮，也能起新的跟随者。
   - 新作业继承原作业的项目。

作业的项目从哪里来：

- 动作登记的，取自调用（`caller.project_id`）；
- 恢复作业取激活的项目。项目实例本来就是一个项目一份；Home 实例的恢复作业没有项目；
- 不从插件的输入或存储读。

所以 Home 插件在 `start()` 里不能为某个项目起作业，要等那个项目里有一次提交过的调用。

### 3.2 停止条件

| 什么时候 | 怎么停 | 现在有没有 |
| --- | --- | --- |
| 插件停止、停用、卸载、升级或回滚、崩溃、隔离 | Runtime `revokeContext` → 宿主会话 `revoke` → `background.close()`，所有作业的 signal 中止，之后检查都拒 | 有限执行已有，作业并进同一张 `active` 表 |
| 安装撤权 | Runtime 要求先停再改授权，所以走上一行。每次检查还按库里那份安装记录比安装编号、代次、状态和作业声明的权限（见 3.3），库里的记录被改也拒 | 重读记录这一项是新的（项目实例原来只有冻住的快照） |
| 项目关闭 | 项目实例：随 `releaseProjectPlugins` 停。Home 实例：`closeProjectRuntime` 新加一步，对每个 Home 会话调 `background.stopProject(projectId)` | Home 那一步是新的 |
| 项目删除 | 先关项目（上一行就停了），之后删目录前的 `stopProjectBackground` 再停一次 | 已有（C4），作业自动带上 |
| Home 关闭 | 先使全部安装失效，所有会话 `close()` | 已有 |
| 单次调用取消、原调用被撤权 | **不停**：作业不拿原调用的 signal，也不拿它的授权 | 新的语义，只对作业 |

- 「项目关闭」这一行只改作业，Home 插件的有限执行照旧：它本来就带着原调用的授权、登记和项目（S-18）。要不要也随项目关闭停，留作以后的问题，不在这片做。
- `cancel()` 由插件自己调，比如更新的一轮接手了会话。

### 3.3 每次写之前的检查

作业的 `beforeEffect()` 与 `assert_authority_current()` 都同步查下面这些。和有限执行的 `check` 同样的结构，只是不带原调用的授权：

1. 作业还在跑：没被 `cancel`，没被 `stopProject`，`close()` 没发生；
2. 激活还活着（宿主会话的 `assertActive`）；
3. **安装还是这一份**：宿主给的 gate 多一项 `assertInstallationCurrent()`，从库里读这份安装的记录，要满足：
   - 状态是运行中；
   - 安装编号和代次与激活时一样（口径同 S-18 的 `validate_authority`：同库、比代次）；
   - 授权覆盖作业声明的权限。

   Home 实例直接用现有的 `activeRecord()`，项目实例按 `runtime.get(installId)` 写同样一行。
4. 项目没被停：对 Home 实例来说，就是没被 `stopProject`。项目实例的激活本来就是这个项目的。

另外，每个激活共用一个定时器（有作业在跑时才开），每 200 ms 对所有作业跑一遍同样的检查，不过就中止那个作业的 signal，让正在等的 `waitRun`、`awaitContinuations` 及时退出。从库里重读安装记录（第 3 项）只在写的时候（`beforeEffect`、`assert_authority_current`）和这个共用定时器里做。

**作业的身份**：作业的 control 只有 `job`、`signal`、`beforeEffect`、`assert_authority_current` 和项目，没有原调用者的身份、受众、页面上下文和授权。作业范围里的调用者是安装自己：
- 作业发出的动作调用（本插件自己的动作和消费的动作）一律按 `plugin` 受众、本安装的身份发，调不到只给 `user`、`mcp` 等受众的动作；作业里拿着请求的路由 control 去调也拒；
- 宿主能力（typed）照旧按激活的 `HostPluginCaller` 发；
- 作业在自己的操作编号里跑（宿主给一个新的 call id），调用记录、成果作者都不出现原调用者。

**停了以后不再写任何业务记录**：

- 作业的 `work` 跑在作业范围里，范围里的 caller 就是作业的 control。平台的存储、库、项目库、文件、事件、动作调用在写之前都会问当前范围（`assertPluginActionCurrent`，`action-scope.ts:88`）。所以插件就算忘了自己调 `beforeEffect`，经平台服务的写也会被拒。
- 这一点比现在严：现在跟随者在范围以外写，平台服务不问。
- 插件进程里的内存状态不算业务记录。

### 3.4 和 PG-038 剩下的「按项目停」、裁定 7 的关系

- **「按项目停」**：删项目按项目停，C4 已经给有限执行做了；`privileges.md:429` 那行还写「还剩按项目停」，是旧的，本片顺手改。还剩的是：
  - 作业也按项目停；
  - Home 实例在项目**关闭**时停，不只是删除时。

  两件都落在同一张 `active` 表和同一个 `stopProject` 上。
- **裁定 7**：删项目的顺序已经是先关项目（作业停）、再停后台、最后关库和 purge，作业并进去就满足，不另加 Runtime 钩子。
- **能不能一片做完**：能。平台这一片包括：
  - `keep()`；
  - 作业范围；
  - 安装记录重读；
  - 启动窗口；
  - Home 实例在项目关闭时停；
  - Manifest 的 `background.jobs`；
  - 文档和不变量。

  按项目停和裁定 7 不另开片。Alchemist 不迁，防腐收尾后删（`alchemist-builder-deleted` 的决定）。

### 3.5 安全不变量和拒绝测试

**建议新加一条不变量**（编号开 PR 时再取）。理由：S-18 讲的是「调用」和「原调用授权下的有限执行」，作业是第三种主体，它的授权是安装的，不是调用的。

- **条文要点**：
  - 只能在三处登记（动作通过最后一次授权检查之后、激活 `start()` 里、作业里）；
  - 只有安装自己的授权；control 里没有原调用者的身份和受众，作业发出的动作调用按 `plugin` 受众、以安装的身份发，调不到只给原调用者受众的动作，也不记成原调用者做的；
  - 停止条件就是 3.2 那张表；
  - 停了以后经平台服务的写一律拒；
  - 单次调用取消、撤权不停，只在用户 10-12 的窄例外里成立（`specs/repository-anti-corruption/spec.md` §12.10）：作业只能把已受理的那件事跟到底、记下真实结果，不能以原调用者的名义发起新的业务；
  - 沙箱定义没有这项服务。
- **S-18 加一句**：已提交调用登记的随激活作业属于安装，不属于该调用，见新条。

**拒绝测试**放新文件 `tests/security-invariants-activation-jobs.test.ts`。它在 `test:security` 的 `tests/security-invariants-*.test.ts` 通配里，CI 的 `security-invariants` 作业会跑（这个作业现在还不挡合并）。其中快的几条（单进程、几秒）同时加进 `tests/ci-product-subset.txt`，让它们挡合并。

用例：

1. 提交前被拒或取消的调用：`keep()` 拒，什么都没登记；
2. `start()` 返回以后，在动作和作业以外的 `keep()` 拒；
3. 没声明的 `job_id` 拒；在沙箱定义里拿不到 `services.background`；
4. 插件停止以后，作业的 signal 中止，存储和事件的写被拒（作业没有自己调 `beforeEffect` 也拒）；
5. 库里的安装记录被撤掉授权：200 ms 内中止，`beforeEffect` 拒；
6. 升级换了代次：旧作业的写被拒；新激活的 `start()` 恢复出新作业（正面）；
7. Home 实例：项目关闭时这个项目的作业停，别的项目的不受影响；
8. 删项目：作业在 purge 开始之前已经停（比顺序）；
9. Home 关闭：全停；
10. 正面：调用在通过授权检查以后被取消，作业照常跑完、照常写（R-CODING-RECEIPT 的语义搬到平台）；
11. 假插件经 MCP 调用登记一个作业，MCP 授权撤掉以后，作业还能写自己的收尾记录；但它以原调用者受众去调只给 `mcp` 的动作被拒，记录里（调用记录的调用者、存储里平台记的作者）也不出现原调用者。

### 3.6 切片

- **PG038-P（②，进批）**：
  - 改动范围：contracts（`plugin-background.ts`、Manifest 类型）、plugin-sdk（Manifest 检查）、plugin-runtime（`background-service.ts`，作业部分单拆一个文件，不让它变成巨大单元）、local-host（两个执行器的 gate、项目关闭时的 Home 一步）、文档（`docs/platform/PLUGIN-DEVELOPMENT.md`、`skills/molis-plugin-dev/host.md`、`GLOSSARY.md` 3.4 节加「随激活作业」）、新不变量与测试。
  - kernel 不动，不需要按 PG-110 问 ③。改了共享核心，进批。
  - 动作快照不变，API 快照会变（`pnpm api:update`）。
- **Coding 迁过去（③，等 PG038-P 合入）**：
  - Manifest 声明两项作业（跟随、唤醒）；
  - 跟随者和唤醒循环改用 `keep()`；
  - 删掉模块级的 `activations` 表和 `setTimeout` 的 `pause`，改用 `control.signal`；
  - R-CODING-RECEIPT-01/02 和 W5-01-CODING-21 的断言不改。

## 4. 会不会放宽什么（逐条核过）

1. **授权**：不放宽。作业只有安装自己的授权，没有 `retainAuthority`，不能替原调用做原调用能做而插件不能做的事。插件的路由和激活代码今天就以这个身份跑。
2. **「被取消的调用不写业务记录」**：作业在原调用被取消、撤权后还写，只在用户 10-12 定的窄例外里成立（`specs/repository-anti-corruption/spec.md` §12.10）：只收敛已经派出的那件事的实际结果和回执，不发起新的业务请求、不继续交接、不以记回执为名派发下一步。平台能强制的部分：作业没有原调用者的身份和受众，发不出原调用者才能发的调用（§3.3「作业的身份」）；「只跟已受理的那件事」靠插件，条文写明，Coding 的迁移按它改。今天 Coding 已经这样写，而且宿主运行的插件本来就能用自己的定时器在动作范围以外写，所以搬进平台没有新增能力，多了停止的保证、写前检查和身份收窄。
3. **沙箱**：不放宽，沙箱定义照旧拿不到 `services.background`。如果以后要给生成的沙箱插件开，那是信任边界的事（HANDOFF §10），要问用户。
4. **身份**：作业的 control 里没有人。
   - Coding 的唤醒循环开下一轮时，用的是它自己存储里记下的 actor（`wake-loop.ts:59-63`），经 `startRound` 放进 `agent.session.create.v1`、`agent.run.start.v1` 的输入。
   - **① 要核的一项，核过了，没有违反**：宿主那边 `horizontal/agent-host/src/capability-registration.ts` 的 `assertInputOwner` 要求输入里的 `actor_id` 等于调用上下文绑定的 `HostPluginCaller.actor_id`（激活的 actor，`plugin-host-services.ts` 的 `hostPluginCaller`，来自项目运行环境，不来自插件），不等就拒；等的话，记进会话、Run 的身份也是用调用上下文的那份覆盖（`{ ...request, ...caller 的四项 }`）。`cancelSubagent`、`releaseProjectRound`、协作的 `control`/`revise` 同样取调用上下文。所以存储里的 actor 只是一份被宿主核对的回声，成不了可信身份，不用记 BL。③ 迁移时可以顺手去掉 `actorOf`，直接用激活的 actor，写进 ③ 那一片的清单（可选，不是缺陷）。
   - 平台不给作业一个人的身份，也不从存储读身份去做授权。
5. **Home 实例的项目**：作业的项目只从调用或激活来，Home 实例在 `start()` 里不能为某个项目起作业。这比「插件自己记着项目、开机就起」严。

我没找到会放宽的地方。

## 5. 按推荐做的决定（取舍写进 PR 正文）

- **用同一个 `services.background`，不另开 `services.jobs`**：Manifest 门槛、`close()`、`stopProject`、删项目那一步都共用。
- **作业要在 Manifest 里声明**（`background.jobs`）：
  - 任何插件都能用，平台要知道作业靠哪些权限活着，不在运行时信插件；
  - 安装时看得到这个插件会在后台做什么；
  - 和有限执行要求声明 `background_job` 是同一个思路。
  - 界面上的显示另开 BL，编号开 PR 时从 350–369 里取。
- **「已提交」由平台记**，插件不能自己声明：它跟着 `beforeEffect()` 的第一次成功走，不另加 API。
- **项目关闭停 Home 插件的作业**，有限执行这次不跟着改。

## 6. 顺带

- `privileges.md:429` 的 PG-038 行写「还剩按项目停」，是 C4 之前的旧话，本片改。
- `specs/repository-anti-corruption/spec.md:803-807` 与 `docs/platform/PLUGIN-DEVELOPMENT.md:168,434` 讲后台限制的几段，本片一起改。
