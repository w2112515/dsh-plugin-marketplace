# DSH 插件市场（DSH Plugin Marketplace）

**[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的插件市场：在 DSH 自己的设置界面里浏览、审阅、安装插件——基于证据的安装安全、逐次同意的脚本安装、策展整合方案、零遥测。**

**English documentation: [README.md](README.md)**

## 这是什么？

DSH 插件市场是一个**仓外可安装的 DSH bundle**，为 DeepSeek Harness 提供完整的插件市场能力。它不属于 DSH 官方仓库，不要求修改或合并 DSH 源码，也不是独立 Web 产品。安装进 `web` profile 后，DSH 的 Host Loader 挂载市场 Host 插件，包内声明的 `dsh.client` 浏览器入口注册到「设置 → 插件 → 插件市场」。界面语言跟随 DSH 自动切换（中文 / English）。

一览：

- **2200+ 个插件**：每日扫描所有携带 `dsh-plugin` topic 的 GitHub 仓库，浏览不需要 GitHub 账号或 Token。
- **基于证据的安装资格**：扫描器证明每个插件在固定 commit 上哪些安装目标真实存在——「一键安装」意味着*已证明可装*，而不是*大概能装*。
- **脚本逐次同意**：安装脚本逐字展示，显式同意后才运行——永不持久化，绝不批量代同意。
- **策展整合方案**：一次审阅，装出一套完整的能力基线。
- **无遥测、无安装统计、无服务器**——目录就是 GitHub Pages 上的静态 JSON。

![DSH 设置中的插件市场：2211 个插件、九个分类、搜索、新鲜度指示和每行的评分入口](docs/screenshots/discover.png)

## 安装到本机 DSH

从 GitHub 安装必须固定 commit（本仓库提交了构建后的 `lib/`，因此不会在你的机器上执行 `prepare`）：

```powershell
dsh plugin --profile web add github:w2112515/dsh-plugin-marketplace#<40位commit>
```

普通用户不需要 GitHub Token。自动安装需要 Host 能调用 pnpm 11（插件也会自动尝试 `corepack pnpm`）；需确认脚本的安装需要 pnpm ≥ 11.7。两者都不可用时 WebUI 保持浏览能力并给出恢复提示，不会显示假成功。发布 npm 后可改为 `dsh plugin --profile web add dsh-plugin-marketplace`。卸载：`dsh plugin --profile web remove dsh-plugin-marketplace`。

默认目录由本仓库的 GitHub Pages 提供。开发时可用环境变量临时覆盖：

```powershell
$env:DSH_PLUGIN_MARKETPLACE_CATALOG_URL = 'https://w2112515.github.io/dsh-plugin-marketplace/plugin-marketplace/catalog-v1.json'
dsh plugin --profile web add D:\Work\dsh-plugin-marketplace
dsh --profile web --dump-config
dsh web
```

## 安装安全

自动安装固定 40 位不可变 commit，一律经过 能力预检 → 短期审核 plan → 确认执行，失败时回滚 profile manifest、lockfile 与 workspace 配置。安装资格由固定 commit 上的证据决定：

| 目录条目 | 扫描器证明的内容 | 安装行为 |
| --- | --- | --- |
| **可自动安装** | 所有安装目标（入口文件、patch）在固定 commit 的 git tree 中存在 | `pnpm add --ignore-scripts`，第三方生命周期脚本绝不运行 |
| **需确认脚本** | 目标缺失（未随仓库提交构建产物）但声明了生命周期脚本 | 审核页**逐字展示**脚本内容；你显式勾选同意后，Host 以 `--allow-build=<包名>` 替代 `--ignore-scripts` 执行一次安装，脚本执行被精确限定在本次调用的这一个包上。不写入 `allowBuilds`，同意永不持久化 |
| **手动安装** | 以上都不满足 | 只展示仓库链接，市场不执行任何内容 |

![插件详情页：用途、新鲜度与活跃度证据、社区评分，以及经过能力预检的安装面板](docs/screenshots/plugin-detail.png)

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
- 市场逐项显式标注：将自动安装 / 需确认脚本 / 需手动安装 / 未收录 / 已在 profile 中，并给出诚实的「可安装 N/M」计数。整合包卡片还会前置展示安装构成（如「7 一键 · 1 需审脚本 · 1 手动」），由扫描时的目录事实计算。
- 安装整合包 = 串行复用单插件的 plan→execute 路径，首个失败即停止、不回滚、逐项报告结果。
- **整合包不放权**：需确认脚本的插件仍需进入其详情页单独审阅同意；手动项保持手动。
- **整合包永不按 star 排序。** star 排序只会奖励「把最高星插件塞进包里」的行为——那是换了皮的 star 榜单，不是策展。排序为编辑精选优先（由市场维护者审阅一致性与诚实度后列入 `FEATURED_MARKETPLACE_PACKS`），其余按新鲜度。策展宁缺毋滥：能力空缺就空着，不用未经验证的插件凑数。

![整合方案视图：精选的 DSH 分类星数榜首整合包及其前置展示的安装构成](docs/screenshots/packs.png)

![整合包详情页：逐项安装状态与诚实的 3/9 可自动安装计数，不代替用户做任何同意](docs/screenshots/pack-detail.png)

## 社区评分

评分借用 GitHub 原生 reaction：目录中每个插件在[评分 issue](https://github.com/w2112515/dsh-plugin-marketplace/issues/1) 下有一条投票评论，点 👍/👎 即投票——一票对应一个真实 GitHub 账号。详情页展示总评分与近 90 天两个窗口，**不满 10 票不出结论**。客户端只读，投票全程发生在 GitHub 上，市场绝不持有你的凭据。

## 隐私立场

本市场**只读静态目录，永不回传**：不统计安装次数、没有遥测、没有分析端点——也刻意没有可以收集它们的服务器，目录就是 GitHub Pages 上的一份 JSON，每个安装决定都发生在你自己机器上。流行度信号只来自 GitHub 公开数据（stars），仅此而已。

## 工作原理

- 分发单元：声明 `dsh.bundle.patch` 的 npm/Git/tarball package。
- Host：下载并严格校验中央静态目录（schema + 完整性摘要），维护 last-known-good 缓存，拥有当前 profile 的审核与写入权。
- Client：通过 `settings.plugins.tab` Slot 提供检索、分类筛选、详情、风险信号、审核确认与整合方案界面。
- Host/Client 通道：包私有、同源的 `/api/plugin-marketplace` JSON API，不修改 DSH 的静态 Typert Remote 清单。
- 目录生产：本仓库 GitHub Actions 每日扫描带 `dsh-plugin` topic 的候选仓库；只有静态校验通过且未归档的 Bundle 进入用户目录，拒绝项只保存在 workflow artifact。遇到 GitHub Search 1,000 条上限时按创建时间窗口递归拆分。只有中央扫描器使用仓库自带的 `GITHUB_TOKEN`。
- 分类体系：插件按九个类别归类（主题、记忆、用量、技能、安全、消息渠道、界面、工具、模型接入），依据是显式的 `dsh-category-<slug>` topic 或保守整词匹配；没有任何可靠信号的插件诚实地留在「未分类」。

## 插件作者指南

可被收录的条件：仓库携带 `dsh-plugin` topic、`package.json` 声明 `dsh.bundle.patch`、且 `cordis.patch.yml` 有效。可选 `dsh-category-theme|memory|usage|skill|security|channel|ui|tool|provider` topic 显式决定目录分类。

**获得自动安装资格**：让你的 bundle 要加载的文件存在于固定 commit 的 git tree 中——把构建产物（如 `lib/`）提交进仓库（本仓库即如此）。若刻意不提交构建产物、由 `prepare`/`install` 脚本生成，用户会在安装前逐字看到脚本并可选择按次同意；同意范围永不超出被审阅的 commit。

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

## 仓库结构

```text
dsh-plugin-marketplace/
├── package.json
├── cordis.patch.yml
├── src/
│   ├── index.ts                 # Host 插件与同源 API
│   ├── catalog*.ts              # schema、网络、LKG 缓存、查询
│   ├── profile-operations.ts    # plan/确认/回滚、同意门控执行
│   └── client/                  # WebUI Slot 插件（中/英）
├── scripts/                     # GitHub 扫描器（插件 + 整合包）
├── website/public/              # workflow 生成的静态目录
└── .github/workflows/           # CI 与每日 Pages 发布
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
- 不做任何形式的遥测——包括安装次数统计。

## 友情链接

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)——宿主项目
- [DSH 分类星数榜首](https://github.com/w2112515/dsh-essentials-pack)——按机械规则收录各分类 star 数最高条目的整合包（标注快照日期）
- [linux.do](https://linux.do)——新的理想型社区（友链）
