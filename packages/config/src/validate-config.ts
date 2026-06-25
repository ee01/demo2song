import { loadValidatedConfig } from "./index.js";

const config = loadValidatedConfig(process.argv[2]);

console.log(
  `demo2song config ok: provider=${config.defaultProvider}, demoLimit=${config.limits.dailyDemoJobsPerUser}/day`
);
