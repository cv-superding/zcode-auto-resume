#!/usr/bin/env node
/**
 * patch-icon-src.mjs — 让 ZCode 设置界面支持 data URI 插件图标
 *
 * 背景：渲染端插件图标组件的守卫函数写死了只允许 https:// URL：
 *   function mD(e){return typeof e==`string`&&e.startsWith(`https://`)}
 * 本地 marketplace 插件没有 https 托管，图标（data:image/png;base64,...）
 * 会被拒显为占位块。本补丁把该判断等长替换为正则测试，
 * 同时放行 https:// 与 data:image/，其余行为不变。
 *
 * 原位字节替换：asar 数据区内等长覆写，不重新打包。
 * 首次 apply 自动备份 app.asar -> app.asar.bak。
 *
 * 用法：
 *   node patch-icon-src.mjs apply     # 应用（幂等）
 *   node patch-icon-src.mjs revert    # 还原
 *   node patch-icon-src.mjs status    # 查看状态
 * 注意：需要先完全退出 ZCode（app.asar 运行中被锁定）。
 * ZCode 升级会覆盖补丁，升级后重新 apply。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOCAL_PATHS = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('./.local-paths.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
})();
const ASAR = process.env.ZCODE_ASAR_PATH || LOCAL_PATHS.appAsar
  || path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'ZCode', 'resources', 'app.asar');
// 精确匹配渲染端图标守卫函数（模板字符串反引号）
const NEEDLE = 'function mD(e){return typeof e==`string`&&e.startsWith(`https://`)}';
const INNER_OLD = 'return typeof e==`string`&&e.startsWith(`https://`)';
const INNER_NEW = 'return /^https:|^data:image\\//.test(e)';

function locateNeedle(buf) {
  const idx = buf.indexOf(Buffer.from(NEEDLE, 'utf8'), 0, 'utf8');
  return idx;
}

// 解析 asar 头，返回 { headerJson, dataStart }
function parseAsar(buf) {
  const pickleSize = buf.readUInt32LE(0);
  const headerSize = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const json = buf.slice(16, 16 + jsonLen).toString('utf8');
  return { headerJson: JSON.parse(json), dataStart: 8 + headerSize, pickleSize };
}

// 在头中递归收集所有文件节点 { path, offset, size }
function collectFiles(node, prefix, out) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) {
      collectFiles(child, prefix ? `${prefix}/${name}` : name, out);
    }
  } else if (typeof node.offset === 'string' && typeof node.size === 'number') {
    out.push({ path: prefix, offset: Number(node.offset), size: node.size });
  }
}

function patchBuffer(content) {
  const idx = content.indexOf(Buffer.from(NEEDLE, 'utf8'));
  if (idx === -1) return { content, patched: false, already: content.indexOf(Buffer.from(INNER_NEW, 'utf8')) !== -1 };
  const innerOld = Buffer.from(INNER_OLD, 'utf8');
  const innerNew = Buffer.from(INNER_NEW, 'utf8');
  if (innerNew.length > innerOld.length) throw new Error('替换串比原文长，无法等长覆写');
  // 等长：新串 + 空格填充
  const padded = Buffer.concat([innerNew, Buffer.alloc(innerOld.length - innerNew.length, 0x20)]);
  padded.copy(content, idx + NEEDLE.indexOf(INNER_OLD));
  return { content, patched: true, already: false };
}

function walkAndPatch() {
  const buf = fs.readFileSync(ASAR);
  const { headerJson, dataStart } = parseAsar(buf);
  const files = [];
  collectFiles(headerJson, '', files);

  let hits = 0;
  let patched = 0;
  for (const f of files) {
    if (f.size < NEEDLE.length) continue;
    const start = dataStart + f.offset;
    const content = buf.slice(start, start + f.size);
    const probe = content.indexOf(Buffer.from(NEEDLE, 'utf8'));
    if (probe === -1) continue;
    hits += 1;
    const result = patchBuffer(content);
    if (result.patched) {
      result.content.copy(buf, start); // 原位覆写（等长）
      patched += 1;
      console.log(`已补丁: ${f.path}`);
    } else if (result.already) {
      console.log(`已是补丁状态: ${f.path}`);
    }
  }
  if (hits === 0) {
    console.error('未在 app.asar 中找到目标函数（可能客户端版本更新改变了代码）');
    process.exit(1);
  }
  if (patched > 0) fs.writeFileSync(ASAR, buf);
  console.log(`共匹配 ${hits} 处，本次修改 ${patched} 处`);
}

const command = process.argv[2] || 'status';
const buf = fs.readFileSync(ASAR);
const { headerJson, dataStart } = parseAsar(buf);
const files = [];
collectFiles(headerJson, '', files);
const states = files
  .filter((f) => f.size >= NEEDLE.length)
  .map((f) => {
    const s = dataStart + f.offset;
    const c = buf.slice(s, s + f.size);
    return {
      path: f.path,
      original: c.indexOf(Buffer.from(NEEDLE, 'utf8')) !== -1,
      patched: c.indexOf(Buffer.from(INNER_NEW, 'utf8')) !== -1,
    };
  })
  .filter((s) => s.original || s.patched);

if (command === 'status') {
  console.log(`app.asar: ${ASAR}`);
  if (!states.length) console.log('状态: 未找到目标函数');
  for (const s of states) console.log(`  ${s.path}: ${s.patched ? '已补丁' : '原始'}`);
} else if (command === 'apply') {
  if (states.some((s) => s.patched)) {
    console.log('已是补丁状态，无需重复应用');
  } else if (states.some((s) => s.original)) {
    const backup = ASAR + '.bak';
    if (!fs.existsSync(backup)) {
      console.log('备份 app.asar ->', backup, '（约需片刻）');
      fs.copyFileSync(ASAR, backup);
    }
    walkAndPatch();
    console.log('完成。重启 ZCode 后图标即可显示');
  } else {
    console.error('未找到目标函数，未做修改');
    process.exit(1);
  }
} else if (command === 'revert') {
  const backup = ASAR + '.bak';
  if (!fs.existsSync(backup)) {
    console.error('未找到备份', backup);
    process.exit(1);
  }
  fs.copyFileSync(backup, ASAR);
  console.log('已还原，重启 ZCode 后生效');
} else {
  console.error('用法: node patch-icon-src.mjs apply | revert | status');
  process.exit(1);
}
