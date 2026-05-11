import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { getSelectionConfig, type SelectionConfig } from "./shared/env";
import type { PlaceBranch, PlaceSourceFile, PlaceSelectionFile, PlaceType, SeedFile } from "./shared/schema";
import { RENDER_POINTS_PATH, SELECTIONS_DIR } from "./shared/paths";
import { createLlmClient, getLlmConfig, llmChatOptions, type LlmConfig } from "./shared/llm";
import { POI_CANDIDATE_SELECTION_PROMPT_PATH, readPrompt } from "./shared/prompts";
import { LLM_SELECTION_OUTPUT_CONTRACT, createSelectionPromptHash, maxSelectedForPlace } from "./shared/selection-policy";
import { slugify } from "./shared/slug";
import { writeWorkspaceFromSelectedBranches } from "./server/workspace";

const PLACE_TYPES = ["restaurant", "cafe", "attraction", "mall", "place"] as const;
const BranchSelection = z.object({
  place_type: z.enum(PLACE_TYPES).describe("The inferred semantic type of the requested place."),
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

interface PlaceImportSource {
  placeFile: PlaceSourceFile;
  filePath: string;
  sourcePlaceFile: string;
  sourceHash: string;
}

async function main() {
  const placesDir = process.argv[2] ?? "data/places";
  const outputPath = process.argv[3] ?? RENDER_POINTS_PATH;
  const seedPath = process.env.SEED_PATH ?? "data/seeds.json";
  const seed = await readSeed(seedPath);
  const placeSources = await readPlaceSourceFilesForSeed(seed, placesDir);
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

  const selectedPlaces: Array<{ placeFile: PlaceSourceFile; placeType: PlaceType; branches: PlaceBranch[] }> = [];
  for (const placeSource of placeSources) {
    const { placeFile } = placeSource;
    if (placeFile.branches.length === 0) {
      console.warn(`${placeFile.name}: skipped 0/0. No POI candidates were available.`);
      continue;
    }

    const selection = await getSelection(openai, llmConfig, selectionPrompt, promptHash, selectionConfig, placeSource);
    const selectedIds = new Set(selection.selected_branch_ids);
    const filteredBranches = placeFile.branches.filter((branch) => selectedIds.has(branch.id));

    if (filteredBranches.length === 0) {
      console.warn(`${placeFile.name}: skipped 0/${placeFile.branches.length}. ${selection.notes}`);
      continue;
    }

    console.log(`${placeFile.name}: kept ${filteredBranches.length}/${placeFile.branches.length} as ${selection.place_type}. ${selection.notes}`);
    selectedPlaces.push({ placeFile, placeType: selection.place_type, branches: filteredBranches });
  }

  const selectedBranchCount = selectedPlaces.reduce((total, place) => total + place.branches.length, 0);
  if (selectedBranchCount === 0) {
    throw new Error("LLM selected 0 points for all current seed items. Refusing to write an empty map.");
  }

  const rendered = await writeWorkspaceFromSelectedBranches({
    city: seed.city,
    sourcePath: seedPath,
    places: selectedPlaces.map(({ placeFile, placeType, branches }) => ({
      placeName: placeFile.name,
      placeType,
      branches: branches.map((branch) => ({
        branchName: branch.branch_name,
        address: branch.address,
        district: branch.district,
        longitude: branch.longitude,
        latitude: branch.latitude,
        providerPlaceId: branch.provider_place_id,
        providerType: branch.provider_type,
        providerTypecode: branch.provider_typecode
      }))
    }))
  });
  if (outputPath !== RENDER_POINTS_PATH) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeJson(outputPath, rendered.mapPoints);
  }
  console.log(`Wrote ${rendered.mapPoints.points.length} points to ${outputPath}`);
  console.log(`Reset workspace source of truth and render artifacts.`);
}

async function getSelection(
  openai: OpenAI,
  llmConfig: LlmConfig,
  selectionPrompt: string,
  promptHash: string,
  selectionConfig: SelectionConfig,
  placeSource: PlaceImportSource
): Promise<PlaceSelectionFile> {
  const selectionPath = path.join(SELECTIONS_DIR, `${path.basename(placeSource.filePath, ".json")}.selection.json`);
  const cached = await readCachedSelection(selectionPath, llmConfig, promptHash, selectionConfig, placeSource);
  if (cached) {
    console.log(`${placeSource.placeFile.name}: reused cached selection ${selectionPath}`);
    return cached;
  }

  const semanticSelection = await selectRelevantBranches(openai, llmConfig, selectionPrompt, selectionConfig, placeSource.placeFile);
  const selection: PlaceSelectionFile = {
    source_place_file: placeSource.sourcePlaceFile,
    source_hash: placeSource.sourceHash,
    prompt_hash: promptHash,
    provider: llmConfig.provider,
    model: llmConfig.model,
    name: placeSource.placeFile.name,
    city: placeSource.placeFile.city,
    place_type: semanticSelection.place_type,
    selected_branch_ids: semanticSelection.selected_branch_ids,
    rejected_branch_ids: semanticSelection.rejected_branch_ids,
    notes: semanticSelection.notes
  };

  await writeJson(selectionPath, selection);
  console.log(`${placeSource.placeFile.name}: wrote selection ${selectionPath}`);
  return selection;
}

async function readCachedSelection(
  selectionPath: string,
  llmConfig: LlmConfig,
  promptHash: string,
  selectionConfig: SelectionConfig,
  placeSource: PlaceImportSource
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
    cached.name === placeSource.placeFile.name &&
    cached.city === placeSource.placeFile.city;

  if (!matchesSource) {
    return null;
  }

  const sanitized = sanitizeSelection(cached, placeSource.placeFile.branches, maxSelectedForPlace(cached.place_type, selectionConfig));
  return {
    source_place_file: cached.source_place_file,
    source_hash: cached.source_hash,
    prompt_hash: cached.prompt_hash,
    provider: cached.provider,
    model: cached.model,
    name: cached.name,
    city: cached.city,
    place_type: sanitized.place_type,
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
  placeFile: PlaceSourceFile
): Promise<BranchSelectionResult> {
  const candidates = placeFile.branches.map((branch) => ({
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
            query: placeFile.name,
            city: placeFile.city,
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
    throw new Error(`LLM did not return branch selection content for ${placeFile.name}.`);
  }

  const parsed = BranchSelection.parse(parseJsonObject(content));
  return sanitizeSelection(parsed, placeFile.branches, maxSelectedForPlace(parsed.place_type, selectionConfig));
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
    place_type: selection.place_type,
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

async function readPlaceSourceFilesForSeed(seed: SeedFile, placesDir: string): Promise<PlaceImportSource[]> {
  const placeSources: PlaceImportSource[] = [];
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

    const placeFile = JSON.parse(content) as PlaceSourceFile;
    validatePlaceSourceFile(placeFile, filePath);
    if (placeFile.name !== item) {
      throw new Error(`${filePath} has name=${JSON.stringify(placeFile.name)}, but current seed item is ${JSON.stringify(item)}.`);
    }
    if (placeFile.city !== seed.city) {
      throw new Error(`${filePath} has city=${JSON.stringify(placeFile.city)}, but current seed city is ${JSON.stringify(seed.city)}. Run npm run fetch:places again.`);
    }
    placeSources.push({
      placeFile,
      filePath,
      sourcePlaceFile: path.relative(process.cwd(), filePath),
      sourceHash: hashText(content)
    });
  }

  return placeSources;
}

function validatePlaceSourceFile(placeFile: PlaceSourceFile, filePath: string) {
  if (!placeFile.name || !placeFile.city || !placeFile.type || !Array.isArray(placeFile.branches)) {
    throw new Error(`${filePath} is not a valid place source JSON file.`);
  }

  for (const branch of placeFile.branches) {
    if (!Number.isFinite(branch.longitude) || !Number.isFinite(branch.latitude)) {
      throw new Error(`${filePath} has a branch without valid longitude/latitude.`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
