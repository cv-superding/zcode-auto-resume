#!/usr/bin/env node
/**
 * scaffold.mjs — 生成 ZCode 插件骨架
 * 用法：node scaffold.mjs <插件名> [输出目录=当前目录/<插件名>]
 * 零依赖，Node >= 18。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [name] = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (!name || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(name)) {
  console.error('用法: node scaffold.mjs <插件名>  （插件名须匹配 ^[a-z0-9][a-z0-9._-]{0,127}$）');
  process.exit(1);
}
const outDir = path.resolve(process.argv[3] || path.join(process.cwd(), name));
if (fs.existsSync(outDir)) {
  console.error(`目录已存在: ${outDir}`);
  process.exit(1);
}
const templates = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

fs.mkdirSync(path.join(outDir, '.zcode-plugin'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'hooks'), { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(templates, 'plugin.json'), 'utf8'));
manifest.name = name;
manifest.description = `${name}：一句话说清功能。`;
fs.writeFileSync(path.join(outDir, '.zcode-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.copyFileSync(path.join(templates, 'hooks.json'), path.join(outDir, 'hooks', 'hooks.json'));

fs.writeFileSync(
  path.join(outDir, 'hooks', 'engine.mjs'),
  `#!/usr/bin/env node
/* ${name} 钩子引擎：Stop / UserPromptSubmit 示例骨架 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
};

function main() {
  const raw = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const event = String(pick(raw, 'hook_event_name', 'hookEventName') || '');
  const sessionId = String(pick(raw, 'session_id', 'sessionId') || 'unknown');
  const lastMessage = String(pick(raw, 'last_assistant_message', 'lastAssistantMessage', 'responseText') ?? '');
  const prompt = String(pick(raw, 'prompt', 'userPrompt') ?? '');

  if (event === 'UserPromptSubmit') {
    // 在这里拦截直连命令，或做输入预处理。放行 = 什么都不输出。
    return;
  }
  if (event === 'Stop') {
    // 在这里检查回合结束原因。需要继续时：
    // process.stdout.write(JSON.stringify({ decision: 'block', reason: '继续指令' }));
    return;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(\`[engine] \${error && error.stack || error}\\n\`);
  // 任何异常都放行，绝不阻塞会话
}
`,
);

fs.writeFileSync(
  path.join(outDir, 'README.md'),
  `# ${name}\n\n${manifest.description}\n\n## 安装\n\nZCode → Settings → Plugin Management → Discover → + → 本地目录，指向本目录。\n\n## 验证\n\n\`\`\`bash\necho '{"hook_event_name":"Stop","session_id":"t1","last_assistant_message":"测试"}' | node hooks/engine.mjs\n\`\`\`\n`,
);

console.log(`骨架已生成: ${outDir}`);
console.log('下一步: 编辑 hooks/engine.mjs 实现逻辑 → 按 install-and-register.md 安装验证');
