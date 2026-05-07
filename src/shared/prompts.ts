import { readFile } from "node:fs/promises";

export const POI_CANDIDATE_SELECTION_PROMPT_PATH = "src/prompts/poi-candidate-selection.md";
export const MAP_EDITING_AGENT_PROMPT_PATH = "src/prompts/map-editing-agent.md";

export async function readPrompt(filePath: string): Promise<string> {
  return (await readFile(filePath, "utf8")).trim();
}
