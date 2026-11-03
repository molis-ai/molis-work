/**
 * The Chinese words the Host still translates by their original text for 灵光: its own server-side labels and errors (BL-459),
 * plus two words other owners' pages ask for and keep showing in this English: 交给助理 (the context toolbar and Artifacts; another
 * dictionary defines it differently, and this one wins) and 我 (Pages' comment view). The page's own words are stable keys in
 * `messages.ts`.
 */
export const LINGGUANG_EN: Record<string, string> = {
  "灵光里的想法与对话": "灵光 ideas and conversations",
  "灵光": "Lingguang",
  "缺少项目": "Missing project",
  "未命名灵光": "Untitled spark",
  "先选至少一条": "Select at least one spark",
  "交给助理": "Hand to the Assistant",
  "我": "Me",
};
