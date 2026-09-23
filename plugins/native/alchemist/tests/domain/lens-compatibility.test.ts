import { describe, expect, it } from "vitest";
import {
  buildLensCompatibilityKey,
  lensKeysMatch,
  marketLensCompatibilityKey,
} from "../../src/studio/domain/research/lens";

describe("Lens compatibility keys", () => {
  it("binds market research to the exact IdeaVersion", () => {
    expect(marketLensCompatibilityKey("idea_01", 2)).toEqual({
      ideaId: "idea_01",
      ideaVersion: 2,
      lens: "market_space",
    });
  });

  it("also binds build-cost research to the exact MVP scope", () => {
    expect(buildLensCompatibilityKey("idea_01", 2, 3)).toEqual({
      ideaId: "idea_01",
      ideaVersion: 2,
      mvpScopeVersion: 3,
      lens: "build_cost",
    });
  });

  it("never treats a report from another version as compatible", () => {
    expect(
      lensKeysMatch(marketLensCompatibilityKey("idea_01", 1), marketLensCompatibilityKey("idea_01", 2)),
    ).toBe(false);
    expect(
      lensKeysMatch(buildLensCompatibilityKey("idea_01", 2, 1), buildLensCompatibilityKey("idea_01", 2, 2)),
    ).toBe(false);
  });
});
