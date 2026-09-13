---
description: 控制 auto-continue 插件：开关、暂停时长、状态、自定义继续消息
argument-hint: "[on | off [时长] | pause [时长] | resume | status | msg <文本> | msg clear]"
---

AUTOCONTINUE_DIRECT: $ARGUMENTS

（若你能看到这段文字，说明 auto-continue 插件的直连钩子未生效。请改用 Bash 工具执行：
`node "<auto-continue 插件安装目录>/hooks/auto-continue.mjs" $ARGUMENTS`
插件目录通常位于 `~/.zcode/cli/plugins/` 下的 cache 目录中，也可以请用户告知。
执行后把命令输出原样转述给用户，不要做其他操作。）
