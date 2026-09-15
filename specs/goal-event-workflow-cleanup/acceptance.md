# 新事件工作流验收

2026-09-11，主验收通过。本轮F1–F9达到约定的等级4（内部完整）。真实临时项目中的MCP／HTTP／SQLite／Host重启、当前界面与安装包路径已验证；用户正式环境未安装或迁移，未提交或推送。

## F1–F9

| 要求／用户结果 | 结论 | 直接证据 |
| --- | --- | --- |
| F1 当前约定是完成权威；缺失／过期正式版本无副作用；结果实质修改让旧完成退出当前生效 | 通过 | `04-paused-root-agreement.log`；首次建库与原反例分别见`01-first-open-correction.log`、`01-acceptance-correction.log` |
| F2 人工验收要求真实保存；pending／拒绝／Runtime支持不能绕过；普通讨论不形成全局门禁 | 通过 | `04-paused-root-agreement.log`：Module/MCP/HTTP、未知控制字段、可信用户决定、拒绝与后续反证 |
| F3 Web／首次引导／Feed-Inbox／MCP／树生成汇入事件意图；历史与来源保持 | 通过 | `04-paused-root-entry.log`、`04-paused-root-tree.log`；四份原v35库迁移／回滚／原批准及完成历史见`02-f-root-migration.log` |
| F4 结构变更无需Claim/Run；保留图合法性、来源、范围授权、正式并发、事务和重放 | 通过 | `04-paused-root-tree.log`；真实丢失成功响应重试见`02-f-root-ui-retry.log`；当前提案浏览器`04-resume-proposal.log` |
| F5 发现／恢复／单Goal／目录使用一致当前事实；合法新Goal可显式设为当前；无owner历史页只提供真实可执行入口 | 通过 | `04-paused-root-{runtime,directory}.log`；`04-fresh-unit.log`实际CLI/MCP焦点、无效Goal拒绝、payload冲突和Host重启；`04-resume-browser-initial.log`归档／导航／历史；`04-fresh-root-historical.log`无假写入口、真实400且SQLite完全不变 |
| F6 旧MCP discovery/dispatch、CLI、HTTP与底层专属写协议退役；Host注入普通身份 | 通过 | `04-paused-root-runtime.log`；完整退役结果`03-b-root-{runtime,retirement,auxiliary}-final.log`；安装包旧工具拒绝`04-resume-packed.log`。最终名单见[中英文MCP文档](../../docs/mcp.md)，保留职责见03handoff |
| F7 Skill与必读references只描述当前路径；例子真实可执行，安装后也成立 | 通过 | `04-paused-root-skill.log`直接执行实际markdown代码块，经公开MCP与可信Web决定完成整条流程及重启；`04-root-final-skill-package.log`包装通过；`04-resume-packed.log`真实安装、当前Runtime／重启／移除／升级通过 |
| F8 无模板普通笔记、多事实／progress、整批失败无写入、原键重试；completed/cancelled带理由继续 | 通过 | `04-paused-root-runtime.log`；Session次级记录恢复`03-a-root-session-repair-final.log`；最新真实界面见下表 |
| F9 类型v2保留v1历史；要求新增／修订／退休与具体变化授权；无关配置不误使批准失效 | 通过 | `04-paused-root-agreement.log`：单要求支持失效、明确delta范围、重放和重启；最新表单与正式并发路径见下表 |

## 最终实际验证

| 验证 | 结果／证据 |
| --- | --- |
| 1440px与390px当前完整操作 | `04-fresh-root-ui.log`均通过：真实HTTP新建→无类型笔记→类型→人工要求→报告→真实并发后旧收尾拒绝且无写入／保留输入→当前收尾保存未成立报告→拒绝后接受→完成→普通笔记不重开→理由必填继续→刷新。`04-ui-report-1440.png`及`04-ui-stale-closure-error-390.png`已目视检查，无横向溢出 |
| 历史只读与英文 | `04-fresh-root-historical.log`通过；两句新提示漏翻译修复后，`04-resumed-root-historical-language.log`实际英文HTTP页面通过；`04-resume-i18n.log`8/8通过。当前八状态的含义／下一步／继续另有`04-root-final-language.log` |
| 最新构建与包边界 | `04-resume-build.log`成功完成；`04-fresh-boundary.log`为`errors: []`。后续仅英文值与测试数据修改，不改变包依赖／边界。最终`git diff --check HEAD`通过 |
| 当前Goal、原历史字段、Home完整恢复、可信决定原子边界 | `04-fresh-unit.log`13/13，`04-fresh-http.log`12/12，均0fail/0skip；保存完整snapshot、Artifact两版、Session历史／加密正文与原密钥恢复 |
| 浏览器回归 | `04-resume-browser-initial.log`10项中9通过，唯一失败为历史Evidence夹具的`pass`不符合SQLite枚举；改成实际`passed`后`04-resume-event-doc.log`2/2通过。归档网络失败／重试／恢复后的真实Claim/Run/Evidence、Risk精确锚点、关系方向及已解除历史／刷新、创建重试／回收站均通过 |
| 当前结构提案 | `04-resume-proposal.log`1/1，通过实际失败保留输入、原子重试、拒绝后不创建Goal |
| 安装包 | `04-resume-packed.log`1/1、0skip，约137秒：真实临时安装、Web设置、当前Runtime意图／原笔记／状态、进程重启与原键重放、旧工具拒绝、配置备份／恢复、移除与升级。MCP在finally调用既有close，进程正常退出 |
| 真实持久化与原始证据序号 | `runtime-skill-flow.test.ts`重启重放后无条件读取实际catalog/SQLite，唯一Goal和原笔记保持；`evidence-verification-module.test.ts`核对原v35Evidence及真实提交事件序号；两项已在首次全仓对应项通过 |
| 最终预览 | [最新构建](http://127.0.0.1:62811/goals/V1)，隔离演示数据库；实际GET返回200及当前Goal文档。已发送应用面板打开请求 |

日志和截图前缀均为`/private/tmp/molis-work-flow-cleanup/`。最新中文UI通过后生产行为未再改变，仅补英文映射；英文另行实际复核。先前六组核心结果按影响面沿用，没有重跑无关成功项。

## 首次全仓失败逐项收尾

首次全仓`04-full-suite.log`确实运行：644项、627通过、17失败、0skip。没有把后续定向数相加，也没有宣称重新跑过整套。其后14个有效失败场景均有相应通过证据，3个纯退役用例经明确授权实际删除：

| 原失败 | 最终处置与证据 |
| --- | --- |
| Skill当前上下文／Web-Desktop共用工作台（2项） | 保留并通过`04-targeted-fix.log`；原文检查已核对 |
| 安装后的Runtime流程（1项） | 当前协议适配，`04-resume-packed.log`通过 |
| 事件表单、真正无owner历史、指针／要求／继续（3项） | `04-resume-event-doc.log`与`04-resume-browser-initial.log`对应项通过 |
| CLI/MCP当前Goal（1项） | 当前意图、真实拒绝／重放／重启，`04-fresh-unit.log`通过 |
| 创建重试与回收站（1项） | `04-resume-browser-initial.log`通过 |
| 目录投影与选择边界（2项） | 保留排序、当前状态与选择优先级，`04-targeted-fix.log`对应项通过 |
| 当前Goal／归档历史、Risk锚点、关系方向／历史（3项） | 真实历史记录驱动，`04-resume-browser-initial.log`对应项通过；当前关系写入由已通过提案回归承接 |
| Home完整恢复（1项） | 只替换旧创建前置，完整恢复断言保留，`04-fresh-unit.log`通过 |
| 旧Draft编辑／Risk创建／Policy租约表单（3项） | 三个确切文件已授权删除；见[删除审阅](work-items/04-skill-acceptance/test-deletion-review.md)与[03c退役映射](work-items/03-mcp-closure/03c-handoff.md) |

早前因MCP遗漏清理造成的3个cancelled属于主动停止后的未执行；后来一次CLI自动权限分类器超时发生在浏览器命令启动前。它们不计通过或产品失败，相关后续真实运行均已完成。

本轮合同没有未完成验收项。完成等级为内部完整；正式用户环境安装、迁移和发布不在本轮执行范围。详细实施交接见[04 handoff](work-items/04-skill-acceptance/04-handoff.md)。
