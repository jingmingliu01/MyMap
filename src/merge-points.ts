import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { getSelectionConfig, type SelectionConfig } from "./shared/env";
import type { MapPointsFile, PlaceBranch, PlaceGroup, PlaceSelectionFile, PlaceType, SeedFile } from "./shared/schema";
import { CURRENT_POINTS_PATH, GENERATED_POINTS_PATH, LEGACY_POINTS_PATH, ROUTES_PATH, SELECTIONS_DIR } from "./shared/paths";
import { createLlmClient, getLlmConfig, llmChatOptions, type LlmConfig } from "./shared/llm";
import { POI_CANDIDATE_SELECTION_PROMPT_PATH, readPrompt } from "./shared/prompts";
import { LLM_SELECTION_OUTPUT_CONTRACT, createSelectionPromptHash, maxSelectedForGroup } from "./shared/selection-policy";
import { slugify } from "./shared/slug";

const PLACE_TYPES = ["restaurant", "cafe", "attraction", "mall", "place"] as const;
const GROUP_COLORS = ["#d84f3a", "#247b5f", "#4d64c8", "#8a5a32", "#8f4fc7", "#cc7a1f", "#3d7f89", "#b9486a"];
const BranchSelection = z.object({
  group_type: z.enum(PLACE_TYPES).describe("The inferred semantic type of the requested place group."),
  selected_branch_ids: z.array(z.number().int().positive()).describe("Branch ids that should remain in the final map."),
  rejected_branch_ids: z.array(z.number().int().positive()).describe("Branch ids that should be excluded."),
  notes: z.string().describe("A short explanation of the selection.")
});

type BranchSelectionResult = z.infer<typeof BranchSelection>;

const SelectionCache = BranchSelection.extend({
  source_place_file: z.string(),
  source_hash: z.string(),
  prompt_hash: z.string(),
  provider: z.string(),
  model: z.string(),
  name: z.string(),
  city: z.string()
});

interface PlaceGroupSource {
  group: PlaceGroup;
  filePath: string;
  sourcePlaceFile: string;
  sourceHash: string;
}

async function main() {
  const placesDir = process.argv[2] ?? "data/places";
  const outputPath = process.argv[3] ?? GENERATED_POINTS_PATH;
  const seedPath = process.env.SEED_PATH ?? "data/seeds.json";
  const seed = await readSeed(seedPath);
  const placeSources = await readPlaceGroupsForSeed(seed, placesDir);
  const llmConfig = getLlmConfig();
  const selectionConfig = getSelectionConfig();
  const openai = createLlmClient(llmConfig);
  const selectionPrompt = await readPrompt(POI_CANDIDATE_SELECTION_PROMPT_PATH);
  const promptHash = createSelectionPromptHash(selectionPrompt, selectionConfig);

  console.log(`Filtering candidate branches with ${llmConfig.provider} model: ${llmConfig.model}`);
  console.log(
    `Selection policy: max ${selectionConfig.maxSelectedBranches} branch(es), max ${selectionConfig.maxSelectedAttractionBranches} attraction branch(es).`
  );
  console.log(`Using ${seedPath}: ${seed.items.join(", ")}`);

  const filteredGroups: Array<{ group: PlaceGroup; groupType: PlaceType; branches: PlaceBranch[] }> = [];
  for (const placeSource of placeSources) {
    const { group } = placeSource;
    if (group.branches.length === 0) {
      console.warn(`${group.name}: skipped 0/0. No POI candidates were available.`);
      continue;
    }

    const selection = await getSelection(openai, llmConfig, selectionPrompt, promptHash, selectionConfig, placeSource);
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
    city: seed.city,
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

async function getSelection(
  openai: OpenAI,
  llmConfig: LlmConfig,
  selectionPrompt: string,
  promptHash: string,
  selectionConfig: SelectionConfig,
  placeSource: PlaceGroupSource
): Promise<PlaceSelectionFile> {
  const selectionPath = path.join(SELECTIONS_DIR, `${path.basename(placeSource.filePath, ".json")}.selection.json`);
  const cached = await readCachedSelection(selectionPath, llmConfig, promptHash, selectionConfig, placeSource);
  if (cached) {
    console.log(`${placeSource.group.name}: reused cached selection ${selectionPath}`);
    return cached;
  }

  const semanticSelection = await selectRelevantBranches(openai, llmConfig, selectionPrompt, selectionConfig, placeSource.group);
  const selection: PlaceSelectionFile = {
    source_place_file: placeSource.sourcePlaceFile,
    source_hash: placeSource.sourceHash,
    prompt_hash: promptHash,
    provider: llmConfig.provider,
    model: llmConfig.model,
    name: placeSource.group.name,
    city: placeSource.group.city,
    group_type: semanticSelection.group_type,
    selected_branch_ids: semanticSelection.selected_branch_ids,
    rejected_branch_ids: semanticSelection.rejected_branch_ids,
    notes: semanticSelection.notes
  };

  await writeJson(selectionPath, selection);
  console.log(`${placeSource.group.name}: wrote selection ${selectionPath}`);
  return selection;
}

async function readCachedSelection(
  selectionPath: string,
  llmConfig: LlmConfig,
  promptHash: string,
  selectionConfig: SelectionConfig,
  placeSource: PlaceGroupSource
): Promise<PlaceSelectionFile | null> {
  let content: string;
  try {
    content = await readFile(selectionPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  let rawCache: unknown;
  try {
    rawCache = JSON.parse(content);
  } catch {
    console.warn(`${selectionPath}: ignored invalid selection cache JSON.`);
    return null;
  }

  const parsed = SelectionCache.safeParse(rawCache);
  if (!parsed.success) {
    return null;
  }

  const cached = parsed.data;
  const matchesSource =
    cached.source_hash === placeSource.sourceHash &&
    cached.prompt_hash === promptHash &&
    cached.provider === llmConfig.provider &&
    cached.model === llmConfig.model &&
    cached.name === placeSource.group.name &&
    cached.city === placeSource.group.city;

  if (!matchesSource) {
    return null;
  }

  const sanitized = sanitizeSelection(cached, placeSource.group.branches, maxSelectedForGroup(cached.group_type, selectionConfig));
  return {
    source_place_file: cached.source_place_file,
    source_hash: cached.source_hash,
    prompt_hash: cached.prompt_hash,
    provider: cached.provider,
    model: cached.model,
    name: cached.name,
    city: cached.city,
    group_type: sanitized.group_type,
    selected_branch_ids: sanitized.selected_branch_ids,
    rejected_branch_ids: sanitized.rejected_branch_ids,
    notes: sanitized.notes
  };
}

async function selectRelevantBranches(
  openai: OpenAI,
  llmConfig: LlmConfig,
  selectionPrompt: string,
  selectionConfig: SelectionConfig,
  group: PlaceGroup
): Promise<BranchSelectionResult> {
  const candidates = group.branches.map((branch) => ({
    id: branch.id,
    name: branch.branch_name,
    address: branch.address,
    district: branch.district
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
            query: group.name,
            city: group.city,
            candidates,
            output_contract: LLM_SELECTION_OUTPUT_CONTRACT
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
  return sanitizeSelection(parsed, group.branches, maxSelectedForGroup(parsed.group_type, selectionConfig));
}

function sanitizeSelection(selection: BranchSelectionResult, branches: PlaceBranch[], maxSelected: number): BranchSelectionResult {
  const validIds = new Set(branches.map((branch) => branch.id));
  const selected_branch_ids = unique(selection.selected_branch_ids).filter((id) => validIds.has(id)).slice(0, maxSelected);
  const selectedIdSet = new Set(selected_branch_ids);
  const rejected_branch_ids = unique([
    ...selection.rejected_branch_ids,
    ...branches.map((branch) => branch.id).filter((id) => !selectedIdSet.has(id))
  ]).filter((id) => validIds.has(id) && !selectedIdSet.has(id));

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

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readSeed(seedPath: string): Promise<SeedFile> {
  const seed = JSON.parse(await readFile(seedPath, "utf8")) as SeedFile;
  if (!seed || typeof seed.city !== "string" || !Array.isArray(seed.items)) {
    throw new Error(`${seedPath} must match { "city": "城市名", "items": ["..."] }`);
  }
  if (!seed.city.trim()) {
    throw new Error(`${seedPath} city must be a non-empty string.`);
  }
  return seed;
}

async function readPlaceGroupsForSeed(seed: SeedFile, placesDir: string): Promise<PlaceGroupSource[]> {
  const groups: PlaceGroupSource[] = [];
  for (const item of seed.items) {
    const file = `${slugify(item)}.json`;
    const filePath = path.join(placesDir, file);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Missing ${filePath} for seed item ${item}. Run npm run fetch:places or npm start first.`);
      }
      throw error;
    }

    const group = JSON.parse(content) as PlaceGroup;
    validatePlaceGroup(group, filePath);
    if (group.name !== item) {
      throw new Error(`${filePath} has name=${JSON.stringify(group.name)}, but current seed item is ${JSON.stringify(item)}.`);
    }
    if (group.city !== seed.city) {
      throw new Error(`${filePath} has city=${JSON.stringify(group.city)}, but current seed city is ${JSON.stringify(seed.city)}. Run npm run fetch:places again.`);
    }
    groups.push({
      group,
      filePath,
      sourcePlaceFile: path.relative(process.cwd(), filePath),
      sourceHash: hashText(content)
    });
  }

  return groups;
}

function validatePlaceGroup(group: PlaceGroup, filePath: string) {
  if (!group.name || !group.city || !group.type || !Array.isArray(group.branches)) {
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
