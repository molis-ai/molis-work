# 第 12 批合同设计稿：输入框上方的提示行、项目规则的信任与来源

状态：设计稿（2026-11-13），等评审台审过、公共合同台（C 轨）合审、组件板新增由 D 轨合审后再写合同代码。属[第 12 批](../post-anticorruption-roadmap/reference/batches/12.md)第 1 项；定样与用户决定见[需求书 §11](spec.md#11-决策记录)。验收编号：CHO-06、CHO-38、BCD-01～BCD-08（本稿新加，见第 4 节）。

## 1. 为什么要改平台

两件事 Coding 自己做不了，按「插件缺什么就补进平台」补：

1. **只读提示行（R3 定样 A）**：讨论、规划、评审下，输入框上方常显一行「『讨论』只读……」和「换成修改」，输入框描边换成只读色。自统一输入（O2、O3）以后 Coding 不画自己的输入框：前台页面是工作台底栏那一个输入框的接收方，页面里画的东西不在输入框旁边。所以「输入框上方一行、带一个按钮、能改描边」要由平台输入框提供。别的页面（助理的 Character 只读、表单的待补项）以后也会用同一处，不为 Coding 开私路。
2. **项目规则（R3、CHO-06）**：SDK 只在 `projectTrusted === true` 时把仓库里的 `AGENTS.md`、`CLAUDE.md`、`.prologue/instructions.md` 放进每一轮，Molis 从来没传，所以这些文件现在没有进过任何一轮。信任由 Host 决定（R3「项目可信性由 Host 决定」），不由插件在输入里报。

## 2. 输入框的提示行（`notice`）

### 2.1 合同（`packages/plugin-sdk` 的 `page-globals`，公开 API）

```ts
/** One line above the box: what holds for the next send, with at most one way out. Read again on every draw, like `controls`. */
export interface ComposerNotice {
  text: string;
  /** `readonly`: the next send changes nothing; the box's outline takes the read-only colour. `info`: a plain line. */
  tone: "readonly" | "info";
  icon?: PluginIconName;
  action?: { label: string; run(): void };
}
// ComposerCommonOptions
notice?: () => ComposerNotice | null;
```

- 只给一行、一个动作：多于一件事的说明不该挤在输入框上方。
- 文字由页面按 `t()` 给，平台照原样画、转义。
- 不碰发送：`notice` 不拦发送，拦发送仍是 `required`。

### 2.2 跨框（`apps/workbench/src/browser/plugin-frame/composer-bridge.ts`）

- 上行 `ComposerSnapshot.notice: { text; tone; icon? ; action: { label } | null } | null`，函数不过框。
- 下行沿用 `composer-act`，新增 `act: "notice"`（无 `key`）。
- 页面挂载与重读不变：`notice` 与 `controls` 一样每次画时重读。

### 2.3 画法（`packages/design-system` 的 composer，组件板新增）

- 位置：`.mw-composer__box` 正上方，在状态行之上；`role="status"`，进场用 `craft-rise`（时长 `--dur-move`、曲线 `--ease-quint`），减少动态效果时不动。
- `tone="readonly"`：根上 `data-notice="readonly"`，输入框描边换成只读色（`--accent` 22% 混 `--line`，与定样一致），文字前一个锁图标。
- 窄屏（≤600px）：说明换行，按钮另起一行；按钮高 36～44。
- 组件板加一节「输入框提示行」：只读、普通、带按钮、窄屏四个标本（D 轨合审）。

### 2.4 Coding 怎么用

`READ_ONLY_INTENTS = ["discuss", "plan", "review"]`；模式在其中时给 `{ tone: "readonly", icon: "lock", text: 「{模式}」只读…, action: 换成修改 }`，运行时不提供修改模式时不给按钮。不按消息内容判断、不自动换模式（定样否掉 B、C 的理由）。

## 3. 项目规则：信任与本轮来源

### 3.1 用户决定（2026-11-13）

**选了输出目录就算信任**：项目的输出目录是用户自己选的文件夹（不是项目建好时的默认位置 `<Home>/outputs/<project_id>`）时，视为信任这个项目，每一轮读仓库里的说明文件；项目设置里可以关。信任只决定读不读，不加任何权限（定样 R3 A）。否掉「开关＋就地开启，默认关」（多一步）和「每个文件夹单独信任」（要另做按文件夹的设置与管理页）。

### 3.2 事实主人与存储

- 主人：项目（Host 的 `projects` 模块），和输出目录同一处。新增一项「读取仓库说明文件」：`instructions: "follow-output" | "off"`，默认 `follow-output`。
- 存储：项目库目录表所在的那张设置表多一列；改了建库语句，按升级链规则升版本、写升级段、补金样（`upgrade-chain-design.md` §2）。
- 读：`projects.directories.get@1` 的输出加 `instructions` 与派生的 `trusted: boolean`（输出是用户选的、且没关）。改的是同一版本的输出形状，按阶段一在原版本改，跑 `pnpm actions:update`、`pnpm api:update`。
- 写：`projects.directories.set_instructions@1`（`audiences: ["user"]`、`permissions: ["projects:settings"]`、按 `expected_revision` 提交）。

### 3.3 进到一轮

- Agent Host 开始一轮时由 Host 从项目读 `trusted`，交给 SDK `context.projectTrusted`；Coding 的 `run.start` 输入里不能带它（可信身份从调用上下文来）。
- 冻结记录加 `instructions: { trusted: boolean; files: { path; chars; truncated }[]; overridden: string[] }`：用 SDK `selectInstructions` 的结果写；不信任时 `files` 为空。写进冻结记录，旧轮次的来源不随文件变化而改（R3「不伪造旧运行的规则来源」）。
- 页面：Coding 输入框底部「规则 N」（N = 本轮实际读到的份数），点开列文件、适用的目录层、字数与是否截断；不信任时写「规则没加载」和「这个项目的输出不是你选的文件夹，或你在项目设置里关了」，给「去项目设置」。

## 4. 验收

| 编号 | 条件 | 证明 |
| --- | --- | --- |
| BCD-01 | 页面给了 `notice` 时输入框上方出现这一行，`readonly` 时描边换色；`notice` 返回 null 后这一行消失 | design-system composer 用例 |
| BCD-02 | 框里的页面给的 `notice` 经桥画在底栏，按钮按下后页面的 `run` 被调一次；函数不过框 | 工作台 plugin-frame 用例 |
| BCD-03 | Coding 在讨论、规划、评审下有只读行，修改、执行下没有；按「换成修改」后模式变成修改、只读行消失 | Coding 浏览器用例 |
| BCD-04 | 输出是用户选的文件夹时 `trusted` 为真，默认输出或关掉时为假 | projects 模块用例 |
| BCD-05 | 信任的项目，一轮的模型请求里带仓库的 `AGENTS.md`；不信任的不带 | agent-host 请求接缝用例（CHO-06） |
| BCD-06 | `run.start` 输入里带 `projectTrusted` 或同义字段被拒 | 安全不变量用例（拒绝本身） |
| BCD-07 | 冻结记录写本轮实际读到的文件；文件之后改了，旧一轮显示的来源不变 | agent-host 用例 |
| BCD-08 | 「规则 N」与「规则没加载」按冻结记录显示，中英文、深浅色、三种宽度 | Coding 浏览器用例＋截图 |

## 5. 对别人的影响

- 插件作者：`ComposerOptions` 多一个可选项，不给就和现在一样。
- `projects.directories.get@1` 输出多两个字段；读它的插件（Coding、Files、Git）不受影响。
- 第 35 批 A1（说明文件、`/init`）与本节是同一件事（35 批文件已写明「应由同一片做」）：本批交信任、读入与来源显示，35 批只剩 `/init` 和「这一轮读到的说明」在规则菜单之外的入口。开 PR 时同步改 35 批文件。
