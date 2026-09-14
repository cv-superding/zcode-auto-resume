# 清单与目录布局

## .zcode-plugin/plugin.json

```json
{
  "name": "my-plugin",                  // 必填，^[a-z0-9][a-z0-9._-]{0,127}$
  "version": "0.1.0",
  "description": "一句话说清功能",
  "author": { "name": "…" },
  "license": "MIT",
  "commands": "commands",               // 目录名 / 数组 / 内联，均可
  "skills": "skills",
  "hooks": "hooks",                     // 指向含 hooks.json 的目录
  "agents": "agents",
  "mcpServers": {                       // stdio MCP：command/args/env/cwd
    "my-mcp": {
      "command": "node",
      "args": ["${ZCODE_PLUGIN_ROOT}/mcp/server.mjs"],
      "env": { "MY_TOKEN": "${user_config.token}" }
    }
  },
  "userConfig": {                       // 设置界面可填的用户配置
    "token": { "type": "string", "default": "", "description": "…" }
  }
}
```

- 兼容目录名：`.claude-plugin/`、`.codex-plugin/` 也会被识别
- `channels`、`lspServers`、`outputStyles`、`settings` 只登记不执行（别指望）
- `${ZCODE_PLUGIN_ROOT}`（插件根）、`${ZCODE_PLUGIN_DATA}`（数据目录）、`${user_config.<key>}` 只在**钩子命令/参数与 mcpServers** 里展开

## 目录布局（按需取舍，能删则删）

```
my-plugin/
├── .zcode-plugin/plugin.json   # 必需
├── hooks/
│   ├── hooks.json              # { "hooks": { "<Event>": [ { "hooks": [ … ] } ] } }
│   └── engine.mjs              # 钩子逻辑（模板见 templates/hook-engine.mjs）
├── commands/                   # *.md，一文件一命令；子目录以冒号连接名
│   └── deploy.md               # frontmatter: description, argument-hint
├── skills/                     # 一目录一技能，含 SKILL.md
├── agents/                     # 子代理 .md
└── README.md
```

- 命令 frontmatter：`description`（触发与展示）、`argument-hint`（参数提示）；正文 `$ARGUMENTS` 替换用户参数
- 命令重名：用户级覆盖工作区，工作区覆盖插件，先到先得

## 钩子进程类型选择

```json
{
  "type": "process",
  "command": "node",
  "args": ["${ZCODE_PLUGIN_ROOT}/hooks/engine.mjs"],
  "timeoutMs": 120000,
  "statusMessage": "干什么用的（进度条文案）"
}
```

- `process`：参数向量直调，不经 shell，**Windows 友好**，推荐
- `command`：经 shell 字符串，POSIX 语法在 Windows 会炸；`timeout` 单位是秒
- `timeoutMs`（毫秒）优先于 `timeout`（秒），默认 60000
- `async: true` 目前**无运行时效果**，别指望后台执行；要后台就脚本自己 daemonize
- `command` 与 `process` 的字段不可混用，混了整条钩子被丢弃

## 数据目录持久化（$ZCODE_PLUGIN_DATA）

- 客户端运行钩子时注入该环境变量；脚本手工运行时缺省到 `~/.zcode/<插件名>/` 之类的固定路径（记得代码里兜底）
- 状态文件写入用「临时文件 + rename」原子替换，防半截写入
- 会话级状态要修剪：只留最近活跃的若干条，防止无限膨胀
- 日志同时写文件 + stderr（stderr 会出现在客户端钩子日志里，方便排查）
