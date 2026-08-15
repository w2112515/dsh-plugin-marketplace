# Claude Code Frontend Implementation Prompt

以下内容直接交给 Claude Code。目标是当前 M1 的生产级 DSH Client UI，不是设计说明页、营销落地页或脱离 DSH 的独立 demo。项目已确认 M2.5 会增加 Solution Packs，但本提示词不会用未来能力扩大当前交付。

---

你是一名负责 DeepSeek Harness WebUI 的高级前端与产品设计工程师。请为 **DSH Plugin Marketplace M1 只读插件目录** 实现前端视觉与交互层。你只负责 Client/UI 范围；GitHub scanner、catalog v1 schema、Host fetch/cache 与只读 Remote DTO 已由另一个工程 owner 在独立、已验证的后端提交中完成，稍后会合并进当前分支。权限、安装意图解析与 profile 操作执行不属于本轮。

## 1. 工作目录与权威

主要代码仓库：`D:\Work\deepseek-harness`

产品与架构规格：`D:\Work\dsh-plugin-marketplace\README.md`

开始修改前必须：

1. 阅读仓库根 `AGENTS.md`、`docs/architecture.md`、`packages/AGENTS.md` 和所有更近的指令文件；
2. 检查 `git status --short --branch`，保留所有既有改动，不 reset、不覆盖、不顺手重构；
3. 本次由上层工程 owner 统一审查、集成和提交；你不要执行 `git commit`、`git stash`、`git reset`、`git checkout --`、rebase 或 push；
4. 阅读并以当前源码为准：
   - `packages/client/ui-settings/src/client/contract/slots.ts`；
   - `packages/client/ui-settings-plugins`；
   - `packages/client/ui-settings-plugin-inventory`；
   - `packages/client/ui-theme/src/styles`；
   - `packages/client/ui-primitives`；
   - `packages/client/ui-trajectory` 中 `@tanstack/react-virtual` 的当前用法；
   - `packages/bundle/web-app` 的真实 Client plugin 组合方式；
5. 不根据本提示词猜测过期的 package manifest、Slot props、Loader export 或构建入口；发现冲突时以当前类型、实现和 validator 为准并报告。

## 2. 当前里程碑与目标结果

用户在真实 DSH WebUI 的 **Settings → Plugins → Marketplace** 中，可以：

- 快速理解目录最后更新时间和当前是否离线/过期；
- 搜索插件名、描述、作者、package、topics 和 keywords；
- 按兼容性、安装资格和维护状态筛选；
- 按相关性、stars、最近代码更新、最近收录排序；
- 在卡片中快速判断插件用途、活跃度和风险；
- 进入内联详情，再返回原列表且保留搜索、筛选和滚动位置；
- 在后端能力尚未接通时看到诚实的 disabled/unavailable 状态，不出现假安装成功。

这必须看起来像 DSH 原生能力，不像嵌入的 GitHub 页面、下载站或独立 SaaS。

本轮只实现“插件”目录。不要展示空的“整合方案”切换、Coming Soon 卡片、Pack fixture 或永久 disabled Pack 入口。M2.5 只有在真实 Pack DTO 和 Host plan 能力进入执行窗口后才成为用户可见范围。

## 3. 你的所有权

你负责：

- 新的 Marketplace Client workspace plugin 及其 package-local React/CSS/locale/test 文件；
- 通过现有 `settings.plugins.tab` 注册 feature-owned tab；tab id 使用 `marketplace`，顺序应位于当前 inventory tab 之后，但先检查当前注册值；
- 目录列表、搜索、筛选、排序、卡片、内联详情和所有可见状态；
- DSH light/dark theme、响应式、键盘、焦点与 reduced-motion；
- 测试专用 fixture/visual harness，以及真实浏览器截图；
- 如现有 DSH primitive 确实缺少通用图标或控件，可在对应 owner 中做最小补充并添加测试。

你不负责，也不要实现：

- GitHub API、Actions scanner、Pages 发布或目录增量算法；
- 公共 catalog schema、Host filesystem/cache、Typert Remote namespace；
- 用户 GitHub Token、权限判断、profile 选择、pnpm、安装/更新/移除；
- 自动重启 DSH、配置写入或 generic schema form；
- 为了让按钮可点而创建生产 mock API、localStorage 业务真相或假 success toast；
- Solution Pack 的 schema、resolver、批量安装 UI、未来通用卡片或通用安装向导。

当前前端工作树尚未合并后端提交，因此把 Remote 输入隔离在一个很薄的 package-local adapter／injected face 之外；不要发明第二套公共 DTO。可先完成纯 presentation component 和 test-only fixture，但 fixture 不得进入 shipped `dsh-web-app` 的生产路径。安装 CTA 在 M1 必须 disabled 并解释原因，不能用 fixture、localStorage 或假 API 激活。

### 3.1 已完成的后端契约（按此接线，不要重新设计）

后端合并后，`@deepseek-ai/dsh-api-remotes/client` 会导出 `MarketplaceCatalogView`，并在生成 Remote 上提供：

- `ctx.remote.pluginMarketplace.snapshot()`：只读当前内存／last-known-good 状态，不等待网络；
- `ctx.remote.pluginMarketplace.refresh()`：执行单飞、带 ETag 的条件刷新；
- 两个调用都返回 Typert `RemoteResult`。必须先检查 `result.ok`，成功时读取 `result.value`，失败时把公开错误转换成诚实的 UI 状态。

`MarketplaceCatalogView` 的稳定字段如下：

- `status: 'ready' | 'empty' | 'unavailable'`；
- `source: 'network' | 'cache' | 'none'`；
- `sourceUrl: string`、`lastSuccessfulFetchAt: string | null`、`stale: boolean`；
- `catalog: MarketplaceCatalogSnapshot | null`；
- `error: { code; message } | null`。

`catalog` 含 `generatedAt`、`scannerVersion`、`topic`、`summary` 与 `entries`。每个 entry 含：

- `repositoryId`；`repository.{fullName,url,defaultBranch,commitSha,archived}`；
- `package.{name,version,description,author,license}`；
- `topics`、`keywords`、`stars`；
- `repositoryCreatedAt`、`lastCodePushAt`、`firstSeenAt`、`indexedAt`；
- `source.{kind,ref,packageJsonPath,patchPath}`；
- `validation.{status,code,message}`；
- `compatibility`、`installability`、`riskSignals`。

加载策略必须是 cache-first：组件挂载先调用 `snapshot()` 立即显示已有数据，再在后台调用 `refresh()` 更新；用户刷新按钮只调用 `refresh()`。搜索、筛选、排序完全在已取得的完整 catalog 上本地执行，不触发 GitHub 或逐卡请求。不要从浏览器直接 `fetch` GitHub、Pages 或 `sourceUrl`。

由于当前分支暂时没有上述生成类型，允许在唯一 adapter 边界中声明与以上字段严格一致的临时结构类型，或使用 injected methods 让组件保持纯粹；不要让临时类型扩散到组件之外。完成报告必须指出该 adapter，供合并后替换为 `MarketplaceCatalogView` 和 `ctx.remote.pluginMarketplace`。后端参考实现位于 `D:\Work\dsh-plugin-marketplace\deepseek-harness-backend\packages\host\plugin-marketplace`，只读参考，不得修改。

### 3.2 已确认但不属于本轮的 Solution Packs 边界

未来 M2.5 会在同一个 Marketplace tab 中增加“插件 / 整合方案”内容范围，并把 Pack 解析为与单插件相同的多项 InstallPlan。当前实现需要遵守以下兼容边界，但不要提前实现未来 UI：

- Marketplace tab contribution 自己拥有内容区域，不把插件目录硬编码进 Settings shell；
- 当前 query/filter/sort 可以保持 Plugin-specific，不要为了未来 Pack 抽象成含糊的通用 catalog 状态；
- 保留清晰的页面层级：Marketplace root → Plugin list/detail；未来 Pack list/detail/plan 是同级领域子视图；
- 不把 `PluginCard` 抽象成 `MarketplaceCard`。未来 Pack Card 以用户结果和成员组合为核心，与 Plugin Card 不是同一个领域对象；
- 共享范围只限已成立的 primitive、tokens、状态徽章、焦点/返回机制和布局基础；
- 不在 shipped code 中加入 Pack 假数据、公共类型、feature flag、空路由或 disabled 导航；
- 如果当前实现发现会实际阻塞未来同级子视图的 shell/Slot 限制，在交付报告中说明源码证据和最小后续 seam，不自行修改公共契约。

未来 Pack 目标态仅作为视觉边界参考：场景卡片 → 内联详情 → 可选成员/profile → 逐项差异确认 → 真实执行/部分结果。Settings 已是 dialog，未来同样不能通过嵌套多层 Modal 完成该流程。

## 4. 固定技术栈

- React 18 + TypeScript 6；
- Vite 6 / DSH Client module system；
- Cordis function plugin，遵循当前 workspace Client plugin export 形式；
- CSS Modules；
- DSH `--dsw-*` design tokens；
- `@deepseek-ai/dsh-client-ui-primitives`；
- 必要时复用当前 workspace 已有的 `@tanstack/react-virtual`；
- Vitest + React Testing Library + 真实 DSH/Playwright 浏览器验证。

禁止引入：Next.js、Tailwind、Ant Design、MUI、shadcn、Framer Motion、另一套图标库、另一套主题变量、独立 SPA shell 或独立登录/导航。

不要升级 React、Vite、TypeScript 或任何无关依赖。

## 5. 当前 M1 页面结构

Marketplace tab 继承 Plugins section 已有标题和 tab chrome，不重复画一个巨大的 Marketplace hero。

### 目录视图

从上到下：

1. 一行紧凑状态栏：结果总数、`Updated …`/`Cached …`、刷新按钮或离线/过期说明；
2. 主要搜索框：占满可用宽度，清晰 focus，支持清除；
3. 一行可换行的筛选 chips 与右侧排序控件；
4. 两列插件卡片网格；内容宽度失败时降为一列；
5. loading、empty catalog、empty search、stale cache、offline、fatal error 各自有准确文案和恢复动作。

Settings 当前内容列约束和现有 Plugins tab 是布局事实。不要为了视觉效果修改整个 Settings shell 或硬编码 viewport 宽度。

### 插件卡片

每张卡片只展示用于扫描和比较的信息：

- 稳定图标/字母 fallback，不能用 emoji 代替功能图标；
- 插件名和 package/repository 次级信息；
- 最多两行用途描述；
- 兼容性与安装资格文字徽章；
- stars、最近代码 push、首次收录或 license 中最相关的两到三个信号；
- 已归档、未知兼容性、Git source 或 lifecycle 风险必须有文字，不只靠颜色；
- 点击卡片进入详情；卡片内不要塞 README、完整 manifest 或一排同权重按钮。

卡片可以成立，因为每个插件有独立身份、状态和详情动作；仍要通过“去容器检验”：即使移除背景和阴影，标题、描述、状态和元数据层级也必须清楚。

### 内联详情

不要在 Settings dialog 里面再套一个无必要的详情 Modal。进入同一 tab 内的 detail 子视图：

- 顶部是可键盘操作的返回按钮、插件名、repository/package 和主要状态；
- 依次展示用途、兼容性、来源、风险、stars 与时间、author/license、topics/keywords；
- GitHub/README 是明确的外链动作；
- 返回列表时恢复原 query、filters、sort、scroll 和焦点；
- 窄屏保持相同内容顺序，不把次要侧栏放到主要内容之前；
- 安装区展示精确来源与资格。没有真实 operation 时，按钮 disabled，文案说明“安装能力尚未接通”或实际权限原因。

## 6. 私有 presentation model

可以在 Marketplace package 内定义一个仅供呈现层使用、不可作为公共 Remote contract 的私有 view model。它至少需要表达：

- stable id；
- display name、description、package、repository URL；
- author、license、topics/keywords；
- stars 和 stars snapshot time；
- repository created、last code push、first seen、indexed time；
- archived；
- validation status；
- compatibility：`compatible | incompatible | unknown`；
- installability：`browse-only | manual | one-click-eligible`；
- verified risk signals；
- catalog freshness 与 access mode：local privileged 或 remote read-only。

把上述 Remote DTO 的适配留在单一 adapter 中。组件不能解析 GitHub 原始响应、调用 fetch、访问文件系统或猜测缺失字段。

当前 presentation model 就是 Plugin entry，不要为了未来 Pack 加入 `kind` union、可选 members、通用 action 或批量 operation 字段。M2.5 进入执行窗口时会依据真实 Pack DTO 新增独立的 Pack presentation model。

测试数据使用明显的 fixture 身份并只出现在 tests/visual harness。至少准备：

- 一个兼容、活跃、可 one-click 的短名称插件；
- 一个长名称、长描述、未知兼容性的 manual 插件；
- 一个 archived 或含 lifecycle 风险的浏览-only 插件；
- 中英文、零 stars、大 stars、长 topics 和缺失 license 等边界。

## 7. 视觉方向

视觉关系：**插件目录对象 → 用户快速比较与判断 → 紧凑卡片、克制状态色和清晰 detail 层级**。

风格可以概括为“DSH 原生 × GitHub 信息密度 × Linear 交互工艺”，但不要复制它们的 logo、专有字体、完整配色或页面 composition。

- 使用 DSH 蓝灰中性色和现有 semantic tokens；
- DeepSeek Blue 只用于业务状态、focus 和唯一主动作；
- 层级主要由 12/13/14/18px 字体角色、间距、细边框和背景层级构成；
- 卡片建议 10px 左右圆角、1px token border、克制 hover；具体值需与相邻 Settings 页面视觉对齐；
- 阴影仅在确实表达浮层或选中深度时使用；
- 不做玻璃拟态、大面积渐变、霓虹发光、营销 hero、巨型数字、3D 插画、无意义图案或卡片套卡片；
- 不直接从 GitHub 加载 publisher avatar。没有经过 Host 缓存/CSP/隐私设计的外部图片先使用 DSH 图标或确定性文字 fallback；
- 所有数值使用 tabular numerals，时间和 stars 的视觉权重低于名称、用途和兼容性；
- light/dark 不是反色版本，两边都检查 border、hover、disabled、status 与 focus 对比度。

## 8. 动效与交互

- 优先 CSS transition，不新增 animation runtime；
- 只为 card hover/focus、chip selection、detail enter/back 和状态变化提供 120–200ms 的细微反馈；
- 不用动画延迟主要内容，不做持续漂浮或背景动效；
- `prefers-reduced-motion: reduce` 下移除非必要 transition/transform；
- 搜索输入不得每次触发网络请求；本地过滤可以直接或通过很短 debounce 完成；
- 大目录使用虚拟化时，键盘顺序、scroll restore 和动态高度必须可靠；没有真实性能证据时不要过早增加复杂虚拟化。

## 9. 状态与文案

必须实现或以可测试 props 表达：

- loading skeleton；
- ready；
- catalog truly empty；
- filter/search empty；
- stale cache；
- offline with last-known-good；
- fatal error with retry；
- remote read-only；
- archived/incompatible/unknown/manual/one-click entry states；
- install unavailable/disabled。

错误要说明发生了什么、数据是否仍可浏览、用户可以做什么。不要只写 `Something went wrong`。中文和英文文案都由 package 自己的 locale owner 提供，不硬编码在组件中。

## 10. 可访问性与响应式

- 使用语义 heading、list/listitem、button、search、status/alert；
- 所有 icon-only button 有可访问名称；
- 筛选 chips 有明确 selected state，不只改变颜色；
- 键盘可以搜索、切换筛选、浏览卡片、进入详情和返回；
- focus ring 使用 DSH business token，不能被 overflow 裁掉；
- 返回列表时把焦点还给此前卡片；
- loading 使用 `aria-busy`，错误用合适的 alert，更新提示不要抢读屏；
- 200% zoom、长中文/英文、390px 窄屏不横向溢出；
- 触摸目标、文本对比和 disabled 状态清晰；
- 不在视觉顺序和 DOM 顺序之间制造冲突。

## 11. 实现边界

- 优先把全部新视觉代码放在 Marketplace package 内；
- 不修改 `ui-settings-plugins` 去 import Marketplace；通过 Slot 注册；
- 不把 Marketplace 混入现有 runtime plugin inventory；
- 不修改 Settings shell 来硬编码 tab；
- 不扩大 `ui-primitives`，除非当前缺口至少是通用控件/图标且确实被本实现消费；
- 不创建新的公共 Service、Remote schema 或 catalog manifest；
- 不创建 Pack 页面、Pack route、Pack fixture、通用 catalog item 或通用 install wizard；
- 注册必须使用当前 Cordis effect/disposer 机制并证明卸载后 contribution 消失；
- package manifest、exports、tsconfig、compiler aggregate、web-app composition、README、JSDoc、invariant 和 Agent Note 遵守当前 DSH 规则；
- 你不是仓库中唯一的实现者，不得撤销他人改动；遇到重叠文件先适配当前状态。

## 12. 完成证据

不要只交源码或一张 happy-path 截图。至少需要：

1. Marketplace package 的 focused tests：搜索、筛选、排序、详情返回、状态和键盘；
2. Slot registration/disposal 测试；
3. 当前仓库要求的 typecheck、lint/build 或 package gate；
4. 真实 Loader composition 中能打开 Settings → Plugins → Marketplace；
5. 在真实浏览器查看并截图：
   - light desktop ready；
   - dark desktop ready；
   - 390px narrow；
   - long content；
   - offline/stale 或 fatal error；
6. 实际检查 focus、键盘、滚动恢复、溢出和 reduced motion；
7. 报告截图中观察到并修复的视觉问题。截图存在不等于视觉通过。
8. shipped composition 中不存在测试 fixture、假 Remote、空 Pack 入口或假安装成功路径。

当前后端提交虽已完成但尚未合入此工作树，因此明确把结果报告为“presentation + test-only fixture + Remote adapter 已完成，真实生成类型待后端提交合并后收口”，不能声称安装已经完成。若执行期间发现后端契约已出现在当前仓库，则直接使用真实 `MarketplaceCatalogView` 与 `ctx.remote.pluginMarketplace`，不要保留临时重复类型。

最终交付时请报告：

- 修改文件和所有权；
- 真实运行的命令与结果；
- 实际查看的 viewport/theme/state；
- 未接通的 Host/API 能力；
- 需要 Codex 集成的薄 adapter 或接口假设；
- 当前页面层级是否允许未来增加同级 Pack list/detail；只报告实际限制，不提前实现 Pack；
- 没有覆盖的平台或状态。

---

提示词结束。
