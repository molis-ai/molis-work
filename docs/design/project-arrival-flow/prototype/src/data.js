/*
 * 示例数据：只用于这份设计原型。
 * 九个项目名称来自用户的截图；描述、目标、下一步、近况、材料与整理结果都是设计示例，
 * 没有接入真实项目，也不读写真实 Home。进度由下面的目标状态计算，不另存百分比。
 */

export const TODAY = '10月1日 星期四';

/** kind: you 由你推进 · decide 等你确认 · others 在等别人 · ai 助理在做 */
export const PERSONAL = {
  id: 'personal',
  personal: true,
  name: '个人空间',
  opened: '今天上午',
  desc: '只有你能看到。没想好放进哪个项目的资料、灵光和待办，先放在这里；之后可以移进项目。',
  counts: [
    { label: '灵光', value: 12, unit: '条' },
    { label: 'Shelf', value: 34, unit: '份' },
    { label: '待办', value: 5, unit: '项' },
  ],
  next: [
    { kind: 'you', t: '回复周会改期的邮件', meta: '今天' },
    { kind: 'you', t: '读完《Local-first software》并记下要点', meta: '本周' },
    { kind: 'ai', t: '把 9 月的收据整理成报销清单', meta: '已完成 7 / 11 张' },
  ],
  recent: [
    { when: '今天 09:12', t: '记下一条灵光「阅读页的段落引用」' },
    { when: '昨天', t: '把 3 份下载的 PDF 放进 Shelf' },
    { when: '9月29日', t: '完成待办「续订域名」' },
  ],
};

export const PROJECTS = [
  {
    id: 'flyleaf', name: 'FlyLeaf-V0.1', opened: '2 小时前',
    desc: '让阅读、笔记与灵感连成一条线：读到的段落直接变成笔记，笔记再长成新的创作。',
    goals: [
      { t: '明确使用场景', s: 'done' }, { t: '确认首版范围', s: 'done' },
      { t: '完成阅读页原型', s: 'done' }, { t: '连接笔记链路', s: 'done' },
      { t: '打磨首次使用', s: 'doing', brief: '检查空白状态、导入材料和创建项目的完整路径。' },
      { t: '邀请首批内测', s: 'todo' },
    ],
    next: [
      { kind: 'you', t: '检查空白状态与导入材料的完整路径', meta: '目标「打磨首次使用」' },
      { kind: 'decide', t: '确认首批内测名单', meta: '12 人' },
      { kind: 'ai', t: '整理 5 份用户访谈纪要', meta: '已完成 3 / 5 份' },
    ],
    recent: [
      { when: '昨天 22:14', t: '更新了《阅读页交互说明》' },
      { when: '9月29日', t: '加入 4 份用户访谈记录' },
      { when: '9月28日', t: '完成目标「连接笔记链路」' },
    ],
    facts: { materials: 18, docs: 7, path: '~/Molis/FlyLeaf-V0.1' },
  },
  {
    id: 'feed', name: 'GoalBoard 信息流工作台重设计', opened: '昨天 18:40',
    desc: '把 Feed、收件箱和日程放进同一条信息流，让各处来的消息都能落到具体目标上。',
    goals: [
      { t: '梳理信息来源', s: 'done' }, { t: '统一消息卡片', s: 'done' },
      { t: '信息流关联目标', s: 'doing', brief: '把消息卡片接到目标详情，让每条消息都能落到一个目标上。' },
      { t: '收件箱分流规则', s: 'todo' }, { t: '走查与验收', s: 'todo' },
    ],
    next: [
      { kind: 'you', t: '把消息卡片接到目标详情', meta: '目标「信息流关联目标」' },
      { kind: 'decide', t: '分流规则的三个默认值', meta: '等你拍板' },
      { kind: 'ai', t: '对比 3 个产品的收件箱分流', meta: '草稿已出' },
    ],
    recent: [
      { when: '昨天 18:40', t: '评审了「消息卡片 v3」' },
      { when: '9月28日', t: '完成目标「统一消息卡片」' },
      { when: '9月26日', t: '加入 6 份来源样本' },
    ],
    facts: { materials: 26, docs: 11, path: '~/Molis/信息流工作台' },
  },
  {
    id: 'coding', name: 'Coding 开发沙盒', opened: '昨天 11:05',
    desc: '在隔离的沙盒里让 Agent 写代码、跑测试，再把结果以 PR 交回项目。',
    goals: [
      { t: '沙盒运行时', s: 'done' }, { t: '会话与工作树', s: 'done' },
      { t: '真实 PR 流程', s: 'done' },
      { t: '用真实任务验收', s: 'doing', brief: '挑一个真实任务从头走到合并，记录卡住的地方。' },
    ],
    next: [
      { kind: 'you', t: '挑一个真实任务走完验收', meta: '目标「用真实任务验收」' },
      { kind: 'ai', t: '回归测试', meta: '后台任务 · 已运行 12 分钟' },
    ],
    recent: [
      { when: '昨天 11:05', t: '合并了「沙盒联网白名单」' },
      { when: '9月30日', t: '完成目标「真实 PR 流程」' },
      { when: '9月27日', t: '新增工作树清理规则' },
    ],
    facts: { materials: 9, docs: 14, path: '~/Molis/coding-sandbox' },
  },
  {
    id: 'release', name: 'GoalBoard 发布验收', opened: '9月29日',
    desc: '1.0 发布前的全量回归、安装包签名、发布说明与灰度计划。',
    goals: [
      { t: '回归清单', s: 'done' },
      { t: '安装包签名', s: 'doing', brief: '公证证书续期后重新签名，并在干净的机器上验证安装。' },
      { t: '发布说明', s: 'todo' }, { t: '灰度计划', s: 'todo' },
    ],
    next: [
      { kind: 'others', t: '公证证书续期', meta: '在等 Apple 审核' },
      { kind: 'you', t: '起草发布说明的结构', meta: '目标「发布说明」' },
    ],
    recent: [
      { when: '9月29日', t: '回归清单 128 项全部通过' },
      { when: '9月27日', t: '新增「安装包签名」检查' },
    ],
    facts: { materials: 12, docs: 5, path: '~/Molis/release-1.0' },
  },
  {
    id: 'arch', name: 'GoalBoard 架构与包重组', opened: '9月27日',
    desc: '按事实 owner 重新划分包边界，迁移旧插件路径，删除兼容层。',
    goals: [
      { t: 'SSOT 矩阵', s: 'done' }, { t: '边界门禁', s: 'done' },
      { t: '旧插件路径迁移', s: 'doing', brief: '把剩下 3 个走旧路径的插件迁到 Plugin Runtime 装配。' },
      { t: '删除兼容层', s: 'todo' },
    ],
    next: [
      { kind: 'you', t: '迁移剩下 3 个旧路径插件', meta: '目标「旧插件路径迁移」' },
      { kind: 'ai', t: '列出兼容层的调用方', meta: '已找到 14 处' },
    ],
    recent: [
      { when: '9月27日', t: '边界门禁加入 CI' },
      { when: '9月25日', t: '更新《SSOT 矩阵》' },
    ],
    facts: { materials: 7, docs: 9, path: '~/Molis/architecture' },
  },
  {
    id: 'astralo', name: 'ASTRALO', opened: '9月24日',
    desc: '给天文爱好者的观星助手：根据天气、月相和光污染，推荐今晚去哪里看。',
    goals: [
      { t: '用户访谈', s: 'done' },
      { t: '数据源评估', s: 'doing', brief: '比较两家天气数据对云量的预报精度，选一家接入。' },
      { t: '观测点推荐原型', s: 'todo' },
    ],
    next: [
      { kind: 'you', t: '比较两家天气数据的云量精度', meta: '目标「数据源评估」' },
      { kind: 'others', t: '光污染地图的授权回复', meta: '在等对方' },
    ],
    recent: [
      { when: '9月24日', t: '加入 8 份访谈记录' },
      { when: '9月20日', t: '完成目标「用户访谈」' },
    ],
    facts: { materials: 14, docs: 3, path: '~/Molis/ASTRALO' },
  },
  {
    id: 'demo', name: 'GoalBoard Product Demo', opened: '9月20日', demo: true,
    desc: '对外演示用的示例项目。演示数据可以随时重建，不属于你的项目资料。',
    goals: [
      { t: '演示脚本', s: 'done' }, { t: '示例数据', s: 'done' }, { t: '录屏', s: 'done' },
    ],
    next: [{ kind: 'you', t: '需要时重建演示数据', meta: '可随时重建' }],
    recent: [{ when: '9月20日', t: '录完 3 分钟演示视频' }],
    facts: { materials: 4, docs: 2, path: '~/Molis/demo' },
  },
  {
    id: 'football', name: 'Footballnia', opened: '9月12日',
    desc: '业余球队的赛程、出勤和战术板，先从周末联赛开始。',
    goals: [],
    next: [],
    recent: [{ when: '9月12日', t: '加入 6 份赛程与名单' }],
    facts: { materials: 6, docs: 1, path: '~/Molis/Footballnia' },
  },
  {
    id: 'ceshi', name: 'ceshi', opened: '8月30日',
    desc: '',
    goals: [],
    next: [],
    recent: [{ when: '8月30日', t: '创建了项目' }],
    facts: { materials: 0, docs: 0, path: '~/Molis/ceshi' },
  },
];

export const BACKGROUND_TASKS = [
  { id: 'bg-coding', title: '回归测试', where: 'Coding 开发沙盒', meta: '已运行 12 分钟' },
];

/** 引导里的示例材料：只有名称和大小，不含正文。 */
export const FOLDERS = {
  docs: {
    label: '文稿', hint: '保存在文稿中的笔记和资料', path: '~/文稿/FlyLeaf 资料', skipped: 2,
    files: [
      ['首版功能范围.md', 12e3], ['阅读页交互说明.docx', 86e3], ['用户访谈-0926.pdf', 412e3],
      ['用户访谈-0928.pdf', 388e3], ['竞品笔记.md', 9e3], ['设计评审纪要.md', 15e3], ['内测招募文案.txt', 3e3],
    ],
  },
  desktop: {
    label: '桌面', hint: '桌面上正在处理的内容', path: '~/Desktop', skipped: 5,
    files: [['发布前检查.md', 6e3], ['截图说明.txt', 2e3], ['路线图草稿.pdf', 240e3]],
  },
  downloads: {
    label: '最近下载', hint: '最近下载的工作文件', path: '~/Downloads', skipped: 9,
    files: [['访谈录音转写.txt', 64e3], ['Product-brief.pdf', 1.1e6]],
  },
  other: {
    label: '其他文件夹', hint: '用系统选择器选一个', path: '~/Projects/flyleaf-notes', skipped: 0,
    files: [['周报-W38.md', 7e3], ['周报-W39.md', 8e3], ['会议纪要-0925.md', 11e3]],
  },
};
export const SAMPLE_FILES = [['FlyLeaf 品牌说明.pdf', 524e3], ['首屏文案.md', 4e3]];
export const SAMPLE_CHAT = ['飞书导出 · FlyLeaf 产品群 0901–0930.txt', 48e3];
export const SAMPLE_WEB = {
  url: 'https://readwise.io/read/flyleaf-notes',
  text: '阅读器与笔记工具之间的断点，往往出现在“读到”和“写下”之间。好的产品让引用、批注和再创作都在同一个地方发生……',
};

export const RESULT = {
  name: 'FlyLeaf 首版内测',
  summary: 'FlyLeaf 是一款把阅读、笔记和创作连起来的阅读器。首版已完成阅读页原型和笔记链路，正在打磨首次使用体验，计划 10 月中旬邀请 12 位用户内测。',
  todos: [
    { t: '确认首批内测名单（12 人）', tag: ['decide', '截止 10月10日'], on: true },
    { t: '补齐空白状态与导入路径的设计', tag: ['you', '由你推进'], on: true },
    { t: '回复设计评审里的 3 个问题', tag: ['others', '在等别人'], on: true },
    { t: '整理竞品笔记里的定价信息', tag: ['unknown', '负责人不确定'], on: false },
  ],
  refs: ['埋点方案里提到的数据看板需求', '两位受访者提到的夜间阅读模式'],
};

/** Molis Club 的 AI 字幕：A / I 常驻，后面的词逐字打出再逆序删除。 */
export const PHRASES = [
  ['mplify', 'deas'], ['waken', 'magination'], ['dvance', 'ntuition'], ['ugment', 'ntelligence'],
  ['ccelerate', 'nnovation'], ['rtistic', 'nspiration'], ['rtful', 'nteractions'], ['daptive', 'nterfaces'],
];
