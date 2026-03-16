import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";
import { readFileSync, writeFileSync } from "node:fs";

const sourceManifest = JSON.parse(
  readFileSync(new URL("./addon/manifest.json", import.meta.url), "utf8"),
);
const zoteroApplication = sourceManifest.applications?.zotero ?? {};

export default defineConfig({
  source: ["src", "addon"],
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  build: {
    assets: ["addon/**/*.*"],
    fluent: {
      dts: false,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        outfile: ".scaffold/build/addon/content/scripts/citegen.js",
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox115",
      },
    ],
    makeUpdateJson: {
      updates: [],
    },
    hooks: {
      "build:makeManifest": (ctx) => {
        const manifestPath = `${ctx.dist}/addon/manifest.json`;
        const manifest = {
          manifest_version: 2,
          name: pkg.config.addonName,
          version: pkg.version,
          description: pkg.description,
          homepage_url: pkg.repository?.url || undefined,
          applications: {
            zotero: {
              ...zoteroApplication,
              id: pkg.config.addonID,
              update_url: ctx.updateURL || zoteroApplication.update_url,
            },
            gecko: {
              id: pkg.config.addonID,
              strict_min_version: "115.0",
            },
          },
        };

        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      },
    },
  },
});
