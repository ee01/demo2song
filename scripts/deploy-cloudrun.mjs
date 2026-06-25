#!/usr/bin/env node
/**
 * 一键部署 demo2song-api + demo2song-worker 到云托管。
 *
 * 原理：
 *   1. 从 .env 读取所有密钥
 *   2. 读取 Dockerfile.api / Dockerfile.worker 模板
 *   3. 在 FROM 之前插入 ENV 层，生成临时 Dockerfile 放到仓库根目录
 *      (Dockerfile 已被 .gitignore 排除，不会进入版本历史)
 *   4. 用 tcb cloudrun deploy --source . 上传并触发云端构建
 *   5. 清理临时 Dockerfile
 *
 * 用法：yarn deploy
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

// 支持 --service api 或 --service worker 单独部署
const serviceArg = (() => {
  const idx = process.argv.indexOf('--service');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const TCB = 'tcb';

// ──────────────────────────────────────────────
// 环境变量加载
// ──────────────────────────────────────────────

function loadEnv() {
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"#\n]*)"?/);
      if (match) process.env[match[1]] ??= match[2].trim();
    }
  } catch {
    // .env 不存在时依赖系统环境变量
  }
}

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`❌  缺少环境变量 ${name}，请在 .env 中配置`);
    process.exit(1);
  }
  return val;
}

// ──────────────────────────────────────────────
// Dockerfile 生成（注入 ENV 到第一个 FROM 之前）
// ──────────────────────────────────────────────

/**
 * 从 .env 生成 ENV 层，追加到 Dockerfile 的最后一个 FROM 之后
 * 以便 runner stage 也能获取这些变量。
 */
function buildDockerfile(templateFile, envVars) {
  const template = readFileSync(resolve(ROOT, templateFile), 'utf8');

  // 构建 ENV 指令块（每个变量一行，值含空格时加引号）
  const envLines = Object.entries(envVars)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => {
      const escaped = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `ENV ${k}="${escaped}"`;
    })
    .join('\n');

  if (!envLines) return template;

  // 在最后一个 FROM 行之后插入 ENV 块
  const lines = template.split('\n');
  let lastFromIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*FROM\s+/i.test(lines[i])) lastFromIdx = i;
  }
  if (lastFromIdx < 0) {
    // 没有 FROM，直接前置
    return envLines + '\n' + template;
  }

  // 在最后一个 FROM 的下一行插入 ENV 块
  lines.splice(lastFromIdx + 1, 0, envLines);
  return lines.join('\n');
}

// ──────────────────────────────────────────────
// 执行工具函数
// ──────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function deployService(serviceName, templateFile, port, envVars) {
  const dockerPath = resolve(ROOT, 'Dockerfile');
  const content = buildDockerfile(templateFile, envVars);
  writeFileSync(dockerPath, content, 'utf8');
  try {
    const portFlag = port ? ` --port ${port}` : '';
    // 通过 echo 0 选择"不启用灰度"，--force 仍保留以跳过其他确认
    run(
      `echo 0 | ${TCB} cloudrun deploy` +
      ` -e ${ENV_ID}` +
      ` -s ${serviceName}` +
      `${portFlag}` +
      ` --source ${ROOT}` +
      ` --force`
    );
  } finally {
    try { unlinkSync(dockerPath); } catch { /* ignore */ }
  }
}

// ──────────────────────────────────────────────
// 主流程
// ──────────────────────────────────────────────

loadEnv();

const ENV_ID          = requireEnv('CLOUDBASE_ENV_ID');
const SECRET_ID       = requireEnv('CLOUDBASE_SECRET_ID');
const SECRET_KEY      = requireEnv('CLOUDBASE_SECRET_KEY');

// 各服务共用配置
const commonEnv = {
  NODE_ENV:            'production',
  DATA_BACKEND:        process.env.DATA_BACKEND        || 'cloudbase',
  CLOUDBASE_ENV_ID:    ENV_ID,
  CLOUDBASE_SECRET_ID: SECRET_ID,
  CLOUDBASE_SECRET_KEY: SECRET_KEY,
  COS_SECRET_ID:       process.env.COS_SECRET_ID,
  COS_SECRET_KEY:      process.env.COS_SECRET_KEY,
  COS_BUCKET:          process.env.COS_BUCKET,
  COS_REGION:          process.env.COS_REGION,
};

const apiEnv = {
  ...commonEnv,
  API_PORT:            '3000',
  WECHAT_LOGIN_STRICT: 'true',
  WECHAT_APP_ID:       process.env.WECHAT_APP_ID,
  WECHAT_APP_SECRET:   process.env.WECHAT_APP_SECRET,
  COS_CDN_BASE_URL:    process.env.COS_CDN_BASE_URL,
  MINIMAX_GROUP_ID:    process.env.MINIMAX_GROUP_ID,
};

const workerEnv = {
  ...commonEnv,
  WORKER_PORT:           '3000',
  WORKER_POLL_INTERVAL_MS: process.env.WORKER_POLL_INTERVAL_MS || '5000',
  MINIMAX_API_BASE:    process.env.MINIMAX_API_BASE || 'https://api.minimax.io',
  MINIMAX_API_KEY:     process.env.MINIMAX_API_KEY,
  MINIMAX_GROUP_ID:    process.env.MINIMAX_GROUP_ID,
  MUREKA_API_KEY:      process.env.MUREKA_API_KEY,
};

console.log('=== demo2song 云托管部署 ===');
console.log(`环境: ${ENV_ID}`);

run(`${TCB} login --apiKeyId ${SECRET_ID} --apiKey ${SECRET_KEY}`);

if (!serviceArg || serviceArg === 'api') {
  console.log('\n--- 部署 demo2song-api ---');
  deployService('demo2song-api', 'Dockerfile.api', 3000, apiEnv);
}

if (!serviceArg || serviceArg === 'worker') {
  console.log('\n--- 部署 demo2song-worker ---');
  deployService('demo2song-worker', 'Dockerfile.worker', 3000, workerEnv);
}

console.log('\n✅  部署任务已提交，云端正在构建镜像。');
console.log(`控制台：https://tcb.cloud.tencent.com/dev?envId=${ENV_ID}#/platform-run`);
