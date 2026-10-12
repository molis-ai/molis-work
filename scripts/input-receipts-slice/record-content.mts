/**
 * What the scripted people and the scripted model say in the recordings. Two flavours of the same scenes: Coding
 * (the validation sample, specs/ai-input-receipts §8.1) and the global Assistant (§8.2). Only the words differ; the
 * shape of every scene is the same, so both layouts are drawn from the same kind of facts.
 */
export interface AckSpec {
  readonly treatment: string;
  readonly kind?: string;
  readonly impacts?: readonly string[];
  readonly note?: string;
}
export interface Said { readonly text: string; readonly ack?: AckSpec }

export interface Flavor {
  readonly id: "coding" | "assistant";
  readonly task: string;
  /** Streamed by the model while the person types. */
  readonly working: readonly [string, string];
  readonly final: string;
  readonly host: string;
  readonly withdrawn: string;
  readonly constraint: Said;
  readonly newTask: Said;
  readonly notAdopted: Said;
  readonly later: Said;
  /** Read by the model, never acknowledged: the reminder runs out and the run still ends. */
  readonly unacknowledged: string;
  readonly clarify: Said;
  readonly followUp: string;
  /** The person insists on the input the model did not adopt (§8.1 step 8). */
  readonly correction: Said;
  readonly stopped: { readonly task: string; readonly first: string; readonly second: string; readonly direct: string; readonly next: string };
  readonly question: { readonly task: string; readonly why: string; readonly prompt: string; readonly options: readonly string[]; readonly supplement: Said; readonly final: string };
  readonly restart: { readonly task: string; readonly first: string; readonly second: string };
}

export const CODING: Flavor = {
  id: "coding",
  task: "给登录接口补失败路径测试",
  working: ["我先读 login 的处理函数和现有测试，再写失败路径。", "步骤 2 正在写测试文件，下面是本轮的进展。"],
  final: "失败路径测试写完了：错误密码、被锁账号、过期令牌各一条，检查已跑过。",
  host: "任务图有更新：步骤 3「跑检查」改为等你确认",
  withdrawn: "先别动登录页的样式",
  constraint: { text: "别改现有 fixture，新建一个", ack: { treatment: "apply-now", kind: "constraint", impacts: ["approach", "outputs"], note: "新建 login-failure.json，不动 login.json" } },
  newTask: { text: "顺便把注册接口也覆盖一下", ack: { treatment: "new-task", kind: "request", impacts: ["scope"], note: "提议新增一步：注册接口失败路径测试，待你确认" } },
  notAdopted: { text: "测试改用 vitest", ack: { treatment: "not-adopted", kind: "request", impacts: ["approach"], note: "仓库统一用 node:test，scripts/run-tests.mjs 不认 vitest" } },
  later: { text: "这步可以批准，但以后改 fixture 前先问我", ack: { treatment: "later-step", kind: "constraint", impacts: ["constraint"], note: "以后每次改 fixture 前先问你" } },
  unacknowledged: "报告里也写上耗时",
  clarify: { text: "把那个慢的用例也处理掉", ack: { treatment: "needs-clarification", kind: "request", impacts: ["scope"], note: "你指的是 login-timeout 还是 signup-slow？" } },
  followUp: "继续把登录接口的失败路径测试写完",
  correction: { text: "还是用 vitest，请提出迁移步骤并写清代价", ack: { treatment: "new-task", kind: "correction", impacts: ["approach", "scope"], note: "按你的纠正处理：提议「迁移测试框架」一步，并写清代价（改 scripts/run-tests.mjs、约 40 个文件）" } },
  stopped: { task: "把登录页的校验提示改成中文", first: "提示里的邮箱格式也一起检查", second: "加一条空密码的用例", direct: "收尾时把改动清单列出来", next: "继续改登录页的提示" },
  question: { task: "整理一下登录相关的测试", why: "要不要把 login-timeout 用例也一起处理？", prompt: "login-timeout 用例", options: ["一起处理", "先不动"], supplement: { text: "顺便看下报告的格式", ack: { treatment: "noted", kind: "supplement", impacts: [], note: "记下了，写报告时会看" } }, final: "已整理完登录相关的测试。" },
  restart: { task: "重构登录模块的错误处理", first: "错误码别改名", second: "先别动 session 相关的文件" },
};

export const ASSISTANT: Flavor = {
  id: "assistant",
  task: "帮我准备周四和 A 客户的季度回顾会",
  working: ["我先收集上季度的数据，再起草议程。", "步骤 2 在起草议程，下面是本轮的进展。"],
  final: "议程已起草，上季度数据摘要和会前提醒也备好了。",
  host: "任务图有更新：步骤 4「发邀请邮件」已取消",
  withdrawn: "先把议程放一放",
  constraint: { text: "别直接发邮件给客户，我自己发", ack: { treatment: "apply-now", kind: "constraint", impacts: ["constraint", "scope"], note: "步骤 4 不再发邮件，由你自己发" } },
  newTask: { text: "会后发一份纪要", ack: { treatment: "new-task", kind: "request", impacts: ["scope"], note: "提议新增待办：会后发纪要，待你确认" } },
  notAdopted: { text: "不用准备上季度的数据了", ack: { treatment: "not-adopted", kind: "request", impacts: ["scope"], note: "议程第二项要引用上季度数据，暂不采纳，请你确认" } },
  later: { text: "议程里加一项续约报价", ack: { treatment: "later-step", kind: "supplement", impacts: ["scope", "acceptance"], note: "加到步骤 2 的议程里" } },
  unacknowledged: "会前一小时提醒我一下",
  clarify: { text: "上次他们提到的预算问题也要准备", ack: { treatment: "needs-clarification", kind: "request", impacts: ["scope"], note: "你指 8 月邮件里的预算削减，还是 9 月会上的？" } },
  followUp: "接着把议程定稿",
  correction: { text: "上季度的数据还是要准备，议程第二项要用", ack: { treatment: "apply-now", kind: "correction", impacts: ["scope", "priority"], note: "按你的纠正处理：恢复准备上季度数据" } },
  stopped: { task: "整理客户 A 的往来邮件", first: "只看今年的邮件", second: "把预算相关的单独列出来", direct: "整理完把清单发我", next: "继续整理客户 A 的邮件" },
  question: { task: "安排会前提醒", why: "提醒设在会前一小时还是前一天？", prompt: "会前提醒", options: ["会前一小时", "前一天"], supplement: { text: "顺便把议程也带上", ack: { treatment: "apply-now", kind: "supplement", impacts: ["outputs"], note: "提醒里附上议程" } }, final: "会前提醒已安排。" },
  restart: { task: "整理本周要跟进的客户", first: "先只整理 A 客户", second: "别发任何消息" },
};

export const FLAVORS: readonly Flavor[] = [CODING, ASSISTANT];
