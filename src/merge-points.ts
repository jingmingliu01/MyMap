import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { MapPointsFile, PlaceBranch, PlaceGroup, PlaceType, SeedFile } from "./shared/schema.js";
import { CURRENT_POINTS_PATH, GENERATED_POINTS_PATH, LEGACY_POINTS_PATH, ROUTES_PATH } from "./shared/paths.js";
import { slugify } from "./shared/slug.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.5";
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
  const openai = createOpenAIClient();
  const openai_model = process.env.openai_model || DEFAULT_OPENAI_MODEL;

  console.log(`Filtering candidate branches with OpenAI model: ${openai_model}`);
  console.log(`Using ${seedPath}: ${seed.items.join(", ")}`);

  const filteredGroups: Array<{ group: PlaceGroup; groupType: PlaceType; branches: PlaceBranch[] }> = [];
  for (const group of groups) {
    if (group.branches.length === 0) {
      console.warn(`${group.name}: skipped 0/0. No AMap candidates were available.`);
      continue;
    }

    const selection = await selectRelevantBranches(openai, openai_model, group);
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
    throw new Error("OpenAI selected 0 points for all current seed items. Refusing to write an empty map.");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeJson(outputPath, merged);
  await writeJson(CURRENT_POINTS_PATH, merged);
  await writeJson(LEGACY_POINTS_PATH, merged);
  await writeJson(ROUTES_PATH, { routes: [] });
  console.log(`Wrote ${merged.points.length} points to ${outputPath}`);
  console.log(`Reset editable state at ${CURRENT_POINTS_PATH}`);
}

function createOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Set it in .env before running npm run merge:points.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

async function selectRelevantBranches(openai: OpenAI, openai_model: string, group: PlaceGroup): Promise<BranchSelectionResult> {
  const candidates = group.branches.map((branch) => ({
    id: branch.id,
    branch_name: branch.branch_name,
    address: branch.address,
    district: branch.district,
    longitude: branch.longitude,
    latitude: branch.latitude
  }));

  const response = await openai.responses.parse({
    model: openai_model,
    input: [
      {
        role: "developer",
        content:
          `You filter AMap POI search candidates for a travel map. First infer the requested place type as one of restaurant, cafe, attraction, mall, or place. Then return only a small, precise set of candidate branch ids that truly represent the requested place or brand in Guangzhou. Exclude subway stations, bus stops, parking lots, entrances/exits, hotels, generic roads, unrelated stores, tourist centers, ticket offices, plazas, and nearby facilities. For a restaurant/cafe/mall brand, keep at most ${DEFAULT_MAX_SELECTED_BRANCHES} real public branches of that brand, prioritizing iconic, central, travel-friendly, or clearly named branches. For a landmark/attraction, keep only the single most canonical main POI.`
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            requested_place_name: group.name,
            city: "广州",
            candidates
          },
          null,
          2
        )
      }
    ],
    text: {
      format: zodTextFormat(BranchSelection, "branch_selection")
    }
  });

  if (!response.output_parsed) {
    throw new Error(`OpenAI did not return structured branch selection for ${group.name}.`);
  }

  return sanitizeSelection(response.output_parsed, group.branches, response.output_parsed.group_type === "attraction" ? 1 : DEFAULT_MAX_SELECTED_BRANCHES);
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
