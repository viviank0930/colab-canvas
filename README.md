# CoLab Canvas

一个面向设计学生和创意团队的 AI 协作学习工作区。团队在自由画布上创建、讨论和选择内容；AI 只在用户主动请求后分析当前选择，提供反思问题和建议，不替团队作决定。

## 在线体验

打开 <https://viviank0930.github.io/colab-canvas/> 可以体验公开的静态画布。静态页面不包含任何 API Key，因此 AI 模型调用默认不可用；完整 AI 功能请按下方说明在本地运行后端。

## 功能

- 无限画布、平移和缩放
- 便签、文本、图片、连接、评论和投票
- Figma/Miro 风格框选与批量移动
- 撤销、重做、复制和删除
- 团队光标与活动记录
- 真实浏览器录音、回放和下载
- DeepSeek 驱动的总结、主题、视角冲突、讨论问题和下一步建议
- AI 只读取人类主动选择的内容

## 本地启动

需要 Python 3 和一个 DeepSeek API Key。

```bash
export DEEPSEEK_API_KEY="your-key"
python3 server.py
```

然后访问 <http://127.0.0.1:4173/>。

macOS 用户也可以使用项目中的：

- `首次设置.command`：将 Key 安全保存到 macOS 钥匙串
- `启动 CoLab.command`：后台启动并打开网页
- `停止 CoLab.command`：停止本地服务

## AI 安全边界

- API Key 只存在于服务器环境变量或 macOS 钥匙串，不进入前端代码或 Git 仓库。
- AI 不会自动选择、移动或整理画布对象。
- AI 输出是建议，不是团队决定。
- 未配置模型或请求失败时，界面显示真实错误和本地证据预览，不伪造 AI 结果。

## 关于在线演示

GitHub 仓库用于公开代码和协作开发。完整 AI 功能需要可运行 Python 的后端环境，并在部署平台中配置 `DEEPSEEK_API_KEY` Secret。不要把 Key 提交到仓库，也不要直接放在 GitHub Pages 的前端代码中。

如果公开部署带有共享 Key 的版本，应先增加用户认证、请求限速和消费额度保护，避免他人消耗账户余额。
