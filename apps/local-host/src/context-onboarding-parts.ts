import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";

/**
 * A text in parts of at most `size` characters or UTF-16 units (`unit`), cut after a line end where there is one in the second half of
 * the part, and never inside a surrogate pair. A 🟢 is one character and two units. Todo's organizer reads whole characters, so its
 * parts are counted in characters; Pages limits what a body encodes to, so its parts are counted in units. Pages and Todo each take a
 * bounded text per call; a material of any length goes as several.
 */
export function textParts(text: string, size: number, unit: "characters" | "units"): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < text.length;) {
    const end = unit === "characters" ? partEndByCharacters(text, offset, size) : partEndByUnits(text, offset, size);
    parts.push(text.slice(offset, end)); offset = end;
  }
  return parts;
}
/** Where the part that starts at `offset` ends, `size` counted in UTF-16 units. */
function partEndByUnits(text: string, offset: number, size: number): number {
  let end = Math.min(offset + size, text.length);
  const line = end < text.length ? text.lastIndexOf("\n", end - 1) : -1;
  if (line >= offset + size / 2) end = line + 1;
  else end = cutHead(text, end).length;
  return end;
}
/** Where the part that starts at `offset` ends, `size` counted in characters: a pair of units is one, so a part never ends inside it. */
function partEndByCharacters(text: string, offset: number, size: number): number {
  let end = offset, count = 0, line = -1;
  while (count < size && end < text.length) {
    const code = text.codePointAt(end)!;
    if (code === 10 && count >= size / 2) line = end + 1;
    end += code > 0xFFFF ? 2 : 1;
    count += 1;
  }
  return end < text.length && line >= 0 ? line : end;
}
/**
 * A part's title: the name, cut to fit, then which part it is, so the cut never takes the part number. `max` counts whole characters
 * (a 🙂 is one, though two UTF-16 units), the way Todo and Pages count a title, so a cut never ends inside a character.
 */
export function partTitle(title: string, part: number, parts: number, max: number): string {
  const suffix = parts > 1 ? uiText.text("workbench.context-onboarding-service.part-k-n", { k: part, n: parts }) : "";
  const characters = [...title], room = max - [...suffix].length;
  return (characters.length <= room ? title : characters.slice(0, room - 1).join("") + "…") + suffix;
}
