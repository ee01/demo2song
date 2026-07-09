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
const configureWorkerReplicasOnly = process.argv.includes('--configure-worker-replicas');

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

function runMasked(label, cmd, opts = {}) {
  console.log(`\n$ ${label}\n`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function runJson(cmd, opts = {}) {
  console.log(`\n$ ${cmd}\n`);
  let output;
  try {
    output = execSync(cmd, { encoding: 'utf8', cwd: ROOT, ...opts });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const parsed = parseJsonOutput(output, cmd);
    error.cloudBaseCode = parsed?.error?.code;
    error.cloudBaseMessage = parsed?.error?.message;
    throw error;
  }
  return parseJsonOutput(output, cmd);
}

function parseJsonOutput(output, cmd) {
  const jsonStart = output.indexOf('{');
  const jsonEnd = output.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    throw new Error(`Command did not return JSON: ${cmd}`);
  }
  return JSON.parse(output.slice(jsonStart, jsonEnd + 1));
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function tclWord(value) {
  return `{${String(value).replace(/\\/g, '\\\\').replace(/}/g, '\\}')}}`;
}

function runInteractiveDeploy(args) {
  const expectScript = `
set timeout -1
spawn ${args.map(tclWord).join(' ')}
expect {
  -re "Enable gray deployment" {
    send "0\\r"
    exp_continue
  }
  -re "Confirm to continue deployment" {
    send "Y\\r"
    exp_continue
  }
  eof
}
catch wait result
exit [lindex $result 3]
`;
  run(`expect -c ${shellQuote(expectScript)}`);
}

function deployService(serviceName, templateFile, port, envVars) {
  const dockerPath = resolve(ROOT, 'Dockerfile');
  const content = buildDockerfile(templateFile, envVars);
  writeFileSync(dockerPath, content, 'utf8');
  try {
    runInteractiveDeploy([
      TCB,
      'cloudrun',
      'deploy',
      '-e',
      ENV_ID,
      '-s',
      serviceName,
      ...(port ? ['--port', String(port)] : []),
      '--source',
      ROOT,
      '--force'
    ]);
  } finally {
    try { unlinkSync(dockerPath); } catch { /* ignore */ }
  }
}

function getOnlineImage(serviceName) {
  const body = JSON.stringify({ EnvId: ENV_ID, ServerName: serviceName });
  const result = runJson(
    `${TCB} api tcbr DescribeCloudRunServerDetail` +
    ` --api-version 2022-02-17 --json --body ${shellQuote(body)}`
  );
  const imageUrl = result?.data?.OnlineVersionInfos?.[0]?.ImageUrl;
  if (!imageUrl) {
    throw new Error(`无法读取 ${serviceName} 的线上镜像地址`);
  }
  return imageUrl;
}

function waitForDeployTasks(serviceName) {
  const body = JSON.stringify({ EnvId: ENV_ID, ServerName: serviceName });
  const cmd =
    `${TCB} api tcbr DescribeCloudRunDeployRecord` +
    ` --api-version 2022-02-17 --json --body ${shellQuote(body)}`;

  for (let attempt = 1; attempt <= 60; attempt++) {
    const result = runJson(cmd);
    const activeTasks = result?.data?.DeployRecords?.filter((record) =>
      ['creating', 'init', 'deploying', 'building', 'releasing'].includes(String(record.Status ?? '').toLowerCase())
    ) ?? [];
    if (activeTasks.length === 0) {
      return;
    }
    console.log(`CloudBase deployment is still running; waiting before replica config (${attempt}/60)...`);
    sleep(10000);
  }
  throw new Error(`Timed out waiting for ${serviceName} deployment tasks`);
}

function configureWorkerReplicas() {
  const minNum = Number(process.env.WORKER_MIN_NUM ?? 1);
  const maxNum = Number(process.env.WORKER_MAX_NUM ?? 1);
  if (!Number.isInteger(minNum) || minNum < 1) {
    throw new Error('WORKER_MIN_NUM must be an integer >= 1');
  }
  if (!Number.isInteger(maxNum) || maxNum < minNum) {
      throw new Error('WORKER_MAX_NUM must be an integer >= WORKER_MIN_NUM');
  }

  waitForDeployTasks('demo2song-worker');
  const imageUrl = getOnlineImage('demo2song-worker');
  const body = JSON.stringify({
    EnvId: ENV_ID,
    ServerName: 'demo2song-worker',
    DeployInfo: {
      DeployType: 'image',
      ImageUrl: imageUrl,
      ReleaseType: 'FULL',
      DeployRemark: `set worker replicas min=${minNum}, max=${maxNum}`
    },
    Items: [
      { Key: 'MinNum', IntValue: minNum },
      { Key: 'MaxNum', IntValue: maxNum },
      { Key: 'Port', IntValue: 3000 },
      { Key: 'Dockerfile', Value: 'Dockerfile' }
    ]
  });
  const cmd =
    `${TCB} api tcbr UpdateCloudRunServer` +
    ` --api-version 2022-02-17 --json --body ${shellQuote(body)}`;

  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      runJson(cmd);
      return;
    } catch (error) {
      if (error.cloudBaseCode !== 'ResourceInUse') {
        throw error;
      }
      console.log(`CloudBase still has a deployment task running; retrying replica config (${attempt}/30)...`);
      sleep(10000);
    }
  }
  throw new Error('Timed out waiting to configure worker replicas');
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

runMasked(`${TCB} login --apiKeyId *** --apiKey ***`, `${TCB} login --apiKeyId ${SECRET_ID} --apiKey ${SECRET_KEY}`);

if (!configureWorkerReplicasOnly && (!serviceArg || serviceArg === 'api')) {
  console.log('\n--- 部署 demo2song-api ---');
  deployService('demo2song-api', 'Dockerfile.api', 3000, apiEnv);
}

if (!configureWorkerReplicasOnly && (!serviceArg || serviceArg === 'worker')) {
  console.log('\n--- 部署 demo2song-worker ---');
  deployService('demo2song-worker', 'Dockerfile.worker', 3000, workerEnv);
  console.log('\n--- 固定 demo2song-worker 副本数 ---');
  configureWorkerReplicas();
}

if (configureWorkerReplicasOnly) {
  console.log('\n--- 固定 demo2song-worker 副本数 ---');
  configureWorkerReplicas();
}

console.log('\n✅  部署任务已提交，云端正在构建镜像。');
console.log(`控制台：https://tcb.cloud.tencent.com/dev?envId=${ENV_ID}#/platform-run`);
