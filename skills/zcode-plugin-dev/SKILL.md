---
name: zcode-plugin-dev
description: |
  开发 ZCode 插件的完整流程技能。当用户想创建、脚手架、调试、安装或发布 ZCode 插件
  （.zcode-plugin/plugin.json、hooks/hooks.json、commands/、skills/、mcpServers），
  或问插件钩子契约、本地注册、插件不生效排查时使用。
  覆盖从零到发布的六个阶段，所有契约均经真实客户端验证（ZCode 0.16.x）。
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
metadata:
  version: "1.0"
  author: 实战沉淀（zcode-auto-resume 开发全过程）
  license: MIT
---

# ZCode Plugin Dev

指导 ZCode 插件的创建、调试、安装与发布。所有契约点均经真实桌面客户端验证，而非仅凭文档。

## 六阶段工作流

1. **理解**：插件解决什么问题？用户会怎么交互（2-3 个具体例子）？需要哪些组件？
2. **规划**：选组件。ZCode 组件五类：`commands`（斜杠命令 .md）、`skills`（SKILL.md 目录）、`hooks`（事件钩子）、`mcpServers`（清单内声明）、`agents`。能少则少——只做一种组件的插件最好调试。
3. **脚手架**：运行 `node <本技能目录>/scripts/scaffold.mjs <插件名> [输出目录]`，或参照 `templates/` 手工创建。
4. **实现**：钩子逻辑参见 `references/hooks-contract.md`；清单字段参见 `references/manifest-and-layout.md`。
5. **测试**：三步走——脚本级（喂假 stdin）、注册级（`zcode plugins list`）、客户端级（真实会话）。详见 `references/install-and-register.md`。
6. **发布**：GitHub 仓库即可作 marketplace；README 里放一句「帮我安装这个插件：<仓库链接>」的懒人咒语。

## 契约速查（细节见 references/）

| 契约 | 要点 |
| --- | --- |
| 清单 | `.zcode-plugin/plugin.json`（`.claude-plugin/` 兼容）；name 须匹配 `^[a-z0-9][a-z0-9._-]{0,127}$` |
| 钩子事件 | 仅 7 种：SessionStart、UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、PostToolUseFailure、Stop。**没有** SessionEnd/SubagentStop/Notification |
| 钩子类型 | `process`（参数向量，不经 shell，跨平台首选）或 `command`（经 shell） |
| Stop 输入 | 含 `last_assistant_message`、`stop_hook_active`；同时携带驼峰别名（sessionId/responseText…）——**两种拼写都要兼容** |
| Stop 续跑 | 输出 `{"decision":"block","reason":"..."}`，**连续最多 3 次**后强制结束 |
| UserPromptSubmit | 可返回 `{"continue":false,"reason":"..."}` 拦截本次请求（直连命令的基础，零 token） |
| turn.failed | **架构盲区**：回合失败（如网络错误致死）不触发任何钩子，任何钩子插件都救不了，只能靠客户端重试 |
| 钩子运行器 | 配置文件钩子需 `hooks.enabled:true`；插件贡献的钩子自动启用运行器 |
| 变量 | `${ZCODE_PLUGIN_ROOT}`（插件根）、`${ZCODE_PLUGIN_DATA}`（数据目录）、`${ZCODE_PROJECT_DIR}` |

## 高频坑（血泪史，详见 references/troubleshooting.md）

- `timeout` 单位是**秒**，`timeoutMs` 是**毫秒**，混用必踩
- 输出 JSON 是**严格 schema**，多一个键整个输出作废
- 改钩子脚本文件**即时生效**（每次事件重新拉起进程）；改注册表（清单/安装路径）**必须重启客户端**
- 客户端运行中删除插件缓存目录 → 当前会话钩子全部报「失败」
- 钩子执行失败只记日志不崩会话；日志在 `~/.zcode/cli/log/zcode-<日期>.jsonl`（含 source 与时长）

## 参考文档（按需加载，别一次全读）

- `references/hooks-contract.md` — 写钩子前必读：七事件的输入/输出 schema、字段别名、退出码语义
- `references/manifest-and-layout.md` — 清单全字段、组件目录布局、数据目录持久化模式
- `references/install-and-register.md` — 三种分发方式（设置界面 / GitHub marketplace / 文件级注册）+ 卸载
- `references/troubleshooting.md` — 症状 → 原因 → 修复 速查表
