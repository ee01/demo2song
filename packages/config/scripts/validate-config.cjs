const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const packageDir = resolve(__dirname, "..");
const configPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(packageDir, "config/demo2song.config.json");
const schemaPath = resolve(packageDir, "config/config.schema.json");

const config = JSON.parse(readFileSync(configPath, "utf8"));
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(schema);

const errors = [];
if (!validate(config)) {
  for (const error of validate.errors || []) {
    errors.push(`${error.instancePath || "/"} ${error.message || "is invalid"}`);
  }
}
if (config.limits.minRecordingSeconds > config.limits.maxRecordingSeconds) {
  errors.push("minRecordingSeconds must be <= maxRecordingSeconds");
}
if (config.limits.fullSongMinSeconds > config.limits.fullSongMaxSeconds) {
  errors.push("fullSongMinSeconds must be <= fullSongMaxSeconds");
}

if (errors.length > 0) {
  console.error(`Invalid demo2song config:\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(
  `demo2song config ok: provider=${config.defaultProvider}, demoLimit=${config.limits.dailyDemoJobsPerUser}/day`
);
