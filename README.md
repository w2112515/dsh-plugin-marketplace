# DSH Plugin Marketplace

An **out-of-tree, installable DeepSeek Harness bundle**: a plugin marketplace living inside DSH's own Settings UI. It is not part of the official DSH repository, requires no changes to DSH source code, and is not a standalone web product.

Once installed into the `web` profile, DSH's Host Loader mounts the marketplace Host plugin, and the package's declared `dsh.client` browser entry registers itself under `Settings → Plugins → Marketplace`. The UI is bilingual — it follows DSH's display language automatically (中文 / English).

## How it works

- **Distribution unit**: one npm/Git/tarball package declaring `dsh.bundle.patch`.
- **Host**: downloads and strictly validates the central static catalog (schema + integrity digest), keeps a last-known-good cache, and owns review and mutation of the current profile.
- **Client**: a `settings.plugins.tab` Slot contribution providing search, filters, detail pages, risk signals, review confirmation, and solution packs.
- **Host/Client channel**: a package-private, same-origin `/api/plugin-marketplace` JSON API. DSH's static Typert Remote manifest is untouched.
- **Catalog production**: a daily GitHub Actions scan of repositories carrying the `dsh-plugin` topic. Only statically validated, non-archived bundles enter the public catalog; rejects are kept in the workflow artifact. Searches that hit GitHub's 1,000-result cap are bisected by creation-date windows. Users need no GitHub account, token, or VPS — only the central scanner uses the repository's own `GITHUB_TOKEN`.

## Install safety

Automatic installs pin an immutable 40-character commit and always go through capability preflight → short-lived review plan → confirmed execution, with rollback of the profile manifest, lockfile, and workspace config on failure. Eligibility is decided by evidence at the pinned commit:

| Catalog entry | What the scanner proved | What happens on install |
| --- | --- | --- |
| **Automatic install** | Every install target (entry files, patch) exists in the pinned commit's git tree | `pnpm add --ignore-scripts` — third-party lifecycle scripts never run |
| **Needs script review** | Targets are absent (build output not shipped), but the package declares lifecycle scripts | Scripts are shown **verbatim** in the review step; after your explicit consent, the Host grants exactly `'name@pinned-spec': true` in the profile's `allowBuilds` and installs without `--ignore-scripts`. The grant covers only the reviewed commit and is revoked on removal |
| **Manual install** | Neither of the above | Repository link only; the marketplace never runs anything |

## Solution packs

A pack is a curated list of plugin repositories — nothing more. A repository becomes a pack by carrying **both** the `dsh-plugin` and `dsh-plugin-pack` topics plus a `dsh.pack.json` manifest:

```json
{
  "schemaVersion": 1,
  "name": "My Essentials",
  "description": "A curated starter set",
  "items": ["owner/plugin-a", "owner/plugin-b"]
}
```

- `items` holds 1–50 `owner/repo` strings; resolution to stable repository ids happens at scan time against the catalog itself, so renames never rewrite identity silently.
- The marketplace shows every item's explicit status — *will auto-install*, *needs script review*, *manual install*, *not in catalog*, *already installed* — and an honest `install N of M` count.
- Installing a pack runs the normal single-plugin plan→execute path serially, stops at the first failure, rolls nothing back, and reports each item's outcome.
- **Packs grant no privilege**: script-gated items still require their own per-plugin review and consent; manual items stay manual.

## For plugin authors

To be discoverable, your repository needs the `dsh-plugin` topic, a `package.json` declaring `dsh.bundle.patch`, and a valid `cordis.patch.yml`. Optional `dsh-category-theme|ui|tool|memory` topics set your catalog category.

**To qualify for automatic install**, the files your bundle loads must exist in the git tree at the pinned commit — commit your built output (e.g. `lib/`), the way this repository does. If built output is intentionally not committed and your `prepare`/`install` scripts produce it, users will see your scripts verbatim and can consent to run them per install; the consent never extends beyond the reviewed commit.

## Install into your DSH

Regular users need no GitHub token. Automatic installs require the Host to run `pnpm` (the plugin also tries `corepack pnpm`); when neither exists, the WebUI keeps browsing and shows a recovery hint instead of a fake success.

The default catalog is served from this repository's GitHub Pages. During development you can override it:

```powershell
$env:DSH_PLUGIN_MARKETPLACE_CATALOG_URL = 'https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json'
dsh plugin --profile web add D:\Work\dsh-plugin-marketplace
dsh --profile web --dump-config
dsh web
```

Git installs must pin a commit (this repository commits its built `lib/`, so no `prepare` runs on your machine):

```powershell
dsh plugin --profile web add github:w2112515/dsh-plugin-marketplace#<40-char-commit>
```

Once published to npm: `dsh plugin --profile web add dsh-plugin-marketplace`. Uninstall: `dsh plugin --profile web remove dsh-plugin-marketplace`.

## Configuration

The bundle's patch row id is `plugin-marketplace`. Override the full config in `$DSH_HOME/profiles/web/cordis.patch.yml` (patch `config` is replaced wholesale, not deep-merged — write every field):

```yaml
- id: plugin-marketplace
  config:
    catalogUrl: https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json
    maxAgeMs: 172800000
    timeoutMs: 15000
    maxBytes: 5000000
```

## Repository layout

```text
dsh-plugin-marketplace/
├── package.json
├── cordis.patch.yml
├── src/
│   ├── index.ts                 # Host plugin & same-origin API
│   ├── catalog*.ts             # schema, network, LKG cache, queries
│   ├── profile-operations.ts   # plan/confirm/rollback, consent grants
│   └── client/                 # WebUI Slot plugin (zh/en)
├── scripts/                    # GitHub scanner (plugins + packs)
├── website/public/             # workflow-generated static catalog
└── .github/workflows/          # CI and the daily Pages publication
```

## Local development

Requires Node.js `^22.19.0 || >=24` and pnpm 11.

```powershell
cd D:\Work\dsh-plugin-marketplace
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm pack --dry-run
```

## Non-goals

- No code submissions to, or release demands on, `deepseek-ai/deepseek-harness`.
- No modification of DSH's Web bundle, Settings Slot, API Remote, or CLI sources.
- The browser never talks to the GitHub API directly; users never configure tokens.
- Lifecycle scripts never run without the user's explicit, per-install, per-commit consent.

## Links

- [linux.do](https://linux.do) — 新的理想型社区（友链）

---

# DSH 插件市场（中文文档）

**仓外可安装的 DeepSeek Harness bundle**：一个活在 DSH 设置界面里的插件市场。它不属于 DSH 官方仓库，不要求修改或合并 DSH 源码，也不是独立 Web 产品。界面语言跟随 DSH 自动切换（中文 / English）。

## 工作原理

- 分发单元：声明 `dsh.bundle.patch` 的 npm/Git/tarball package。
- Host：下载并严格校验中央静态目录（schema + 完整性摘要），维护 last-known-good 缓存，拥有当前 profile 的审核与写入权。
- Client：通过 `settings.plugins.tab` Slot 提供检索、筛选、详情、风险信号、审核确认与整合方案界面。
- Host/Client 通道：包私有、同源的 `/api/plugin-marketplace` JSON API，不修改 DSH 的静态 Typert Remote 清单。
- 目录生产：本仓库 GitHub Actions 每日扫描带 `dsh-plugin` topic 的候选仓库；只有静态校验通过且未归档的 Bundle 进入用户目录，拒绝项只保存在 workflow artifact。遇到 GitHub Search 1,000 条上限时按创建时间窗口递归拆分。普通用户不需要 GitHub 账号、Token 或 VPS。

## 安装安全

自动安装固定 40 位不可变 commit，一律经过 能力预检 → 短期审核 plan → 确认执行，失败时回滚 profile manifest、lockfile 与 workspace 配置。安装资格由固定 commit 上的证据决定：

| 目录条目 | 扫描器证明的内容 | 安装行为 |
| --- | --- | --- |
| **可自动安装** | 所有安装目标（入口文件、patch）在固定 commit 的 git tree 中存在 | `pnpm add --ignore-scripts`，第三方生命周期脚本绝不运行 |
| **需确认脚本** | 目标缺失（未随仓库提交构建产物）但声明了生命周期脚本 | 审核页**逐字展示**脚本内容；你显式勾选同意后，Host 才在 profile 的 `allowBuilds` 写入精确的 `'name@固定spec': true` 授权并不带 `--ignore-scripts` 安装。授权只覆盖本次审阅的 commit，卸载时自动撤销 |
| **手动安装** | 以上都不满足 | 只展示仓库链接，市场不执行任何内容 |

## 整合方案（Solution Packs）

整合包是一个插件仓库策展清单。仓库同时携带 `dsh-plugin` 与 `dsh-plugin-pack` 两个 topic 并提供 `dsh.pack.json` 即成为整合包：

```json
{
  "schemaVersion": 1,
  "name": "我的精选",
  "description": "一套策展的起手组合",
  "items": ["owner/plugin-a", "owner/plugin-b"]
}
```

- `items` 为 1–50 个 `owner/repo`；扫描时解析为稳定的仓库 id，改名不会造成身份错配。
- 市场逐项显式标注：将自动安装 / 需确认脚本 / 需手动安装 / 未收录 / 已在 profile 中，并给出诚实的“可安装 N/M”计数。
- 安装整合包 = 串行复用单插件的 plan→execute 路径，首个失败即停止、不回滚、逐项报告结果。
- **整合包不放权**：需确认脚本的插件仍需进入其详情页单独审阅同意；手动项保持手动。

## 插件作者指南

可被收录的条件：仓库携带 `dsh-plugin` topic、`package.json` 声明 `dsh.bundle.patch`、且 `cordis.patch.yml` 有效。可选 `dsh-category-theme|ui|tool|memory` topic 决定目录分类。

**获得自动安装资格**：让你的 bundle 要加载的文件存在于固定 commit 的 git tree 中——把构建产物（如 `lib/`）提交进仓库（本仓库即如此）。若刻意不提交构建产物、由 `prepare`/`install` 脚本生成，用户会在安装前逐字看到脚本并可选择按次同意；同意范围永不超出被审阅的 commit。

## 安装到本机 DSH

普通用户不需要 GitHub Token。自动安装需要 Host 能调用 `pnpm`（插件也会自动尝试 `corepack pnpm`）；两者都不可用时 WebUI 保持浏览能力并给出恢复提示，不会显示假成功。

默认目录由本仓库的 GitHub Pages 提供。开发时可用环境变量临时覆盖：

```powershell
$env:DSH_PLUGIN_MARKETPLACE_CATALOG_URL = 'https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json'
dsh plugin --profile web add D:\Work\dsh-plugin-marketplace
dsh --profile web --dump-config
dsh web
```

从 GitHub 安装必须固定 commit（本仓库提交了构建后的 `lib/`，因此不会在你的机器上执行 `prepare`）：

```powershell
dsh plugin --profile web add github:w2112515/dsh-plugin-marketplace#<40位commit>
```

发布 npm 后可改为 `dsh plugin --profile web add dsh-plugin-marketplace`。卸载：`dsh plugin --profile web remove dsh-plugin-marketplace`。

## 配置

bundle 插入的 row id 是 `plugin-marketplace`。可在 `$DSH_HOME/profiles/web/cordis.patch.yml` 覆盖完整配置（patch 对 `config` 是整体替换，必须写全所有字段）：

```yaml
- id: plugin-marketplace
  config:
    catalogUrl: https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json
    maxAgeMs: 172800000
    timeoutMs: 15000
    maxBytes: 5000000
```

## 本地构建

要求 Node.js `^22.19.0 || >=24` 和 pnpm 11。

```powershell
cd D:\Work\dsh-plugin-marketplace
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm pack --dry-run
```

## 非目标

- 不向 `deepseek-ai/deepseek-harness` 提交代码或要求官方发布。
- 不修改 DSH 的 Web bundle、Settings Slot、API Remote 或 CLI 源码。
- 浏览器不直接访问 GitHub API，不要求用户配置 Token。
- 未经用户逐次、逐 commit 的显式同意，绝不运行生命周期脚本。

## 友情链接

- [linux.do](https://linux.do)
