# Frontend handoff — superseded boundary

原提示词以修改 `deepseek-harness/packages/*` 为前提，现已失效；历史内容保存在 [docs/legacy-kimi-frontend-prompt.md](docs/legacy-kimi-frontend-prompt.md)。

当前唯一有效边界：

- 前端源码属于本仓库 `src/client/`，由本包构建成 `lib/client.js`。
- 通过包级 `dsh.client` 声明被 DSH 自动发现，通过现有 `settings.plugins.tab` Slot 注册。
- 通过同源 `/api/plugin-marketplace` JSON API 调用本包 Host；不得依赖或修改 `@deepseek-ai/dsh-api-remotes`。
- 不允许修改 `D:\Work\deepseek-harness` 或 `D:\Work\dsh-plugin-marketplace\deepseek-harness-backend`。
- 保留既有视觉、响应式、键盘、焦点和 reduced-motion 质量，但所有成功状态必须来自真实 Host 结果。
