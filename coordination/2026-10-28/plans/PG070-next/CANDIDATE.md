# 主线候选：Coding 设置的样式和客户端统一由登记装配

状态：完整子路径方案候选，WAIT T-146 #1676 合入；可先审书，未实现、未测试。负责人：Codex 待分配。不占号，不把PG-070整行签完成。

| 项 | 合同 |
| --- | --- |
| 档 | 乙；full=true，改工作台共用客户端装配，CI Full由根排 |
| 基点 | main `717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` |
| 依据 | ESTIMATE现行PG-070拆账；T-115已合，settingsStylesheet/settingsClient通用登记已存在 |
| 前置 | T-146 #1676先合；#1676占plugin-styles测试及同主题文档；最终main重核 |
| 最小完整结果 | Coding四条设置规则和两处直拼脚本归登记，三个现有消费者各装一次、交互保持 |

## 1. 背景

当前 `styles/settings.ts:504-507` 仍含四条.coding-settings规则；`scripts/client/initialization.ts:1,126` 和 `scripts/settings.ts:7,115` 直接import/拼Coding脚本。Coding registration已有stylesheet但没有settingsStylesheet/settingsClient。通用pluginSettingsStyles、pluginSettingsClients和pluginWorkbenchClientBootstrap已经实现；Goals/Shelf已用settingsClient。现有两个入口的宿主点名因此可以消除，无需新平台合同。

## 2. 目标

Coding自己声明设置页样式与客户端；宿主通过同一登记装配。独立设置页与项目内嵌设置中方法库/MCP等原交互均工作、每次操作只发一轮请求，不因直接拼接与通用登记并存而绑两次。

## 3. 不做

Characters事实归modules/characters、界面和装配归Host早已决定；剩余是实际加载设计，见本书末尾技术方案。Coding writer不实施Characters改动。

不重做T-146删除整张CODING_STYLES的工作，不新增资源/框架/按插件名判断或更改设置动作。Characters样式本片保留现状，PG-070整行继续待其加载余项。不创建Characters插件，也不改T-116/T-402/403链。

## 4. 范围

书审收紧：writer独占路径为Coding的`src/registration.ts`、新常量`src/settings-styles.ts`（registration直接导入，不增公开出口）、workbench的四规则/两个脚本、`tests/plugin-styles.test.ts`及`tests/project-settings-standalone.e2e.test.ts`、`tests/settings-viewport.e2e.test.ts`的最小必要行为回归。`project-settings-pages.ts`是现有只读消费者，通常无需改。

README、pg070 slice及资产表差集由根串行写：Workbench README被#1679/#1654/#1101占用，Coding README被#1101占用，page-assets.json有多PR改动。T-146合入只释放#1676相关锁，不自动消除全部共享锁。作者交精确文档段落和实测预算差集，不能因四个源码路径无锁就直接改共享文件。最终写路径及测试逐项重新求交；不改#1101保护的plugin-workbench实现。

上述固定源码范围中，四条CSS只迁走不改值，initialization只去Coding专用import/拼接；scripts/settings以通用聚合替掉已登记Shelf/Coding直拼。现行规范由根原位补本片验收；资源清单只经实测update，由根串行维护，不进writer独占路径。

不改page-assets模板、生成目录、contracts、plugin-workbench实现或受锁源码。若确需改这些，回根具体扩范围；新登记应由现有通用聚合自动被消费。

## 5. 做法

消费面明确为三个入口：A全局独立settings-renderer→SETTINGS_CLIENT_SCRIPT；B工作台initialization→pluginWorkbenchClientBootstrap/内嵌设置；C项目设置整页project-settings-pages.ts:116→pluginSettingsClients。Coding一登记，C自动得到脚本，必须纳入回归。C无Coding DOM时不报错、不发额外请求，有对应DOM时一次操作只一轮请求。A/B/C分别覆盖Coding实际设置操作，Shelf/Goals原路径也要用一次交互/一次请求或持久化幂等结果证明，不以dataset.bound、字符串或脚本计数替代。计算样式/桌面窄屏布局仍需实操，CSS原样搬动也可能改变拼入顺序。

1. T-146合入后核基线，四条CSS原样移入Coding自己的settingsStylesheet，不混入整张CODING_STYLES；登记settingsClient=既有CODING_SETTINGS_CLIENT_SCRIPT。
2. 工作台已有pluginWorkbenchClientBootstrap会消费所有settingsClient，故删除紧接其后的Coding专用拼接。独立设置入口用pluginSettingsClients()消费登记，并删掉已登记Shelf的旧直拼，避免双监听；不对某个id写排除名单。保留平台自己的模型/连接器等脚本顺序与请求helper前置。
3. 用真实独立设置HTML与工作台内嵌页面检验方法详情/折叠/MCP原操作，记录请求数及持久化后回读。断言具体一次交互一次请求，不能只查字符串存在。测试还要确认Shelf与Goals登记客户端各装一次，捕获泛化消费引入的重复绑定。
4. CSS生成结果应在两张共用表中各经通用settingsStylesheet出现一次；源码规则仅Coding拥有，宿主不再按Coding名字导入设置脚本。无新增HTTP资源。资源可能有微小编排差异，必须整体构建实测，不能把原样移动当作字节必降的证明。

## 6. 验收

根分号后同步测试名/注释：①四条规则归Coding登记，计算样式和布局保持；②A/B/C三个入口经通用装配，无Coding DOM时无额外请求，有DOM时Coding/Shelf/Goals各一次实际交互不重复请求，持久化回读保持；③宿主两处Coding专用import/拼接消失；④现有资源实测及必要清单更新，未新增资源、未放松门禁；只关本片，不签Characters/PG-070全完成。

## 7. 测试

公共build槽整体pnpm build并workspace:build，定向完整plugin-styles文件及现有Coding设置/工作台设置浏览器文件（作者先按README和affected-tests列出准确文件，不抽case）；公共browser槽、独立测试浏览器/临时Home，用后清理。桌面宽度与窄屏各覆盖关键布局。完整page-assets:check并记录四项共用CSS/JS的前后字节；下降时update --base，增长按现行一次性批准规则，超过10KB或新增资源先给根具体差值。Full=true由根CI排。本线未跑任何命令验证，build/test/资产/Full均HOLD。

## 8. 与默认不同的

最小完整子路径只收Coding设置所有权与通用装配，Characters加载后继不阻断本片方案；实现仍等T-146。合入后状态写“Coding设置已归登记；Characters加载待处理”，不得擅自关PG-070。必跑boundary、merge-base health、test-import graph、secrets及准确头Verify；不改baseline/APPROVED_CEILINGS凑绿。

## 9. PR 标题

`refactor(workbench): Coding 设置样式和客户端经插件登记装配（PG-070后继）`

## 10. 先读

T-146书与最终diff；ESTIMATE PG-070拆账；Coding registration/settings-client；plugin-workbench三项聚合函数；两处脚本与settings样式；plugin-styles及对应浏览器回归；target-locks.json。

## 11. 停下来问

Characters已有owner不再作为询问或暂停条件；只读方案与下面技术方案可继续。

### Characters样式加载实际方案（后继准备，非Coding writer授权）

沿现有Host HTML入口内联静态CSS，不新增HTTP资源：`characters/ui.ts`的`renderCharacters`在自身被抽取的section内输出一次角色页样式（2026-11-01接续核查：不能放在section前，否则settings-directory抽取会丢失），覆盖该section已有的`CHARACTER_IMPORT_HTML`、确认dialog及运行终端；`renderCharactersSettingsEntry`仅输出全局项目入口需要的characters-settings-entry/project-link/hint规则。然后从page-assets两张共用CSS移除CHARACTERS_STYLES。两入口每次独立渲染携带自身样式，不依赖曾打开过角色页的全局状态，不把样式放到Module或Coding登记。终端基础bundle及assets仍沿HOST_SURFACE_CLIENTS原声明。

现行web-composition.ts的style-src允许inline，静态CSS不含用户输入，不改CSP。实施前实际核片段消费器是否保留style；若安全渲染器明确剥离style，回根改走已有Host deferred加载机制，不绕过安全过滤。全局角色项目入口、项目角色舞台、导入/来源dialog、运行终端，直接进入/工作台首次打开/换项目/关闭重开均应实操，桌面及窄屏核计算样式。ui.ts当前把导入/确认dialog放在角色section内，无证据要求全站下发这些CSS。

记录两张共用CSS下降量及角色HTML响应增加量；不因HTML未入page-assets表而忽略成本。新增资源或受管资源必要增长才按现行规则给根具体差值，不预设需用户重定语义。后继仍受page-assets.ts的#1676/#1101等锁，先由根串行安排完整边界，Coding writer不能顺手做。

T-146未合只审方案。任何新锁、通用装配导致重复监听、需要改受保护共享实现时交根。Characters加载沿上述Host方案后续串行，不进入本片writer范围。
