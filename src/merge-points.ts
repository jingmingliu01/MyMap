import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import type { MapPointsFile, PlaceBranch, PlaceGroup, PlaceType, SeedFile } from "./shared/schema";
import { CURRENT_POINTS_PATH, GENERATED_POINTS_PATH, LEGACY_POINTS_PATH, ROUTES_PATH } from "./shared/paths";
import { createLlmClient, getLlmConfig, llmChatOptions, type LlmConfig } from "./shared/llm";
import { POI_CANDIDATE_SELECTION_PROMPT_PATH, readPrompt } from "./shared/prompts";
import { slugify } from "./shared/slug";

const DEFAULT_MAX_SELECTED_BRANCHES = 5;
const GROUP_COLORS = ["#d84f3a", "#247b5f", "#4d64c8", "#8a5a32", "#8f4fc7", "#cc7a1f", "#3d7f89", "#b9486a"];

const BranchSelection = z.object({
  group_type: z.enum(["restaurant", "cafe", "attraction", "mall", "place"]).describe("The inferred semantic type of the requested place group."),
  selected_branch_ids: z.array(z.number().int().positive()).describe("Branch ids that should remain in the final map."),
  rejected_branch_ids: z.array(z.number().int().positive()).describe("Branch ids that should be excluded."),
  notes: z.string().describe("A short explanation of the selection.")
});

type BranchSelectionResult = z.infer<typeof BranchSelection>;

async function main() {
  const placesDir = process.argv[2] ?? "data/places";
  const outputPath = process.argv[3] ?? GENERATED_POINTS_PATH;
  const seedPath = process.env.SEED_PATH ?? "data/seeds.json";
  const seed = await readSeed(seedPath);
  const groups = await readPlaceGroupsForSeed(seed, placesDir);
  const llmConfig = getLlmConfig();
  const openai = createLlmClient(llmConfig);
  const selectionPrompt = await readPrompt(POI_CANDIDATE_SELECTION_PROMPT_PATH);

  console.log(`Filtering candidate branches with ${llmConfig.provider} model: ${llmConfig.model}`);
  console.log(`Using ${seedPath}: ${seed.items.join(", ")}`);

  const filteredGroups: Array<{ group: PlaceGroup; groupType: PlaceType; branches: PlaceBranch[] }> = [];
  for (const group of groups) {
    if (group.branches.length === 0) {
      console.warn(`${group.name}: skipped 0/0. No POI candidates were available.`);
      continue;
    }

    const selection = await selectRelevantBranches(openai, llmConfig, selectionPrompt, group);
    const selectedIds = new Set(selection.selected_branch_ids);
    const filteredBranches = group.branches.filter((branch) => selectedIds.has(branch.id));

    if (filteredBranches.length === 0) {
      console.warn(`${group.name}: skipped 0/${group.branches.length}. ${selection.notes}`);
      continue;
    }

    console.log(`${group.name}: kept ${filteredBranches.length}/${group.branches.length} as ${selection.group_type}. ${selection.notes}`);
    filteredGroups.push({ group, groupType: selection.group_type, branches: filteredBranches });
  }

  const merged: MapPointsFile = {
    city: "广州",
    coordinate_system: "GCJ-02",
    map_provider: "amap",
    points: filteredGroups.flatMap(({ group, groupType, branches }, groupIndex) => {
      const slug = slugify(group.name);
      const groupColor = GROUP_COLORS[groupIndex % GROUP_COLORS.length];

      return branches.map((branch, index) => {
        const branchId = index + 1;
        return {
          id: `${slug}-${branchId}`,
          group_name: group.name,
          group_type: groupType,
          group_color: groupColor,
          branch_id: branchId,
          branch_name: branch.branch_name,
          label: String(branchId),
          address: branch.address,
          district: branch.district,
          longitude: branch.longitude,
          latitude: branch.latitude,
          visible: true
        };
      });
    })
  };

  if (merged.points.length === 0) {
    throw new Error("LLM selected 0 points for all current seed items. Refusing to write an empty map.");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeJson(outputPath, merged);
  await writeJson(CURRENT_POINTS_PATH, merged);
  await writeJson(LEGACY_POINTS_PATH, merged);
  await writeJson(ROUTES_PATH, { routes: [] });
  console.log(`Wrote ${merged.points.length} points to ${outputPath}`);
  console.log(`Reset editable state at ${CURRENT_POINTS_PATH}`);
}

async function selectRelevantBranches(
  openai: OpenAI,
  llmConfig: LlmConfig,
  selectionPrompt: string,
  group: PlaceGroup
): Promise<BranchSelectionResult> {
  const candidates = group.branches.map((branch) => ({
    id: branch.id,
    branch_name: branch.branch_name,
    address: branch.address,
    district: branch.district,
    longitude: branch.longitude,
    latitude: branch.latitude,
    coordinate_system: branch.coordinate_system,
    map_provider: branch.map_provider
  }));

  const response = await openai.chat.completions.create({
    model: llmConfig.model,
    messages: [
      {
        role: "system",
        content: selectionPrompt
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            requested_place_name: group.name,
            city: "广州",
            candidates,
            output_contract: {
              group_type: "one of: restaurant, cafe, attraction, mall, place",
              selected_branch_ids: `array of candidate ids to keep, max ${DEFAULT_MAX_SELECTED_BRANCHES} unless a single canonical candidate is clearly best`,
              rejected_branch_ids: "array of candidate ids to exclude",
              notes: "short explanation"
            }
          },
          null,
          2
        )
      }
    ],
    response_format: {
      type: "json_object"
    },
    ...llmChatOptions(llmConfig)
  } as never);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`LLM did not return branch selection content for ${group.name}.`);
  }

  const parsed = BranchSelection.parse(parseJsonObject(content));
  return sanitizeSelection(parsed, group.branches, parsed.group_type === "attraction" ? 1 : DEFAULT_MAX_SELECTED_BRANCHES);
}

function sanitizeSelection(selection: BranchSelectionResult, branches: PlaceBranch[], maxSelected: number): BranchSelectionResult {
  const validIds = new Set(branches.map((branch) => branch.id));
  const selected_branch_ids = unique(selection.selected_branch_ids).filter((id) => validIds.has(id)).slice(0, maxSelected);
  const rejected_branch_ids = unique(selection.rejected_branch_ids).filter((id) => validIds.has(id));

  return {
    group_type: selection.group_type,
    selected_branch_ids,
    rejected_branch_ids,
    notes: selection.notes
  };
}

function unique(values: number[]): number[] {
  return Array.from(new Set(values));
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("LLM returned content that was not JSON.");
    }
    return JSON.parse(match[0]);
  }
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readSeed(seedPath: string): Promise<SeedFile> {
  const seed = JSON.parse(await readFile(seedPath, "utf8")) as SeedFile;
  if (!seed || typeof seed.city !== "string" || !Array.isArray(seed.items)) {
    throw new Error(`${seedPath} must match { "city": "广州", "items": ["..."] }`);
  }
  if (seed.city !== "广州") {
    throw new Error(`This MVP is scoped to 广州, but ${seedPath} has city=${JSON.stringify(seed.city)}.`);
  }
  return seed;
}

async function readPlaceGroupsForSeed(seed: SeedFile, placesDir: string): Promise<PlaceGroup[]> {
  const groups: PlaceGroup[] = [];
  for (const item of seed.items) {
    const file = `${slugify(item)}.json`;
    const filePath = path.join(placesDir, file);
    try {
      await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Missing ${filePath} for seed item ${item}. Run npm run fetch:places or npm start first.`);
      }
      throw error;
    }

    const group = JSON.parse(await readFile(filePath, "utf8")) as PlaceGroup;
    validatePlaceGroup(group, filePath);
    if (group.name !== item) {
      throw new Error(`${filePath} has name=${JSON.stringify(group.name)}, but current seed item is ${JSON.stringify(item)}.`);
    }
    groups.push(group);
  }

  return groups;
}

function validatePlaceGroup(group: PlaceGroup, filePath: string) {
  if (!group.name || !group.type || !Array.isArray(group.branches)) {
    throw new Error(`${filePath} is not a valid place group JSON file.`);
  }

  for (const branch of group.branches) {
    if (!Number.isFinite(branch.longitude) || !Number.isFinite(branch.latitude)) {
      throw new Error(`${filePath} has a branch without valid longitude/latitude.`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
