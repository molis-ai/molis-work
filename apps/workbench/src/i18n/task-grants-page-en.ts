/**
 * English for 授权与放行 in project settings (specs/proactive-assistant/task-grants-platform-area.md §5), drawn by
 * src/browser/task-grants-page.ts. The category rows' notes and the words it shares with the reads area (允许, 移除, taken back, the
 * changed-elsewhere and not-saved lines) are the area's, in TASK_GRANTS_AREA_EN; 打开, 撤回 (Withdraw), 取消 and 重试 are the shared words in `EN`.
 */
export const TASK_GRANTS_PAGE_EN: Record<string, string> = {
  "授权与放行": "Access and approvals",
  "这个项目里的后台任务各能读哪些插件的数据。在这里撤回或允许，下一次运行起生效；要让任务多读一类，到那个任务里打开。":
    "What each background task in this project may read from its plugins. Withdraw a category or allow it here; it applies from the next run. To let a task read another category, turn it on in that task.",
  "后台任务能读的数据": "What background tasks may read",
  "还没有后台任务能读这个项目的数据。在一个任务的「能读的数据」里打开一类之后，它会列在这里。":
    "No background task may read this project's data yet. Once you turn a category on in a task's “What it can read”, it is listed here.",
  "暂时读不到后台任务的授权": "Cannot read the background tasks' permissions right now",
  "{name} · 一个任务": "{name} · a task",
  "全部撤回": "Withdraw all",
  "已允许": "Allowed",
  "有新的读取能力": "Reads more now",
  "暂时不可读": "Not readable for now",
  "已不再提供": "No longer offered",
  "已允许{name}的新读取能力；不想要就撤回这一类": "{name} may read its new data; withdraw it if you do not want that",
  "撤回这个任务能读的全部数据？": "Withdraw everything this task may read?",
  "「{task}」下一次运行起不再读任何插件的数据；要再读，到任务里重新打开。":
    "From its next run, “{task}” reads no plugin's data. To let it read again, turn categories on in the task.",
  "已撤回「{task}」能读的全部数据": "Withdrew everything “{task}” may read",
};
