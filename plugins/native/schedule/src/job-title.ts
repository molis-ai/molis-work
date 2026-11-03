/**
 * The Scheduler counts a job title in UTF-16 units and refuses one past 200; Schedule names its jobs in at most 120,
 * cut at a whole character so a name never ends in half of one.
 */
export function jobTitle(title: string): string {
  let cut = "";
  for (const character of title) {
    if (cut.length + character.length > 120) break;
    cut += character;
  }
  return cut;
}
