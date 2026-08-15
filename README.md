# DSH Plugin Marketplace

DSH Plugin Marketplace 是一个 **仓外可安装的 DeepSeek Harness bundle**。它不属于 DSH 官方仓库，不要求修改或合并 DSH 源码，也不是独立 Web 产品。

用户把本包安装进 `web` profile 后，DSH 的 Host Loader 会挂载市场 Host 插件；同一个包声明的 `dsh.client` 浏览器入口会自动注册到 `设置 → 插件 → 插件市场`。

## 当前定义

- 分发单元：一个 npm/Git/tarball package，声明 `dsh.bundle.patch`。
- Host：下载并严格校验中央静态目录，维护 last-known-good 缓存，并拥有当前 profile 的安装审核与写入。
- Client：通过现有 `settings.plugins.tab` Slot 提供检索、筛选、详情、风险判断和审核确认界面。
- Host/Client 通道：包私有、同源的 `/api/plugin-marketplace` JSON API；不修改 DSH 的静态 Typert Remote 清单。
- 目录生产：本仓库 GitHub Actions 每日扫描带 `dsh-plugin` topic 的仓库，遇到 GitHub Search 1,000 条上限时按创建时间窗口递归拆分。
- 用户侧 GitHub：普通用户不需要 GitHub 账号、Token 或 VPS；只有中央扫描 workflow 使用仓库自带的 `GITHUB_TOKEN`。
- 安装安全：只允许目录中固定到 40 位 commit、静态校验通过、且不含 lifecycle/build scripts 的 bundle 进入一键安装；执行前先生成短期审核 plan，安装阶段强制 `--ignore-scripts`，失败恢复 profile manifest、lockfile 和 workspace 配置。

原先的 workspace 集成方案已失效，完整历史保存在 [docs/legacy-workspace-plan.md](docs/legacy-workspace-plan.md)，不能再作为实现或发布依据。

## 目录结构

```text
dsh-plugin-marketplace/
├── package.json
├── cordis.patch.yml
├── src/
│   ├── index.ts                 # Host 插件与同源 API
│   ├── catalog*.ts             # schema、网络与 LKG 缓存
│   ├── profile-operations.ts   # plan/confirm/rollback
│   └── client/                 # WebUI Slot 插件
├── scripts/                    # GitHub scanner
├── website/public/             # workflow 生成的静态目录
└── .github/workflows/          # CI 与每日 Pages 发布
```

## 本地构建

要求 Node.js `^22.19.0 || >=24` 和 pnpm 11。

```powershell
cd D:\Work\dsh-plugin-marketplace
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm pack --dry-run
```

## 安装到本机 DSH

默认目录由本仓库的 GitHub Pages 提供。开发时可用环境变量临时覆盖：

```powershell
$env:DSH_PLUGIN_MARKETPLACE_CATALOG_URL = 'https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json'
dsh plugin --profile web add D:\Work\dsh-plugin-marketplace
dsh --profile web --dump-config
dsh web
```

从 GitHub 安装时必须固定 commit：

```powershell
dsh plugin --profile web add github:w2112515/dsh-plugin-marketplace#<40位commit>
```

本仓库提交构建后的 `lib/`，因此 Git 安装不需要在用户机器上执行 `prepare`。发布 npm 后可改为：

```powershell
dsh plugin --profile web add dsh-plugin-marketplace
```

卸载：

```powershell
dsh plugin --profile web remove dsh-plugin-marketplace
```

## 配置

bundle 插入的 row id 是 `plugin-marketplace`。用户可在 `$DSH_HOME/profiles/web/cordis.patch.yml` 覆盖完整配置：

```yaml
- id: plugin-marketplace
  config:
    catalogUrl: https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json
    maxAgeMs: 172800000
    timeoutMs: 15000
    maxBytes: 5000000
```

patch 对 `config` 是整体替换，不是深度合并，因此覆盖时必须写全所有字段。

## MVP 完成条件

只有同时满足以下证据才称为仓外 MVP 完成：

1. `package.json`/`cordis.patch.yml` 静态 bundle preflight 通过。
2. 构建产物包含 Host、Client、类型和 patch，且不包含密钥、本地缓存或 DSH 源码副本。
3. 精确 tarball 安装进隔离 `web` profile 后，`--dump-config` 能看到 `plugin-marketplace` layer 与 row。
4. 从已安装产物启动 WebUI，插件市场 tab 可见；目录正常、不可用与缓存降级路径可观察。
5. 安装操作必须经过 plan/review/execute；失败回滚和卸载路径得到验证。

## 非目标

- 不向 `deepseek-ai/deepseek-harness` 提交代码或要求官方发布。
- 不修改 DSH 的 Web bundle、Settings Slot、API Remote 或 CLI 源码。
- 不让浏览器直接访问 GitHub API，不要求每个用户配置 GitHub Token。
- 不执行未审核仓库的 lifecycle/build scripts。
- Solution Pack 属于后续里程碑，不进入当前 bundle MVP。
