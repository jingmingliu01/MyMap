import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const GENERATED_DATA_FILES = [
  "data/map-points.generated.json",
  "data/map-points.json",
  "data/map-state.json",
  "data/routes.json",
  "data/map-points.preview.json",
  "data/routes.preview.json",
  "data/render/map-points.json",
  "data/render/routes.json",
  "data/preview/pending-edit.json",
  "data/preview/map-points.json",
  "data/preview/routes.json",
  "data/workspace/places.json",
  "data/workspace/branches.json",
  "data/workspace/categories.json",
  "data/workspace/tags.json",
  "data/workspace/tag-assignments.json",
  "data/workspace/routes.json",
  "data/workspace/imports.json"
];

async function main() {
  for (const filePath of GENERATED_DATA_FILES) {
    await rm(filePath, { force: true });
  }

  await removeMatchingFiles("data/places", (fileName) => fileName.endsWith(".json"));
  await removeMatchingFiles("data/selections", (fileName) => fileName.endsWith(".selection.json"));

  console.log("Cleaned generated data. Kept data/seeds.json, data/seeds.example.json, and .gitkeep files.");
}

async function removeMatchingFiles(dirPath, shouldRemove) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && shouldRemove(entry.name))
      .map((entry) => rm(path.join(dirPath, entry.name), { force: true }))
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
