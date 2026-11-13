# 统一待办清单

2026-10-27 需求归并：原 BL-376（Alchemist 独立重做）已并入 BL-377 的[工作台升级](plugin-builder-upgrade/spec.md)，不再单独排期，编号不复用；其他文档里的历史编号由此转到现行需求。旧业务验收、记忆和结构化生成由 BL-010、BL-035、BL-306 承接，均不因此视为完成。

这里是仓库里**还没做的事**的唯一来源。2026-10-01 全量梳理 `specs/` 时，从各 spec 正文、`implementation.md`、决策记录和合入 PR 的说明中抽取、归并而来。梳理过程与逐份判定见 [合入后审查 §8](archive/post-merge-review/spec.md#8-spec-梳理)。

用法：

- 新发现的未做事项写在 [backlog/](backlog/) 的独立条目里，不再写进各自 spec 的「未完成」小节；spec 归档时，剩下的事项移到这里，并在 spec 开头注明条目编号。
- 做完一条就删掉对应条目文件，在提交说明里写编号。不改编号，不复用编号。
- 只抽取与归并，不重新设计需求。几处说法冲突的，列在「待你决定」。

新增条目使用 `BL-<语义名称>.md`，不争抢连续编号；旧编号不改、不复用。每个文件保留分组和原来的八列信息。统一查看：`node scripts/gates/backlog-rows.mjs --report`，不提交重复汇总表。以下各节保留分组说明，正文都在独立条目里。

类型：**待你验收**（做完了、等用户本人试用）、**待你决定**（要用户拍板）、**未实现**、**部分实现**、**明确后续做**（原 spec 写明了留到以后）、**已知缺口**（实现里如实标注的限制）。

优先级：**高**＝影响正在用的功能或对外开放；**中**＝下一轮该做；**低**＝有需要再做。负责人按[轨道分工](post-anticorruption-roadmap/reference/tracks.md)及[事实主人](../docs/SSOT-MATRIX.md)注明维护职责。已有认领保留到实际交接；只确定了负责范围的写「执行会话待分配」。创作台、Sessions 和团队仍可整体待分配，相关轨道是协作者。

## 1. 待你验收

按[第 01 批本人试用单](post-anticorruption-roadmap/reference/acceptance-01.md)逐项试：已有实现与前置条件分别写明。BL-010／013 尚待对应实现，BL-929 的真实 Home 已重建、待你试；BL-001 已委托，BL-017 已接受已有验证、个人账号路径未实测。第 16 批外观/首屏/组件板本人验收见 [BL-b16-appearance-acceptance](backlog/BL-b16-appearance-acceptance.md)。不要把本节整体当作可立即验收或已获认可。


## 2. 待你决定


## 3. 助理、记忆与动态交互


## 4. 搜索、放置与工作流


## 5. 插件


## 6. 连接、来源与 Onboarding

## 7. 平台与架构

- [BL-golden-replay-red-main](backlog/BL-golden-replay-red-main.md)：金样生成与回放在 main 上就是红的（金样 `goals.list@1` 报 `golden.action_not_offered`，生成/检查 12 条用例失败）；干净基线上同样失败，与第 31 批换包无关。


## 8. 交给第二步（防腐整理）

本轮按「没有旧用户」清除兼容逻辑、统一装配路径。下列是梳理时看到、属于第二步范围的具体对象；第二步的完整清单在 [合入后审查 §12](archive/post-merge-review/spec.md#12-交给第二步的清单)。


## 9. 平台小项与工程流程

按[需求清单 §7](post-anticorruption-roadmap/reference/requirements.md#section-3-7)归组。只移动仍在清单里的事项，原编号、依赖与认领继续有效。

### 翻译与界面用词

第 16、55 批按贡献与合同逐项处理。


### 首屏加载与资源

数字来自[字体皮肤语言的首屏实测与资源预算方案](font-and-skin-system/resource-budget.md)。第一屏总字节门禁已随第 16 批 #2031 合入（`scripts/gates/first-screen.mjs`、`tooling/gates/first-screen.json`、CI 的 First-screen budgets）；后续改动在这项检查里看数字变化，排期由统筹定。


### 写后检查

随第 24、31 批处理检查回执、展示与证明。


### Prologue 上游

随第 31、61 批处理。换包另等实际窗口。


### 记忆误记与默认设置

随第 24、31 批。Memory 沿用原暂停决定。


### 模型本身的能力

保留观察。按已定边界，平台不为模型输出写特例。


### 工程流程

统筹在第 02 批接续工程验证与排期。产品体验仍由各自的主人验收。
