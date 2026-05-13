import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { asepriteAssets } from "../../tools/aseprite-assets-plugin.mjs";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, "");

  return {
    base: "/",
    plugins: [
      asepriteAssets({
        root: workspaceRoot,
        sourceDir: "assets/aseprite",
        generatedDir: "apps/veilight-game/src/generated/aseprite",
        cliPath: env.ASEPRITE_CLI,
      }),
    ],
  };
});
