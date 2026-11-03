# SYS-15-U10：Git 刷新保留正在交互的行

状态：核心代码已实现，两种受控原流程及行复用回归本机通过，负责人 Codex 修复2（2026-10-24）；独立评审、Linux 对应用例/CI 与最终合入待核，不以本机通过代替。

接受工单为 #1112 评论 6382236532，优先级来自 Claude 6381702011；独立 TEST 的原始对照见评论 6382237548。测试在 8d700173c 与 f4df5b471 都复现 receipt-first 时第二次行点击丢失，revision-first 保留完整安全流程通过。当前 main f586496e4 的 Git 客户端/插件、原 SYS-15-U10、Frame reviews、lifecycle 与两浏览器 fixture 与该基线对应路径相同，因此从 main 独立修，不叠 W5-06 元数据 PR。#1109 同文件的 upstream 字段展示在途，不属于本片；已向流水线报备，保留其原作者。

## 问题、边界与实现

原 refresh 在等真实 Git state 之前 list.replaceChildren；第二次点击已算出坐标但尚未发 mousePressed 时，revision 刷新会移除原节点，真实鼠标没有发出 diff 请求。不是本次记录到的 in-flight diff 取消，也不能把该机制直接当作历史 Linux 故障的唯一因果。

同一工作区内按 path/side 保留既有行及所属组，只更新必要文字、选择样式与顺序，移除真正消失的行。不在读取开始时清空列表；新工作区与读取失败仍清掉旧作用域的行。初次空态、分组顺序、变更后的新增/移除、刷新状态与可见时 revision 读取保持现行语义。保留 generation/ticket、忙状态、迟到 diff 拒绝、可信身份、Host-only 审查与真实确认、索引和 commit 行为。

只改 Git 客户端列表渲染及定向真实回归；不用等待/重试点击、关闭 poll、通用 pointer fixture、额外 viewport 或放宽时限隐藏问题。不改动作/schema/权限/存储/上游字段合同，不写 W5-06 三项 nonblock、C2 或共用门禁/预算/baseline。资源变化实测交 Claude 按 MERGE-QUEUE §1a 在批分支统一处理。

## 验收与验证

- **GITREF-01**：同工作区同 path/side 的行在 state 等待和同键提交后仍是原节点；真实点击意图及焦点不被冗余刷新丢掉。删除行、换工作区及读取失败不能保留可操作的旧目标，分组/行次序无重复。
- **GITREF-02**：自有固定检出的原 SYS-15-U10 在相同 receipt-first 屏障下修前真实失败、修后完整通过；revision-first 也完整通过。拒绝伪造请求/合成确认、真实暂存、拒绝保索引和真实 commit 的原断言与 90s 时限保留。观测脚本只复制并更正本检出绝对 import/输出路径，不改原始 TEST 证据或响应 body。
- **GITREF-03**：SYS-50/51、Git README 定向用例及现行可见生命周期/迟到响应拒绝保持通过；修后必须实际核 Linux 对应 Security 用例/CI，未取得该证据前不关闭 W5 阻塞。

修改前整体 build 并在自有隔离 Home/专用 Chrome 上跑原不利交错；修改后整体 build，先跑相同两交错和定向行复用回归，再跑 Git README 与相关安全用例。所有 build/browser 经过公共槽，临时 profile 按 fixture 正常清理，不取消 CI、不另起 full。提交前 health --base、boundary、资源实测、diff 和 fetch 后 secrets；固定源码普通 push、非 Draft 小 PR，直接交 REVIEW/TEST/流水线并释放 writer。所有未跑/复用/待 Linux 与批内生成物明确列出。

原始作者日志、观测脚本、固定检出信息与修前/修后轨迹随本片 PR 交付；独立 TEST 的四份原始观测保持不改写。
