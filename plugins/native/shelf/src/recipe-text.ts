export function shelfRecipeTextKey(recipe: string, field: string): string {
  return `shelf.recipe.${recipe.replaceAll("_", "-")}.${field}`;
}
