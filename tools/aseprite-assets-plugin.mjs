import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const asepriteExtensions = new Set([".ase", ".aseprite"]);

export function asepriteAssets(options = {}) {
  const config = normalizeOptions(options);
  let resolvedRoot = config.root;

  return {
    name: "internal:aseprite-assets",

    configResolved(viteConfig) {
      resolvedRoot = config.root ?? viteConfig.root;
    },

    async buildStart() {
      await exportAsepriteAssets({ ...config, root: resolvedRoot });
    },

    configureServer(server) {
      const sourceDir = resolve(resolvedRoot, config.sourceDir);
      server.watcher.add(sourceDir);

      let queued = Promise.resolve();
      const syncAndReload = (path) => {
        if (!isAsepriteFile(path)) {
          return;
        }

        queued = queued
          .then(() => exportAsepriteAssets({ ...config, root: resolvedRoot }))
          .then(() => server.ws.send({ type: "full-reload" }))
          .catch((error) => server.config.logger.error(formatError(error)));
      };

      server.watcher.on("add", syncAndReload);
      server.watcher.on("change", syncAndReload);
      server.watcher.on("unlink", syncAndReload);
    },
  };
}

export async function exportAsepriteAssets(options = {}) {
  const config = normalizeOptions(options);
  const sourceDir = resolve(config.root, config.sourceDir);
  const generatedDir = resolve(config.root, config.generatedDir);
  const manifestPath = resolve(generatedDir, config.manifestFile);
  const previousManifest = await readManifest(manifestPath);
  const sources = await collectAsepriteFiles(sourceDir);
  const currentSources = new Set(
    sources.map((source) => toPortablePath(relative(sourceDir, source))),
  );
  const nextManifest = { version: 1, assets: {} };

  await mkdir(generatedDir, { recursive: true });

  for (const [sourceRel, previousAsset] of Object.entries(previousManifest.assets)) {
    if (currentSources.has(sourceRel)) {
      continue;
    }

    await removeOutputs(generatedDir, previousAsset);
  }

  for (const sourcePath of sources) {
    const sourceRel = toPortablePath(relative(sourceDir, sourcePath));
    const asset = await describeAsset({ config, sourceDir, generatedDir, sourcePath, sourceRel });
    const previousAsset = previousManifest.assets[sourceRel];

    if (await shouldExport(asset, previousAsset, config)) {
      await runAsepriteExport(asset, config);
    }

    nextManifest.assets[sourceRel] = toManifestAsset(asset);
  }

  if (Object.keys(nextManifest.assets).length === 0) {
    await rm(manifestPath, { force: true });
    return nextManifest;
  }

  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

  return nextManifest;
}

export function createAsepriteArgs(asset, config = {}) {
  const format = config.format ?? "json-array";
  const args = [
    "--batch",
    asset.sourcePath,
    "--sheet",
    asset.sheetPath,
    "--data",
    asset.dataPath,
    "--format",
    format,
  ];

  if (config.listTags !== false) {
    args.push("--list-tags");
  }

  if (config.listSlices !== false) {
    args.push("--list-slices");
  }

  return args;
}

function normalizeOptions(options) {
  return {
    root: options.root ?? process.cwd(),
    sourceDir: options.sourceDir ?? "assets/aseprite",
    generatedDir: options.generatedDir ?? "apps/veilight-game/src/generated/aseprite",
    manifestFile: options.manifestFile ?? ".aseprite-assets.json",
    cliPath: options.cliPath ?? process.env.ASEPRITE_CLI ?? "aseprite",
    format: options.format ?? "json-array",
    listTags: options.listTags ?? true,
    listSlices: options.listSlices ?? true,
    runner: options.runner ?? defaultRunner,
  };
}

async function describeAsset({ config, sourceDir, generatedDir, sourcePath, sourceRel }) {
  const sourceContent = await readFile(sourcePath);
  const outputBase = removeAsepriteExtension(sourceRel);
  const sheetPath = resolve(generatedDir, `${outputBase}.png`);
  const dataPath = resolve(generatedDir, `${outputBase}.json`);

  return {
    sourceRel,
    sourcePath,
    sheetPath,
    dataPath,
    sourceSize: sourceContent.byteLength,
    sourceHash: createHash("sha256").update(sourceContent).digest("hex"),
    format: config.format,
    listTags: config.listTags,
    listSlices: config.listSlices,
    outputs: [
      toPortablePath(relative(generatedDir, sheetPath)),
      toPortablePath(relative(generatedDir, dataPath)),
    ],
    sourceBase: toPortablePath(relative(sourceDir, sourcePath)),
  };
}

function toManifestAsset(asset) {
  return {
    outputs: asset.outputs,
    sourceSize: asset.sourceSize,
    sourceHash: asset.sourceHash,
    format: asset.format,
    listTags: asset.listTags,
    listSlices: asset.listSlices,
  };
}

async function shouldExport(asset, previousAsset, config) {
  if (!previousAsset) {
    return true;
  }

  if (
    previousAsset.sourceSize !== asset.sourceSize ||
    previousAsset.sourceHash !== asset.sourceHash ||
    previousAsset.format !== asset.format ||
    previousAsset.listTags !== asset.listTags ||
    previousAsset.listSlices !== asset.listSlices
  ) {
    return true;
  }

  return !(await fileExists(asset.sheetPath)) || !(await fileExists(asset.dataPath));
}

async function runAsepriteExport(asset, config) {
  await mkdir(dirname(asset.sheetPath), { recursive: true });
  await mkdir(dirname(asset.dataPath), { recursive: true });

  const args = createAsepriteArgs(asset, config);

  try {
    await config.runner(config.cliPath, args, { cwd: config.root });
  } catch (error) {
    throw new Error(
      `Failed to export ${asset.sourceRel} with ${config.cliPath}. Set ASEPRITE_CLI or asepriteAssets({ cliPath }) to a working Aseprite CLI path.\n${formatError(error)}`,
    );
  }
}

async function removeOutputs(generatedDir, previousAsset) {
  const outputs = previousAsset.outputs ?? [];

  for (const output of outputs) {
    await rm(resolve(generatedDir, output), { force: true });
  }
}

async function collectAsepriteFiles(sourceDir) {
  if (!(await fileExists(sourceDir))) {
    return [];
  }

  const files = [];
  await collectFilesRecursive(sourceDir, files);
  return files.filter(isAsepriteFile).sort();
}

async function collectFilesRecursive(directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectFilesRecursive(path, files);
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
}

async function readManifest(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { version: 1, assets: {} };
  }
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultRunner(command, args, options) {
  await execFileAsync(command, args, options);
}

function isAsepriteFile(path) {
  return asepriteExtensions.has(extname(path).toLowerCase());
}

function removeAsepriteExtension(path) {
  const extension = extname(path);
  return path.slice(0, -extension.length);
}

function toPortablePath(path) {
  return path.split(sep).join("/");
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}
