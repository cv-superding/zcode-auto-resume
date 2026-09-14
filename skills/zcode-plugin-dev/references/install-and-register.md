# 安装、注册与卸载

## 三种分发方式

### 方式一：设置界面（用户最简单）

**Settings → Plugin Management → Discover → + 添加 marketplace**，来源三选一：
- **GitHub 仓库**：填 `用户名/仓库名`（仓库根放 `marketplace.json` 即可被识别）
- **本地目录**：指向插件根（含 `.zcode-plugin/plugin.json`）或 marketplace 目录
- Git URL

### 方式二：懒人咒语（README 必备）

README 里写明一句可直接发给 ZCode 的话：

```text
帮我安装这个插件：https://github.com/<user>/<repo>
```

小白复制粘贴即可，剩下的让 ZCode 自己办。

### 方式三：文件级注册（程序化安装 / 离线 / 调试）

改三个文件 + 一个缓存副本（改前全部备份！客户端运行中也能改，但**要重启才加载**）：

1. 插件文件复制到 `~/.zcode/cli/plugins/cache/<marketplace-id>/<name>/<version>/`
2. `~/.zcode/cli/plugins/known_marketplaces.json` — 注册 marketplace（directory 源用 `{"source":"directory","path":"<绝对路径>"}`）
3. **缓存副本必须有**：`~/.zcode/cli/plugins/marketplaces/<marketplace-id>/marketplace.json`（目录状态的 listing/图标从这里读，漏了图标不显示、详情页缺数据）
4. `~/.zcode/cli/plugins/installed_plugins.json` — 追加安装记录（id 格式 `<name>@<marketplace>`，含 installPath/scope:"user"/source）
5. `~/.zcode/cli/config.json` → `plugins.enabledPlugins["<id>"] = true`

**卸载** = 反向删除：enabledPlugins 键、installed 记录、cache 目录、marketplace 副本目录、known_marketplaces 条目。

## 验证（不重启就能做）

```bash
export ELECTRON_RUN_AS_NODE=1
node "<ZCode安装目录>/resources/glm/zcode.cjs" plugins list     # 应显示 [enabled] + 组件计数
node …/zcode.cjs commands list    # 斜杠命令应出现
node …/zcode.cjs skills list      # 技能应出现
```

`--json` 可拿到机器可读输出与 diagnostics（如 `plugin_hook_read_failed`）。

## 脚本级测试（注册前先做）

给钩子脚本喂假 stdin，校验退出码与输出：

```bash
echo '{"hook_event_name":"Stop","session_id":"t1","last_assistant_message":"当前系统繁忙，请稍后再试。"}' \
  | node hooks/engine.mjs
```

- 预期 block 的场景 → stdout 应为合法 JSON `{"decision":"block",…}`
- 正常完成场景 → 无输出、exit 0
- 记得设 `ZCODE_PLUGIN_DATA` 指向测试目录，别污染真实状态

## 客户端级测试（重启后）

1. 新会话输入直连命令，应秒回且不消耗 token
2. 点输入框旁锚点图标，钩子应显示绿色时长而非红叉「失败」
3. 端到端：让回合以错误横幅结尾，观察 10 秒内是否被自动续跑
4. 排查看 `~/.zcode/cli/log/zcode-<日期>.jsonl`（`hook.run.failed` 含 source 与耗时）与插件自身日志

## 发布清单

- [ ] README：功能表、安装三法（懒人咒语/界面步骤/文件注册）、配置说明、排错表
- [ ] 仓库根放 `marketplace.json`（`{"name":…,"plugins":[{…}]}`），使其成为即插即用的 marketplace
- [ ] LICENSE；非官方声明
- [ ] 版本号同步：plugin.json 与 cache 路径中的版本目录
