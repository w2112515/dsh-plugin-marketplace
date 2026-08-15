# Frontend handoff — superseded boundary

原提示词以修改 `deepseek-harness/packages/*` 为前提，现已失效；历史内容保存在 [docs/legacy-kimi-frontend-prompt.md](docs/legacy-kimi-frontend-prompt.md)。

当前唯一有效边界：

- 前端源码属于本仓库 `src/client/`，由本包构建成 `lib/client.js`。
- 通过包级 `dsh.client` 声明被 DSH 自动发现，通过现有 `settings.plugins.tab` Slot 注册。
- 通过同源 `/api/plugin-marketplace` JSON API 调用本包 Host；不得依赖或修改 `@deepseek-ai/dsh-api-remotes`。
- 不允许修改 `D:\Work\deepseek-harness` 或 `D:\Work\dsh-plugin-marketplace\deepseek-harness-backend`。
- 保留既有视觉、响应式、键盘、焦点和 reduced-motion 质量，但所有成功状态必须来自真实 Host 结果。

当前前端契约：

- 使用单列高密度 list-detail；不使用首字母头像或双列卡片墙。
- 列表显示可换行的名称、GitHub publisher、Package ID、用途、Stars、更新时间、许可证和真实动作。
- Host 负责搜索、筛选、排序和每页 50 条分页；Client 不读取完整 catalog。
- 首开调用 `bootstrap`；有缓存时立即显示并后台 `refresh`，无缓存时等待 Host 首次刷新结果。
- 自动安装必须走 capability → plan → review → execute，成功文案固定说明“重启 DSH 后启用”。
- `git-source` 是来源事实，不在列表里重复显示为红色风险；完整来源与 commit 在详情和安装审核中展示。
