export const sources=[
  {id:'files',name:'本地文档',icon:'files',tone:'blue',detail:'文档 / 秋季发布、客户方案',hint:'只读副本，保留原文件',ready:true,scope:'folder'},
  {id:'projects',name:'项目资料',icon:'folder-code',tone:'ochre',detail:'Projects / 官网改版',hint:'需求、发布清单与项目说明',ready:true,scope:'folder'},
  {id:'browser',name:'浏览器内容',icon:'globe-2',tone:'plum',detail:'当前标签页与「工作参考」书签',hint:'提取所选网页的可读正文',ready:true,scope:'web'},
  {id:'mail',name:'Gmail',image:'gmail',tone:'red',detail:'工作邮箱 · 最近 30 天',hint:'邮件正文与相关线程，不含附件',ready:false,scope:'time'},
  {id:'chat',name:'飞书',image:'feishu',tone:'blue',detail:'工作会话 · 最近 30 天',hint:'可访问会话的消息与上下文',ready:false,scope:'time'},
];
export const materials=[
  {id:'f1',source:'files',group:'launch',title:'秋季发布 · 产品简报',date:'2026-09-20',kind:'Markdown',path:'文档 / 秋季发布 / 产品简报.md',body:'本次发布面向独立创作者。首批上线内容包括新版官网、产品介绍与入门指南。暂定 10 月 1 日发布，日期等待渠道排期确认。发布文案已有第一版。',fact:'面向独立创作者的秋季发布，产品文案已有第一版。'},
  {id:'f2',source:'files',group:'launch',title:'品牌表达与写作约定',date:'2026-09-12',kind:'文档',path:'文档 / 秋季发布 / 写作约定.docx',body:'用具体工作场景介绍产品。避免泛化的效率承诺。产品介绍应先展示用户如何带入资料，再展示整理后的工作内容。',fact:'文案应围绕用户带入资料和继续工作的具体场景。'},
  {id:'f3',source:'files',group:'client',title:'客户方案 · 初次沟通',date:'2026-09-18',kind:'Markdown',path:'文档 / 客户方案 / 初次沟通.md',body:'客户希望将分散的研究资料和团队讨论整理为可追溯的项目背景。现有演示稿已覆盖资料导入与总结，后续需核对试点范围。',fact:'已有客户背景和演示稿，试点范围仍需核对。'},
  {id:'p1',source:'projects',group:'launch',title:'官网发布清单',date:'2026-09-22',kind:'Markdown',path:'Projects / 官网改版 / launch.md',body:'首屏文案已完成；移动端检查待完成。截图仍是旧版界面，需要替换成新版资料导入流程。上线日期引用产品简报，尚未更新。',fact:'官网文案已完成；移动端检查与新版截图仍在发布清单中。'},
  {id:'p2',source:'projects',group:'launch',title:'官网改版 · README',date:'2026-09-15',kind:'Markdown',path:'Projects / 官网改版 / README.md',body:'官网本轮更新只涉及首页、产品介绍与入门指南。报名服务保持当前接口。',fact:'官网本轮更新范围为首页、产品介绍与入门指南。'},
  {id:'b1',source:'browser',group:'launch',title:'入门体验 · 试用反馈',date:'2026-09-23',kind:'网页',path:'当前标签页 / 试用反馈',body:'几位试用者在创建空项目后，不确定下一步该做什么。希望直接导入已有文档，让工具先整理一个工作概览。',fact:'试用反馈希望从已有资料开始，并在导入后直接看到工作概览。'},
  {id:'b2',source:'browser',group:'client',title:'资料整理 · 案例笔记',date:'2026-09-10',kind:'网页',path:'书签 / 工作参考 / 案例笔记',body:'案例中，团队以一个研究课题为试点，导入选定文档与讨论片段，再核对总结是否可追溯。页面没有提供本次客户的决定。',fact:'参考案例可用于设计试点，但不代表客户已经采用该方案。'},
  {id:'m1',source:'mail',group:'launch',title:'Re: 秋季发布排期确认',date:'2026-09-23',kind:'邮件',path:'工作邮箱 / 秋季发布 / 9 月 23 日',body:'渠道排期已确认，发布日期调整为 10 月 8 日。请以这个日期准备最终物料。之前简报里的 10 月 1 日需要一并核对更新。',fact:'较新的邮件将发布日期调整为 10 月 8 日。'},
  {id:'m2',source:'mail',group:'client',title:'下一次方案沟通',date:'2026-09-22',kind:'邮件',path:'工作邮箱 / 客户方案 / 9 月 22 日',body:'我们希望下一次演示能看到资料来源回溯的过程。时间拟在 10 月 12 日，尚待双方确认。',fact:'客户希望演示来源回溯；10 月 12 日的沟通时间尚待确认。'},
  {id:'c1',source:'chat',group:'launch',title:'发布协作 · 截图更新',date:'2026-09-24',kind:'聊天',path:'飞书 / 发布协作 / 9 月 24 日',body:'小林：目前演示截图仍是旧版。\n小周：我会在文案定稿后更新。\n这段讨论中尚没有截图完成或验收的后续消息。',fact:'讨论记录提到将更新截图，尚未见到完成记录。'},
  {id:'c2',source:'chat',group:'client',title:'方案讨论 · 新的演示要求',date:'2026-09-21',kind:'聊天',path:'飞书 / 方案讨论 / 9 月 21 日',body:'客户补充：除了总结，希望能点击结论回到原邮件或文档段落。请在下次演示里展示这一段。',fact:'讨论补充了从结论回到原邮件或文档段落的演示要求。'},
];
export const groups={launch:{title:'秋季产品发布',description:'发布文案、官网与上线准备',icon:'rocket',tone:'blue'},client:{title:'客户方案准备',description:'客户背景、沟通与演示资料',icon:'presentation',tone:'ochre'}};
export function initialState(){return {version:1,phase:'sources',selected:[],expanded:null,days:30,scope:{files:'all',projects:'all',browser:'all'},connected:[],skipped:[],failed:[],done:[],active:null,adopt:['launch','client'],names:{launch:'秋季产品发布',client:'客户方案准备'},projects:[],projectId:null,projectView:'overview',checks:[],lastSelected:[],newProject:false};}
