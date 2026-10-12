/**
 * How the number of an operation (a UUID the Host hands out, one per page request, tool call, round or command) is shown to a person:
 * its first eight characters, called the 诊断编号 in the interface. That is also enough to look the operation up again, since the
 * call log takes six or more leading characters. How a number looks is for the pages that show it, so it lives here and not in the kernel.
 */
export const shortCallId = (id: string): string => id.slice(0, 8);
