// The two generated-by-hand indexes that are allowed to be incomplete no longer are: every review under docs/reviews/
// and every design README under docs/design/*/ must be linked from its index. The indexes are Markdown, not generated
// files, so this is the cheap freshness check: adding a review or a design directory without listing it fails.
import path from "node:path";

function linked(index, target) {
  return index.includes(`](${target})`) || index.includes(`](${target}#`);
}

function missingFrom(indexText, targets, problems, label) {
  for (const target of targets) {
    if (!linked(indexText, target)) problems.push(`${label}: ${target} is not linked from the index`);
  }
}

export function docIndexProblems(snapshot) {
  const problems = [];
  const reviews = snapshot.read("docs/reviews/README.md");
  if (reviews !== null) {
    const targets = snapshot.files
      .filter((file) => file.startsWith("docs/reviews/") && file.endsWith(".md") && file !== "docs/reviews/README.md")
      .map((file) => path.posix.relative("docs/reviews", file));
    missingFrom(reviews, targets, problems, "docs/reviews/README.md");
  }
  const design = snapshot.read("docs/design/README.md");
  if (design !== null) {
    const targets = snapshot.files
      .filter((file) => /^docs\/design\/[^/]+\/README\.md$/.test(file))
      .map((file) => path.posix.relative("docs/design", file));
    missingFrom(design, targets, problems, "docs/design/README.md");
  }
  return problems;
}
