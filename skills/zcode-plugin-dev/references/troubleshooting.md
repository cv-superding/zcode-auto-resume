# 排错速查（症状 → 原因 → 修复）

## 钩子类

| 症状 | 原因 | 修复 |
| --- | --- | --- |
| 钩子注册了但永不触发 | 事件名拼错（SessionEnd/SubagentStop 不存在） | 只用七事件；查 `zcode plugins list` 组件计数 |
| 钩子显示「失败」红叉 | 脚本非零退出 / 路径不存在 / node 不在 PATH | 查 `~/.zcode/cli/log/zcode-<日期>.jsonl` 的 `hook.run.failed`；用 `process` 类型直调 node；手工喂 stdin 复现 |
| 配置文件钩子不跑 | 配置钩子默认禁用 | `hooks.enabled: true`；或改用插件钩子（自动启用） |
| 输出 JSON 被丢弃 | 严格 schema，多一个键就作废 | 只输出文档认可的字段；用「空输出 + exit 0」表达放行 |
| 钩子超时被杀 | `timeout`（秒）当成了毫秒 / 冷却时间超过 timeoutMs | `process` 用 `timeoutMs`；冷却上限 < timeoutMs |
| Windows 下钩子失败 | `command` 类型的 POSIX 语法 | 改用 `process` 参数向量类型 |
| 续跑 3 次后强制结束 | Zcode 硬上限，防失控 | 设计上接受；用状态跨回合续接 |
| 想在回合失败时做事 | **turn.failed 不触发任何钩子** | 架构盲区；只能靠客户端重试或用户手动 |

## 注册 / 加载类

| 症状 | 原因 | 修复 |
| --- | --- | --- |
| 插件装了没生效 | 注册表改了没重启 | 客户端启动时加载注册表；**完全退出**再开（托盘退出才算） |
| 图标不显示（占位块） | 设置界面图标守卫只认 `https://` 开头 | 见本仓库 scripts/patch-icon-src.mjs 思路：放行 `data:image/` |
| 详情页缺图标/描述 | marketplace 缓存副本缺失 | 补 `~/.zcode/cli/plugins/marketplaces/<id>/marketplace.json` |
| 钩子突然全失败（曾正常） | 插件缓存目录被删，旧会话还指着旧路径 | 重启客户端加载新路径 |
| `plugin_hook_read_failed` | hooks 字段解析失败 | 校验 hooks.json 语法与事件名 |
| 命令/技能重名被吞 | 同名先到先得（用户 > 工作区 > 插件） | 改名或接受遮蔽 |

## 运行时类

| 症状 | 原因 | 修复 |
| --- | --- | --- |
| 「Model request failed.」红横幅 | 回合失败（网络/上游），**非插件问题** | 客户端重试兜底；仍失败手动发「继续」 |
| 自动继续把正常回答续了 | 关键词误报 | 长消息只认横幅结尾 + 覆盖率门槛 + 用户讨论检测（参考 zcode-auto-resume 实现） |
| 状态文件越滚越大 | 会话状态无修剪 | 只留最近 24h / 至多 N 条，写入时过滤 |

## 诊断工具箱

```bash
# 官方 CLI 验证（无需重启）
ELECTRON_RUN_AS_NODE=1 node <ZCode>/resources/glm/zcode.cjs plugins list --json
ELECTRON_RUN_AS_NODE=1 node <ZCode>/resources/glm/zcode.cjs commands list

# 钩子执行记录（失败必留痕，含 source/时长）
grep hook.run.failed ~/.zcode/cli/log/zcode-$(date +%Y-%m-%d).jsonl

# 钩子原始输入抓包（config.json 设 debug:true 后）
cat <数据目录>/last-input.json
```
