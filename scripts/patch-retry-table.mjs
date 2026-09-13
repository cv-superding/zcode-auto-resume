#!/usr/bin/env node
/**
 * patch-retry-table.mjs — 给 ZCode 客户端的「Start Plan 繁忙」重试表打补丁
 *
 * 背景：Zcode 对免费 Start Plan（builtin:zai-start-plan / bigmodel-start-plan）
 * 的接入队列繁忙（admission busy）只重试 2 次（1s、2s）就判
 * 「当前自动重试已达到最大次数」并使回合失败（turn.failed）。
 * 该路径不触发任何钩子，auto-continue 插件无法介入，因此直接扩写
 * 客户端内置的重试延迟表：最多 9 次重试，总等待约 4 分钟。
 *
 * 用法：
 *   node patch-retry-table.mjs apply    # 应用补丁（幂等）
 *   node patch-retry-table.mjs revert   # 还原为官方原始表
 *   node patch-retry-table.mjs status   # 查看当前状态
 *
 * 注意：ZCode 升级会覆盖 zcode.cjs，升级后需重新执行 apply。
 * 原始文件备份为 zcode.cjs.bak（首次 apply 时自动创建）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 可选的本地路径覆盖（不入库）：scripts/.local-paths.json -> { "zcodeCjs": "..." }
function localOverride() {
  try {
    return JSON.parse(fs.readFileSync(new URL('./.local-paths.json', import.meta.url), 'utf8')).zcodeCjs;
  } catch {
    return undefined;
  }
}

const CANDIDATES = [
  process.env.ZCODE_CJS_PATH,
  localOverride(),
  'C:\Program Files\ZCode\resources\glm\zcode.cjs',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'ZCode', 'resources', 'glm', 'zcode.cjs'),
].filter(Boolean);

const ORIGINAL = 'M9r=[1e3,2e3]';
// 10 档延迟：9 次重试，总等待约 228s
const PATCHED = 'M9r=[1e3,2e3,5e3,1e4,15e3,3e4,45e3,6e4,6e4,6e4]';
const MARKER = 'builtin:bigmodel-start-plan';

function locate() {
  for (const file of CANDIDATES) {
    if (fs.existsSync(file)) return file;
  }
  throw new Error('未找到 zcode.cjs，可用 ZCODE_CJS_PATH 环境变量指定路径');
}

function status(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(MARKER)) return 'unknown';
  if (text.includes(PATCHED)) return 'patched';
  if (text.includes(ORIGINAL)) return 'original';
  return 'unknown';
}

const command = process.argv[2] || 'status';
const file = locate();

if (command === 'status') {
  console.log(`zcode.cjs: ${file}`);
  console.log(`补丁状态: ${status(file)}`);
} else if (command === 'apply') {
  const current = status(file);
  if (current === 'patched') {
    console.log('已是补丁状态，无需重复应用');
  } else if (current === 'original') {
    const backup = file + '.bak';
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(file, backup);
      console.log('已备份原文件 ->', backup);
    }
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, text.replace(ORIGINAL, PATCHED));
    console.log('补丁已应用：Start Plan 繁忙重试表 2 次(1s,2s) -> 9 次(1s~60s，约 4 分钟)');
    console.log('重启 ZCode 后生效');
  } else {
    console.error('zcode.cjs 内容与预期不符（可能版本更新改变了代码），未做修改');
    process.exit(1);
  }
} else if (command === 'revert') {
  const backup = file + '.bak';
  if (!fs.existsSync(backup)) {
    console.error('未找到备份文件', backup);
    process.exit(1);
  }
  fs.copyFileSync(backup, file);
  console.log('已还原为官方原始 zcode.cjs，重启 ZCode 后生效');
} else {
  console.error('用法: node patch-retry-table.mjs apply | revert | status');
  process.exit(1);
}
