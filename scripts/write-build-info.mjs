// Runs at the start of the Netlify build (see `ci:build` in package.json).
// COMMIT_REF and CONTEXT exist only at build time, not in functions at runtime,
// so we bake them into a JSON file that the functions bundle imports.
import { writeFileSync } from "node:fs";

const info = {
  commit: process.env.COMMIT_REF ?? "local",
  buildContext: process.env.CONTEXT ?? "local",
  builtAt: new Date().toISOString(),
};

writeFileSync(new URL("../src/core/build-info.json", import.meta.url), JSON.stringify(info, null, 2) + "\n");
console.log("build info:", info);
