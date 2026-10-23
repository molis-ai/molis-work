import assert from "node:assert/strict";

/** The exact inert markup the production frame will receive, without executing it in the owner document. */
export function pluginDocuments(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*\bdata-plugin-document(?:="[^"]*")?[^>]*>([\s\S]*?)<\/script>/g)].map(match => {
    const content: unknown = JSON.parse(match[1]!);
    assert.equal(typeof content, "string");
    return content as string;
  });
}
