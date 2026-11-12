/** The root actually mounted by the Settings cover from its server-rendered response. */
export function settingsContentOf(doc: Document): Element {
  const content = doc.querySelector(".settings-content") || doc.querySelector(".settings-document")
    || doc.querySelector(".project-settings-page") || doc.querySelector(".guidance-document")
    || doc.querySelector(".work-planning") || doc.body;
  if (!content.classList.contains("settings-content") && content !== doc.body) return content;
  const elements = Array.from(content.children);
  if (elements.length === 1) return elements[0]!;
  const root = doc.createElement("div"); root.replaceChildren(...elements);
  return root;
}
