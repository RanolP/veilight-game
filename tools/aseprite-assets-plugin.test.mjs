import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAsepriteArgs, exportAsepriteAssets } from "./aseprite-assets-plugin.mjs";

async function tempRoot() {
  const root = join(
    tmpdir(),
    `veilight-aseprite-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(root, { recursive: true });
  return root;
}

test("exports added aseprite files and removes generated outputs for deleted sources", async () => {
  const root = await tempRoot();
  const sourceDir = "assets/aseprite";
  const generatedDir = "generated/aseprite";
  const sourcePath = join(root, sourceDir, "characters", "light.aseprite");
  const calls = [];

  await mkdir(join(root, sourceDir, "characters"), { recursive: true });
  await writeFile(sourcePath, "aseprite-data");

  const runner = async (command, args) => {
    calls.push([command, args]);
    const sheet = args[args.indexOf("--sheet") + 1];
    const data = args[args.indexOf("--data") + 1];
    await mkdir(dirname(sheet), { recursive: true });
    await mkdir(dirname(data), { recursive: true });
    await writeFile(sheet, "png");
    await writeFile(data, "json");
  };

  await exportAsepriteAssets({ root, sourceDir, generatedDir, cliPath: "aseprite-test", runner });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "aseprite-test");
  assert.equal(await readFile(join(root, generatedDir, "characters", "light.png"), "utf8"), "png");
  assert.equal(
    await readFile(join(root, generatedDir, "characters", "light.json"), "utf8"),
    "json",
  );

  await exportAsepriteAssets({ root, sourceDir, generatedDir, cliPath: "aseprite-test", runner });
  assert.equal(calls.length, 1);

  await rm(sourcePath);
  await exportAsepriteAssets({ root, sourceDir, generatedDir, cliPath: "aseprite-test", runner });

  await assert.rejects(stat(join(root, generatedDir, "characters", "light.png")));
  await assert.rejects(stat(join(root, generatedDir, "characters", "light.json")));

  await rm(root, { recursive: true, force: true });
});

test("creates predictable aseprite cli arguments", () => {
  const args = createAsepriteArgs(
    {
      sourcePath: "input.aseprite",
      sheetPath: "out.png",
      dataPath: "out.json",
    },
    { format: "json-array" },
  );

  assert.deepEqual(args, [
    "--batch",
    "input.aseprite",
    "--sheet",
    "out.png",
    "--data",
    "out.json",
    "--format",
    "json-array",
    "--list-tags",
    "--list-slices",
  ]);
});
