import { createHash } from "node:crypto";
import type { SelectionConfig } from "./env";
import type { PlaceType } from "./schema";

export const LLM_SELECTION_OUTPUT_CONTRACT = {
  group_type: "restaurant | cafe | attraction | mall | place",
  selected_branch_ids: "number[] of candidate ids to keep",
  rejected_branch_ids: "number[] of candidate ids to exclude",
  notes: "short explanation"
};

export function createSelectionPromptHash(selectionPrompt: string, selectionConfig: SelectionConfig): string {
  return hashText(`${selectionPrompt}\n${JSON.stringify(LLM_SELECTION_OUTPUT_CONTRACT)}\n${JSON.stringify(selectionConfig)}`);
}

export function maxSelectedForGroup(groupType: PlaceType, config: SelectionConfig): number {
  return groupType === "attraction" ? config.maxSelectedAttractionBranches : config.maxSelectedBranches;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

