import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderOpenApiYaml } from "../src/openapi.js";

const target = fileURLToPath(new URL("../openapi.yaml", import.meta.url));
writeFileSync(target, renderOpenApiYaml());
console.log(`wrote ${target}`);
