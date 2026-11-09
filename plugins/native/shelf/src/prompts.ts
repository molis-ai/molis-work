import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { ShelfRecipeId } from "@molis-ai/molis-work-module-shelf/contract";
import { SHELF_RECIPES } from "@molis-ai/molis-work-module-shelf";
import { SHELF_PLUGIN_ID } from "./manifest.js";

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


const recipePromptVersions: Readonly<Record<string, number>> = {
  "shelf.summarize.short": /* @version prompt.shelf.summarize.short */ 2,
  "shelf.summarize.medium": /* @version prompt.shelf.summarize.medium */ 2,
  "shelf.summarize.long": /* @version prompt.shelf.summarize.long */ 2,
  "shelf.summarize.outline": /* @version prompt.shelf.summarize.outline */ 2,
  "shelf.extract-structure.points": /* @version prompt.shelf.extract-structure.points */ 2,
  "shelf.extract-structure.todos": /* @version prompt.shelf.extract-structure.todos */ 2,
  "shelf.extract-structure.quotes": /* @version prompt.shelf.extract-structure.quotes */ 2,
  "shelf.extract-structure.json": /* @version prompt.shelf.extract-structure.json */ 2,
  "shelf.translate.zh": /* @version prompt.shelf.translate.zh */ 2,
  "shelf.translate.en": /* @version prompt.shelf.translate.en */ 2,
  "shelf.translate.ja": /* @version prompt.shelf.translate.ja */ 2,
  "shelf.translate.ko": /* @version prompt.shelf.translate.ko */ 2,
  "shelf.redact.contact": /* @version prompt.shelf.redact.contact */ 2,
  "shelf.redact.ids": /* @version prompt.shelf.redact.ids */ 2,
  "shelf.redact.all": /* @version prompt.shelf.redact.all */ 2,
  "shelf.to-markdown.structure": /* @version prompt.shelf.to-markdown.structure */ 2,
  "shelf.to-markdown.body": /* @version prompt.shelf.to-markdown.body */ 2,
  "shelf.to-markdown.toc": /* @version prompt.shelf.to-markdown.toc */ 2,
  "shelf.combine.page": /* @version prompt.shelf.combine.page */ 2,
  "shelf.combine.full": /* @version prompt.shelf.combine.full */ 2,
};
export const SHELF_INSTRUCTIONS: readonly InstructionPrompt[] = [
  ...SHELF_RECIPES.filter(recipe => recipe.requires_agent).flatMap(recipe => recipe.choices.map(choice => defineInstructionPrompt({
    owner_id: SHELF_PLUGIN_ID, prompt_id: `shelf.${recipe.recipe.replaceAll("_", "-")}.${choice.id}`, version: recipePromptVersions[`shelf.${recipe.recipe.replaceAll("_", "-")}.${choice.id}`]!,
    title: `${recipe.label} · ${choice.title}`, purpose: recipe.blurb, used_by: [`置物架 · ${recipe.label}`],
    ...promptBody(`shelf.${recipe.recipe.replaceAll("_", "-")}.${choice.id}`),
  }))),
  defineInstructionPrompt({ owner_id: SHELF_PLUGIN_ID, prompt_id: "shelf.shortcut", version: /* @version prompt.shelf.shortcut */ 2,
    title: "置物架快捷动作", purpose: "按用户选择的快捷动作处理材料", used_by: ["置物架 · 快捷动作"],
    ...promptBody("shelf.shortcut") }),
];
export function shelfInstruction(recipe: Exclude<ShelfRecipeId, "extract_text">, optionId: string | null): InstructionPrompt {
  const id = recipe === "shortcut" ? "shelf.shortcut" : `shelf.${recipe.replaceAll("_", "-")}.${optionId}`;
  const prompt = SHELF_INSTRUCTIONS.find(item => item.prompt_id === id);
  if (!prompt) throw new Error("Shelf 指令不存在");
  return prompt;
}
