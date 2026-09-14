# 钩子契约（实测版，ZCode 0.16.x）

## 七个事件

| 事件 | 触发时机 | matcher 测试对象 | 备注 |
| --- | --- | --- | --- |
| SessionStart | 会话启动/恢复/清空/压缩 | source（startup/resume/clear/compact） | 可注入 additionalContext |
| UserPromptSubmit | 用户提交输入后、调模型前 | **不过滤**（设置 matcher 也照跑） | 可拦截请求（`continue:false`）或注入上下文 |
| PreToolUse | 工具调用前 | 工具名（大小写敏感正则） | 可 allow/ask/deny |
| PermissionRequest | 权限请求时 | 工具名 | 可 deny |
| PostToolUse | 工具成功后 | 工具名 | Task↔Agent、Write/Edit←ApplyPatch 别名 |
| PostToolUseFailure | 工具失败后 | 工具名 | |
| Stop | 回合正常结束时 | **不过滤** | 可续跑（连续最多 3 次） |

不存在的事件：SessionEnd、SubagentStop、Notification、PreCompact——写了不报错但永不触发。

## stdin 输入

公共字段（**驼峰与下划线双份同时携带**，读哪个都行，但稳健做法是双兼容）：

```json
{
  "session_id": "sess_…",   "sessionId": "sess_…",
  "transcript_path": "…",   "transcriptPath": "…",
  "hook_event_name": "Stop","hookEventName": "Stop",
  "cwd": "…", "permission_mode": "…"
}
```

事件附加字段：
- Stop：`stop_hook_active`（bool，本次停止是否由钩子续跑引起）、`last_assistant_message`（部分版本为 `responseText` / `responsePreview`，后者可能被截断）
- UserPromptSubmit：`prompt`
- 工具事件：`tool_name`、`tool_input` 等

`transcript_path` 指向临时 JSONL，钩子返回后即清理——只够本次读，不能当持久存储。

## stdout 输出（严格 schema，多余键 = 整个输出作废）

| 事件 | 想做的事 | 输出 |
| --- | --- | --- |
| Stop | 让模型再跑一轮 | `{"decision":"block","reason":"继续指令"}`（`reason` 或 `additionalContext` 至少一个） |
| Stop | 放行 | 什么都不输出，exit 0 |
| UserPromptSubmit | 拦截本次请求（直连命令） | `{"continue":false,"reason":"给用户看的说明"}` |
| UserPromptSubmit | 注入上下文 | `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"…"}}` |
| PreToolUse/PermissionRequest | 决策 | permission decision（allow/ask/deny） |

退出码：`0` 成功（stdout 被解析）；`2` 阻断捷径（阻断类事件 = deny，Stop = 续跑一轮）；其他非零 = 钩子失败（记日志、会话不崩）。空 stdout = 成功无效果；非 JSON 的 stdout 只当诊断信息，不进模型上下文。

## 连续续跑硬上限

Stop 钩子 `decision:block` 连续 **3 次**后，运行被强制结束（防失控）。第 3 次之后即使再 block 也不会续。设计钩子时要接受这个上限，别做「无限重试直到成功」的白日梦。

## 架构盲区：turn.failed

回合因故障死亡（模型请求失败致死，UI 显示「Model request failed.」或「当前系统繁忙…已达最大次数」）走的是 **turn.failed 路径，不触发任何钩子**（正常回合结束才有 Stop 阶段）。这类中断任何钩子插件都救不了，唯一缓解是客户端内部重试。诚实告知用户这个边界，别做无用功。

## 双字段名兼容的推荐写法

```js
function pick(obj, ...keys) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
}
const input = {
  event: String(pick(raw, 'hook_event_name', 'hookEventName') || ''),
  sessionId: String(pick(raw, 'session_id', 'sessionId') || 'unknown'),
  transcriptPath: String(pick(raw, 'transcript_path', 'transcriptPath') || ''),
  lastMessage: String(pick(raw, 'last_assistant_message', 'lastAssistantMessage', 'responseText', 'responsePreview') ?? ''),
  prompt: String(pick(raw, 'prompt', 'userPrompt') ?? ''),
};
```

## 配置层钩子 vs 插件钩子

- 配置文件（`~/.zcode/cli/config.json` → `hooks.events.<Event>`）：默认**禁用**，必须 `hooks.enabled:true`
- 插件钩子（`hooks/hooks.json`）：自动启用运行器，无需任何开关
- 两者可共存，插件 matcher 追加在配置 matcher 之后
