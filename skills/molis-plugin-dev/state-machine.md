# 插件对象的状态与转换

先找持久状态的主人。在插件自己的库里用一列或一个字段记录状态，页面与其他消费者读主人给出的值。平台能力的公开取值查[平台词表](../../docs/platform/STATE-VOCABULARY.md)，平台内部的流程留在拥有它的包里。插件对象的状态由该插件申报，Goals 也走这条路。

## 在清单列出状态

在 Manifest 的 `state_machines` 里给每台机器写 `machine_id`、正整数 `version`、`states`、`initial` 和 `terminal`。机器 ID 是插件 ID 加一段小写本地名，`platform.` 留给平台。状态 ID 使用小写字母开头，可以有数字、下划线和连字符。每个状态映射到[现有状态环家族](../../docs/platform/STATE-VOCABULARY.md#状态环家族)。初始态、终态都引用同一台机器的状态。

`molis-work plugin validate` 只读清单、文件和声明，列出已申报的机器。校验拒绝越界 ID、重复机器、未知家族、超限或无效的初始态与终态。只在 Manifest 放静态元数据。状态文案用本插件的静态语言键，业务对象的内容及授权照各自的合同走。

## 在拥有状态的代码里定义转换

手写插件用 SDK 的 `/state-machine`，让清单引用同一份定义生成的 `describe()`。盘点、预览等消费方读静态清单即可。下面以允许关闭的收集状态为例。

`definition` 保留校验后的转换与可选触发动作引用，供运行期读取。打包 Manifest 使用 `describe()` 的静态元数据。

```ts
import { defineStateMachine } from "@molis-ai/molis-work-plugin-sdk/state-machine";

const collection = defineStateMachine({
  machine_id: "io.molis.work.forms.collection",
  version: 1,
  initial: "draft",
  terminal: ["closed"],
  states: { draft: "unsaved", open: "running", closed: "done" },
  transitions: { publish: { from: ["draft"], to: "open" }, close: { from: ["open"], to: "closed" } },
});

const state_machines = [collection.describe()];
```

转换只引用已声明状态。终态没有出边，其他状态各有出边。用 `next` 或 `assert` 拒绝非法转换，用 `family` 取状态家族。例如 `collection.next("draft", "close")` 会报 `state_machines.transition_invalid`。

写动作在库里用 CAS 按原状态提交。可传入动作的 `beforeEffect` 与主人自己的 `compareAndSet` 调用 `apply`，由它在计算目标后先检查授权再尝试写。CAS 应检查仍是同一个对象，并在同一次写里比较原状态或修订号。路由、定时任务和页面写动作都走同一个处理器。转换的 `trigger` 是可选的动作引用元数据，动作是否可调用由目录与 grant 判断。

## 改已保存的状态

开发前阶段内置插件的状态机与数据库一律保持 v1 原地修改，不升机器版本号也不写 `upgrades` 升级链（旧本机开发 Home 直接清空重建，见 `docs/system/CONTRACT-CHANGES.md` 第 3 节）。第三方签名包与 1.0 正式发布后：修改状态集合时给机器升版，删除状态前先确定旧值对应的新状态，按[升级要求](../../specs/upgrade-continuity/spec.md#44-插件的数据)给拥有库的插件写版本链和旧数据校验；普通读取遇到未知值报告拒绝，版本转换由升级过程执行。发布与跨项目放置读取原对象的状态和修订号，流水账存在同一主人库里。

## 启动核对与查询

在 `start` 的返回值里交出代码运行的状态机：`state_machines: [machine.describe()]`。平台启动前把它和 Manifest 的 `state_machines` 逐台核对（编号、版本、状态与家族、起始与终止状态），不一致就不启动，并指出是哪一台。随宿主发布的插件必须交出；本地开发的插件交出才核对；`plugin create` 的模板已带这一行。转换上的触发动作引用只作登记，不核对。

已申报的状态机可用 `state_machines.list@1`、`state_machines.get@1`（提供方 `system.state-machines`）查询，插件停用或没启动也读得到；只返回申报的五项，不含业务数据。创作台生成的插件没有自己写的状态机代码：设计里的 `states` 写明状态所在的字段、每个取值的状态家族、起始与终止取值（没有状态写空列表），宿主核对它与字段的枚举一致，并据此写出 Manifest 的 `state_machines`。机器以字段命名，状态 ID 取家族名，同一家族的第二个取值加序号（`running`、`running-2`）；状态集合、家族、起点或终点相对上一次发布有变化时，宿主给机器升版。
