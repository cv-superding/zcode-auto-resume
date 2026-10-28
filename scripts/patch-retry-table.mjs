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

// 版本自适应：定位「Start Plan 繁忙」重试表（特征：紧邻 start-plan provider 集合定义的 [1e3,2e3] 数组）
// 0.16.x: M9r=[1e3,2e3]（1 处）；0.17.x: D3o/U3o=[1e3,2e3]（2 处）。不依赖变量名。
// 10 档延迟：9 次重试，总等待约 228s
// 7 档爬升 + 24 档 60s：重试窗口约 25 分钟（不含每次尝试自身的耗时）
const PATCHED_TABLE = '[1e3,2e3,5e3,1e4,15e3,3e4,45e3,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4,6e4]';


function locate() {
  for (const file of CANDIDATES) {
    if (fs.existsSync(file)) return file;
  }
  throw new Error('未找到 zcode.cjs，可用 ZCODE_CJS_PATH 环境变量或 scripts/.local-paths.json 指定路径');
}

function findTables(text) {
  // 匹配 <var>=[1e3,2e3]，且其前 200 字符内出现 start-plan 集合定义，避免误伤无关代码
  const out = [];
  const re = /([\w$]+)=\[(?:1e3,2e3|1000,2000)[^\]]*\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const ctx = text.slice(Math.max(0, m.index - 400), m.index + 400);
    if (ctx.includes('start-plan')) out.push({ start: m.index, end: m.index + m[0].length, full: m[0] });
  }
  return out;
}

function status(file) {
  const text = fs.readFileSync(file, 'utf8');
  const tables = findTables(text);
  if (tables.length === 0) return { state: 'not-found', tables };
  const expected = /\[(?:1e3,2e3,5e3,1e4,15e3,3e4,45e3(?:,6e4){24}|1000,2000,5000,10000,15000,30000,45000(?:,60000){24})\]/;
  const patched = tables.filter((x) => expected.test(x.full));
  return { state: patched.length === tables.length ? 'patched' : 'original', tables };
}

function applyPatch(file) {
  const backup = file + '.bak';
  let text = fs.readFileSync(file, 'utf8');
  const tables = findTables(text);
  if (tables.length === 0) {
    console.error('未在 zcode.cjs 中找到 Start Plan 重试表（可能版本更新再次改变了代码），未做修改');
    process.exit(1);
  }
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(file, backup);
    console.log('已备份原文件 ->', backup);
  }
  // 从后往前替换，避免偏移失效
  let count = 0;
  for (let i = tables.length - 1; i >= 0; i -= 1) {
    const x = tables[i];
    text = text.slice(0, x.start) + x.full.slice(0, x.full.indexOf('[')) + PATCHED_TABLE + text.slice(x.end);
    count += 1;
  }
  fs.writeFileSync(file, text);
  console.log(`已扩写 ${count} 处重试表 -> 31 档（7 档爬升 + 24 档 60s，重试窗口约 26 分钟）`);
  console.log('重启 ZCode 后生效');
}

const command = process.argv[2] || 'status';
const file = locate();

if (command === 'status') {
  console.log(`zcode.cjs: ${file}`);
  const s = status(file);
  console.log(`重试表: ${s.state}（找到 ${s.tables.length} 处）`);
} else if (command === 'apply') {
  const s = status(file);
  if (s.state === 'patched') console.log('已是补丁状态，无需重复应用');
  else if (s.state === 'original' || s.state === 'not-found') applyPatch(file);
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
