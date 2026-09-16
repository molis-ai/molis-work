# 独立项目设置重构

## 目标与完成等级
用户指出项目常规设置持续加载、工作台插件/标签干扰设置，要求参考 Codex 的独立设置页，逐项重做设置内容。等级3：真实四页与保存流程可用、浏览器验收，不声称原生安装包已验证。

## 证据与原因
- GET /projects/:id/settings 被 web-request 改写为工作台首页，依赖客户端再次请求 ?embed=1 才能看到内容。短时「正在打开」可观察；此次检查未持续复现用户的无限等待。此链路引入不必要的异步挂载、工作台状态及设置状态耦合。
- 四个设置分类仍处于项目插件/工作区标签下，规则页包含嵌套折叠卡与大段重复说明；说明与规划页沿用不同布局。
- 旧UI不是约束。保留功能、字段、审计原因、权限和领域语义，替换页面组织与交互。

## 场景与方案
1. 从项目齿轮进入完整设置页，左边只有返回工作台、项目名称、四个分类；顶部无插件或工作区标签。返回恢复原标签/分栏；浏览器前后退及直接URL有效。
2. 服务端直接渲染当前分类完整HTML，移除工作台异步设置挂载路径，不再展示无限占位。保留 ?embed=1 给既有项目管理嵌入调用。
3. 常规：名称编辑行、本地数据只读详情、分开的重建/删除区；不把路径放在第一视觉层。
4. 项目说明：六个清楚分类、当前说明/添加入口、统一编辑区、可展开版本及停用记录；新增时可预选分类。
5. 工作规则：平铺常用设置行，选择/开关位于右侧，高级选项按需展开，修改原因和保存明确；不改规则值或生效语义。
6. 工作规划：当前组合优先、方法采用列表与分类筛选、次级新建/方法库路径；保留独立版本和确认流程。
7. 统一独立侧栏、正文最大宽度、字阶、分隔线、表单、窄屏分类导航及焦点。沿用现有中性token；设置以内容和操作为主。

## 范围与依赖
apps/local-host/src/web-{request,goals-read}.ts 路由；apps/workbench/src/settings-navigation.ts、project-settings-pages.ts、styles/settings相关所有者；移除工作台内设置客户端/DOM及旧持久状态；Goals-owned policy/planning renderer 与 guidance client 的必要展示改动。现有API、参数、审计、删除确认与规划采用协议保持。
全局设置已独立，共享设置样式随之统一；此轮逐页行为重构的确定范围为项目设置四分类及其编辑/返回路径。后续其他页面同样按页面用途重设计，不把换颜色视为完成。

## 验收与验证
- 四分类 GET 首次响应包含实际表单/内容，无 workbench、插件条、tab-workspace、正在打开占位。
- 齿轮进入/分类导航/刷新/前后退/返回工作台；原标签与拆栏可恢复，旧project-settings exclusive状态不会锁住工作台。
- 常规改名、说明新增修改、规则保存（含校验失败）、规划筛选/查看/采用入口按真实流程工作；未保存/失败保留输入；不写用户真实项目。
- 1440/1024/390px、浅深色，可读且无页面横向溢出；每分类视觉检查，不只检查外壳。
- 定向包构建、设置HTTP/浏览器回归、i18n/规则/规划相关测试、git diff --check；截图 .impeccable/review/project-settings-v2/。
- 用新的需求与截图进行一次 fresh finish review；前一轮ship不作为本轮通过依据。修正后更新DESIGN/sidecar。

## 非目标
不新增业务设置，不改变AI/Runtime权限或自动启动行为，不迁移用户数据，不提交/发布。Codex原生App被工具禁止读取；采用用户明确指定的独立分类侧栏与设置行模式，非像素复刻声明。

## 执行中发现：规则保存接口缺失
浏览器保存回归复现 POST /api/policy-bindings 返回404。客户端仍调用该路径，但 Native Goals HTTP handler 和 GoalsCommandApi 中都已没有对应写入口；Repository 保留 replacePolicyBinding 和历史查询。仅增加项目默认规则保存命令与该现有路径的 project_default 分支，沿用 Goals 模块事务、审计和幂等框架；不恢复单 Goal 的旧写路径，不绕过模块所有权。输入严格校验、用户确认随表单提交，失败保留输入，重试不重复历史。验收增加实际持久化/替换历史/坏输入不写入/丢响应重试；涉及 contracts/modules/goals.ts、modules/goals/src/policy-commands.ts 和 index.ts、Native Goals HTTP/types 与项目规则客户端。

## 验收结果（2026-09-16）
| 验收 | 状态 | 证据 |
| --- | --- | --- |
| 四分类首个HTML含实际内容，正常页面无embed依赖 | 通过 | project-settings-standalone.e2e：阻断所有embed请求仍可进入/刷新 |
| 返回工作台、前后退、双栏与标签恢复、旧exclusive迁移 | 通过 | 同上真实浏览器导航与持久状态对比 |
| 改名、删除确认/取消/网络失败/丢响应重试 | 通过 | project-settings-navigation.e2e与project-settings-deletion |
| 说明按分类新增、编辑版本、失败保留输入 | 通过 | project-settings-standalone.e2e，API读取原文、分类及revision |
| 规则保存、失败保留、刷新后值与原因、历史替换与幂等 | 通过 | project-settings-standalone.e2e与project-policy-save |
| 规划搜索与分类联合筛选、复制模板、采用独立版本、失败恢复、停用 | 通过 | project-settings-standalone.e2e与goals-planning.e2e |
| 四页1440浅色/1024深色/390浅色及编辑/高级展开状态 | 通过 | .impeccable/review/project-settings-v2/共14张；无root横向溢出 |
| 手机触达/桌面密度 | 通过 | 手机主次按钮、分类筛选、返回与关闭实测44px；桌面规划行112px |
| 构建/i18n/定向回归 | 通过 | pnpm build；37项定向测试最终通过。主批36通过+1旧DOM断言失败，更新该断言后删除文件3项全部通过。另web.test.ts全通过 |
| 新鲜独立设计复核 | 通过 | M1按钮尺寸、M2规划旧卡片高度、F1规则保存均resolved；最终ship仅覆盖本设置范围 |
| 原生安装包/全部产品页面 | 未运行 | 本轮为浏览器可用级别，不宣称原生包或全产品重构已完成 |

日志：/private/tmp/molis-settings-v2-build.log、molis-settings-v2-regression.log、molis-settings-v2-deletion.log、molis-settings-v2-flows2.log；检测器molis-settings-v2-detect.json为空。preview使用/private/tmp/molis-coss-review隔离home、4186端口；功能写入测试各自创建临时home，没有修改用户实际项目。
