import path from "node:path";
import * as nodeProcess from "node:process";
import { defineConfig } from "@tarojs/cli";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: path.resolve(nodeProcess.env.INIT_CWD ?? nodeProcess.cwd(), ".env") });

const PRODUCTION_API_BASE = "https://api.demo2song.eexx.me";
const apiBase = nodeProcess.env.TARO_APP_API_BASE || PRODUCTION_API_BASE;

export default defineConfig({
  projectName: "demo2song",
  date: "2026-06-23",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  defineConstants: {
    __API_BASE__: JSON.stringify(apiBase)
  },
  mini: {},
  h5: {}
});
