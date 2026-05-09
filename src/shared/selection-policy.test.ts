import assert from "node:assert/strict";
import test from "node:test";
import { createSelectionPromptHash, maxSelectedForGroup } from "./selection-policy";

test("selection prompt hash changes when selection limits change", () => {
  const prompt = "Select relevant POI candidates.";
  const lowLimitHash = createSelectionPromptHash(prompt, {
    maxSelectedBranches: 5,
    maxSelectedAttractionBranches: 1
  });
  const highLimitHash = createSelectionPromptHash(prompt, {
    maxSelectedBranches: 10,
    maxSelectedAttractionBranches: 1
  });

  assert.notEqual(lowLimitHash, highLimitHash);
});

test("attraction groups use the attraction-specific selection limit", () => {
  const config = {
    maxSelectedBranches: 10,
    maxSelectedAttractionBranches: 1
  };

  assert.equal(maxSelectedForGroup("restaurant", config), 10);
  assert.equal(maxSelectedForGroup("attraction", config), 1);
});

