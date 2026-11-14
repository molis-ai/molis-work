import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
export const required = requiredQuery(selector => `Git page: ${selector} is missing`);

/** An option list from plain values, keeping the chosen one if it is still there. */
export function setOptions(select: HTMLSelectElement, values: readonly string[], keep?: string): void {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = value;
    return option;
  }));
  if (keep && values.includes(keep)) select.value = keep;
}
