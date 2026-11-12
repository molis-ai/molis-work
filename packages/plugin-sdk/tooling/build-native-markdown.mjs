import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const directories = process.argv.slice(2);
if (directories.length === 0 || directories.some(name => name !== "prompts" && name !== "methods")) {
  throw new Error("Pass the native package's prompts and/or methods directories");
}

const files = Object.fromEntries(directories.flatMap(directory =>
  readdirSync(directory, { withFileTypes: true })
    .filter(file => file.isFile() && file.name.endsWith(".md"))
    .map(({ name }) => {
      const path = directory + "/" + name;
      return ["/" + path, readFileSync(path, "utf8")];
    })));

// Native releases archive the factory's module graph. Include these bytes in that graph
// so restoring an old factory does not look for its Markdown beside the current build.
writeFileSync("dist/native-markdown.js", `import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
const files = ${JSON.stringify(files)};
export default function readNativeMarkdown(directory, id, locales) {
  return readLocalizedMarkdown(new URL("file:///" + directory + "/"), id, locales, file => {
    if (!Object.hasOwn(files, file.pathname)) throw new Error("Missing bundled Markdown: " + file.pathname);
    return files[file.pathname];
  });
}
`);
