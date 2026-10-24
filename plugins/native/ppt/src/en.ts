/**
 * The Chinese words the Host still translates by their original text for PPT: its own server-side labels, plus the words
 * other owners' pages look up that no other dictionary defines. The page's own words are stable keys in `messages.ts`.
 */
export const PPT_EN: Record<string, string> = {
  "PPT 演示稿": "PPT presentations",
  "粘贴文字": "Paste text",
  "Pages 文档": "Pages document",
  "读不到 Pages 文档": "Could not read Pages documents",
  "Pages 不可用": "Pages is not available",
  "请给出一段文字，或选一篇文档": "Give some text, or pick a document",
  "Pages 不可用，无法读取文档": "Pages is not available; the document cannot be read",
  "请先配置可用的文字模型": "Set up a text model first",
  "模型没有返回大纲，请调整文字后重试": "The model returned no outline; adjust the text and try again",
  "演示稿已改变，请重新读取后生成": "The deck changed; reload before generating",
  "收到的内容里没有可以做成幻灯片的文字": "Nothing in that text can become a slide",
  "重新读取": "Reload",
  "新建演示稿": "New deck",
  "演示稿": "Presentation",
  "背景": "Background",
  "要点": "Bullets",
  "缺少项目": "Missing project",
  "至少保留一页": "Keep at least one slide",
};
