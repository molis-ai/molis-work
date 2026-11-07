import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** A generation rebuilds this library after the other cases (scripts/golden/populate.mjs), so this one runs after that. */
export const afterKnowledgeRebuild = true;

/** knowledge/knowledge.db: a person changing a card's title, which a later organizing must not overwrite. Cards come from the catalog, so there is nothing to create. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const { cards } = await call("knowledge.cards", { limit: 1 });
  const { subject } = cards[0];
  await call("knowledge.card.edit", { subject, title: `金样卡片 ${tag}` });
  readsBack(await call("knowledge.cards"), `金样卡片 ${tag}`);
}
