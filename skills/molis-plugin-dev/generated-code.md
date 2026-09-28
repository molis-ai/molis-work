# 生成插件：代码怎么写（代码 Agent 的标准）

一个生成插件的后端是一组"操作"，每个操作是一个文件，跑在隔离的沙箱进程里。你每次只负责任务里的这一个操作；说明书（`contract.json`）已经冻结，你按它写，不能改它。

## 构建目录里有什么

`contract.json`、`manifest.json`、`package.json`、`src/index.ts`、`src/operations/<序号>.ts`、`tests/operations/<序号>.ts`、`developer/README.md`（写法范本）、`developer/sdk.d.ts`（SDK 类型）、`developer/capabilities.json`（平台能力说明）。没有别的说明文件，不要去找 tsconfig 或 node_modules。

- 可写：`src/**/*.ts`（除 `src/index.ts`）、`tests/**/*.ts`、`package.json`。
- 任务里有 `writable` 时，别的操作正在同时写，你只能写 `writable` 列出的两个文件。共用的逻辑写在自己的文件里，沿用 `shared` 里已有模块和已实现操作的键名约定（只读，不要改）。
- 冻结：`contract.json`、`manifest.json`、`src/index.ts`、`developer/`。
- 任务里已经给了你要的一切：本次操作的合同、要写的两个文件、其他操作（`implemented: true` 的已通过检查）和已有共享模块。只在要沿用约定时读已实现的文件；不要反复读范本和合同，轮次有限。

## 实现

- `src/operations/<序号>.ts` 默认导出 `async function operation(input: SandboxJson, sdk: SandboxSdk): Promise<SandboxJson>`，类型从 `'@molis/plugin-sdk'` 导入。
- 要存取、返回的记录类型写成 `type Entry = { id: string; ... }`，不要用 `interface`：interface 不能直接当 `SandboxJson` 传（类型检查会报缺少索引签名）。
- 存储：`sdk.storage.get(key)` 返回值或 `null`；`set(key, value)`；`delete(key)`；`list(prefix)` 返回 `[{ key, value }]`。每个 SDK 调用都 `await`。
- 同一插件的所有操作共用一份存储，键名约定必须一致（例如每条记录存成 `'note:' + id`）。已有实现就沿用它的约定。第一个写数据的操作总是单独先写，由它定下约定；几个操作都要用的读写逻辑由它放进 `src/store.ts` 这样的共享模块。
- 只用普通 JavaScript（Date、Math、JSON、Map…）；不能用 Node、网络、crypto、eval。需要常见的纯 JS 包时写进 `package.json`，由宿主安装（禁止安装脚本）。
- **返回值严格符合合同的 output**：字段不多不少、类型一致。存储里可以多存字段，返回时只挑合同声明的。
- 合同声明的错误：`throw Object.assign(new Error('中文说明'), { code: '合同里的 code' })`。
- TypeScript 是严格模式：先把 input 断言成具体类型（`const { text } = input as { text: string }`），从存储读出的值先检查再用；旧数据可能缺新字段。
- 需要"今天""本月"时用 `new Date()`（沙箱里是真实时间），不要写死日期。

## 调用平台能力

- 只调用本操作合同 `effects.capabilities` 里列出的能力：`await sdk.capability.call('<能力 id>', 输入)`，输入输出按 `developer/capabilities.json` 里该能力的说明。
- 检查、例子和测试里，平台能力由替身代答（写入类不会真的写到别处）。测试只断言替身结果的结构或你自己保存下来的内容，不断言别处的真实数据。
- 合同里声明的能力和网站必须真的调用：只返回写死的数字、从不访问网站或不调用能力，检查会直接判为不通过。
- 能力要幂等键（`idempotency_key`）或请求号时，由代码按稳定业务身份生成并保存；同一意图的重试必须复用，用户发起新的意图才换键。例如一份已保存草稿的同一修订发布用 `publish:${draft.id}:${draft.revision}`，修订不同才产生新键。不要在每次尝试里用 `Date.now()` 或随机数重新生成，也不要让用户填写内部键。先持久化请求身份，再调用能力；超时后保留该身份用于重试。
- **联网**：`const response = await sdk.network.request({ url: 'https://…', method?: 'GET', headers?: {…}, body?: '…', secretRefs?: ['名称'] })`，返回 `{ status, headers, body }`（body 是文本，JSON 自己解析）。只能访问 effects 里 `networkDomains` 列出的域名；不跟随重定向，响应超过 1MB 会报错。安装前读取（GET）会真的访问批准的网站，写入（POST 等）由替身代答 `status 200, body ''`。测试不能伪造网站的回答：只断言结构和你自己保存的内容；解析失败、状态不是 2xx 时给出合同里声明的错误，不要崩。
- **到点提醒 / 定时执行**（`reminders.add`、`schedules.add`）：时间用 `new Date(...).toISOString()`，要能取消就把返回的 id 存下来。定时执行只能运行这个插件自己的功能，`inbox: true` 时那项功能返回的 `text`（没有就用 `summary`）会成为一条收件箱事项，所以被定时运行的功能要返回一句给人看的 `text`。两者在检查和试用里都由替身代答，安装后才真正设置。
- **调用模型**（`model.generate`）：先在本操作文件里 `export const prompts = [{ id: 'hint', title: '启发提问', purpose: '…', body: '给模型的要求' }] as const;`（全部字面量，id 插件内唯一），再 `const { text } = await sdk.capability.call('model.generate', { prompt: 'hint', input: '要处理的内容' }) as { text: string }`；不要传 `instructions`，也不要把输入拼进要求（用户会在设置里改这些要求）。替身代答为 `'［模型替身］' + input 前 40 字`。body 按操作描述写清楚模型只输出什么、格式和长度（例如「只输出一个启发式问题，不超过 50 字，不要编号、不要解释、不要给答案」）；把去掉首尾空白后的回答存下来；要结构时写清格式并容错解析，解析失败保留原文。

## 测试

- `tests/operations/<序号>.ts` 导出 `export const tests: SandboxTest[] = [async (sdk, call, assert) => { … }, …]`，每个元素是一个 async 函数，不是对象。
- `call(input)` 调用本操作；同一操作的测试按顺序运行、共享一个隔离存储，可以用 `sdk.storage.set` 预置数据。
- 断言只有 `assert.same(实际, 期望)`、`assert.includes(实际, 部分)`、`await assert.rejectsCode(() => call(input), 'code')`；每个测试至少一个断言。
- 至少覆盖：正常结果、合同里每个错误 code、后续测试依赖的持久化效果。测试里不断言当前日期的具体值，用输入给出的日期来测。

## 文件与检查

- 两个文件已由宿主生成占位，第一次写之前先 `read`；`write` 整体覆盖；读过之后又被改过的文件要再 `read` 才能 `write`；小改动用 `edit`。
- 两个文件都写好再跑 `plugin-checks`（慢、计入轮次），按返回的原文一次改完再重跑，直到本操作通过。宿主结束后会独立复检：你的文字说明不能让功能接通。

## 不能做的

不能削弱合同、删掉有意义的测试、把例子的输出写死在代码里、改冻结文件来换取通过。检查失败时找真正原因：例子期望与实际结果对不上时，宿主会把期望和实际都给你，逐字段对照。
