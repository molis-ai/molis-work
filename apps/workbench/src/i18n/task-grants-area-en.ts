/**
 * English for the platform's reads area on a plugin page's task (specs/proactive-assistant/task-grants-platform-area.md §3.4–§3.6),
 * drawn by the shell (src/browser/plugin-frame/task-grants-area.ts). 移除, 撤销 and 重试 are the shared words in `EN`.
 */
export const TASK_GRANTS_AREA_EN: Record<string, string> = {
  "Molis Work · 只有你能改": "Molis Work · only you can change this",
  "只能读，不能改；只给这个任务；随时可以撤回": "Read only, never change; for this task alone; withdraw it any time",
  "允许": "Allow",
  "有新的读取能力，允许之前读不到": "Reads more now; not readable until you allow it",
  "暂时读不到，授权还在": "Not readable for now; the permission stays",
  "这一类已不再提供": "No longer offered",
  "这个项目里还没有能读的插件数据。装了待办、日程、笔记一类的插件后，它们会出现在这里。":
    "Nothing in this project can be read yet. Plugins such as to-dos, calendars or notes show up here once added.",
  "拨一下即生效，下一次运行起按新的范围读": "A switch takes effect at once; the next run reads what is on",
  "已允许读 {name}，下一次运行起能读到": "{name} allowed; the next run can read it",
  "已撤回 {name}，下一次运行起读不到": "{name} withdrawn; the next run cannot read it",
  "已撤回 {name}；要再读它，重新打开开关，会按它现在的读取能力允许": "{name} withdrawn; to read it again, turn it on, which allows what it reads now",
  "已撤回 {name}；它的插件回来之后，重新打开开关才能再读": "{name} withdrawn; once its plugin is back, turn it on to read it again",
  "已允许 {name} 的新读取能力；不想要就关掉这一类": "{name} may read its new data; turn it off if you do not want that",
  "已移除 {name}，这一类已不再提供": "{name} removed; it is no longer offered",
  "已撤销刚才的改动": "Change undone",
  "已在别处改动，已刷新": "Changed elsewhere; refreshed",
  "没能保存，原来的授权没变": "Not saved; the permissions are as they were",
  "暂时读不到这个任务能读什么": "Cannot read what this task may read right now",
  "刚移动过，请再拨一次": "This just moved; please switch again",
  "请先让这一块完整显示": "Show this whole area first",
};
