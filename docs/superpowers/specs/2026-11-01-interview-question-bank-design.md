# 面试押题 + 我的题库 — 设计文档

- 日期：2026-11-01
- 状态：已确认
- 相关提交：`c54aa86`（简历优化模块，提供 provider 抽象 / 后台任务 / 节点进度条）、`565b035`（MiniMax 真实接入，提供 `chat()` / `extractJson()`）

---

## 1. 背景与目标

用户导入或选择历史简历后，AI 以面试官身份基于该简历出题：先问基础知识，再深挖项目，由易到难。每题附带参考答案，但**答案默认折叠**——用户先看到题，答不出来再点开。

每次押题的题目进入用户的**题库**，题库可管理、可筛选；用户重点关注的题可**收藏**。

核心工程难点：**同一份简历可以反复押题，模型每次措辞不同，会产出「换皮问法」的重复题**，必须保证不重复入库。

### 目标

1. 押题页能对任意一份简历生成 12 道题（4 档难度 × 3 题），每题带考点、分类、难度、参考答案。
2. 答案折叠展开，题干始终可见。
3. 题目落入题库，支持收藏、筛选、删除、按套分组查看。
4. 重复题不得入库：题级去重 + 套级重复拦截。

### 非目标（明确不做）

- 不做实时对话式面试（自测清单，不是聊天机器人）
- 不做「我的回答」输入框与自动批改评分
- 不做题库导出 / 分享 / 协作
- 不做错题本、掌握度标记、间隔重复复习

---

## 2. 关键决策

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 题库存放 | 新增 Prisma 模型 + 一条迁移（打破优化模块时期「不新增迁移」的约束 —— 该约束针对的是临时后台任务表，题库是长期数据，必须落库） |
| 2 | 入口位置 | 顶栏 +1 项「面试押题」（标记 `◎`，区别于智能优化的 `✦`）；题库为独立页面 `/questions`，两页互相打通 |
| 3 | 去重策略 | 两层去重 + 整套重复时拦截（生成前规避 + 生成后本地三层判定） |
| 4 | 一套题构成 | 固定 12 题 · 4 档难度 · 基础/深挖各 6 |

---

## 3. 数据模型

新增两张表，一条迁移。

```prisma
/// 面试题库 —— 一次押题 = 一套
model QuestionSet {
  id          String   @id @default(cuid())
  userId      String
  /// 来源简历。存字符串不建外键：简历被删了题还在（题是用户资产）
  resumeId    String?
  resumeTitle String
  /// 生成引擎：minimax / local
  provider    String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user  User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  items QuestionItem[]

  @@index([userId, createdAt])
  @@map("question_sets")
}

/// 题库条目 —— 一道题
model QuestionItem {
  id          String   @id @default(cuid())
  userId      String
  setId       String
  resumeId    String?
  resumeTitle String
  /// 题干
  question    String
  /// 参考答案
  answer      String
  /// 考点关键词（模型给，2-4 个词），同考点即判重复
  topic       String
  /// basic | deep
  category    String
  /// 1-4，对应四档难度
  difficulty  Int
  /// 归一化指纹，查重用
  fingerprint String
  starred     Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  set  QuestionSet @relation(fields: [setId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([userId, starred])
  // 数据库层兜底:同一道题在同一用户下只能存在一份,
  // 跨套也不重复。这是「不重复入库」这条需求的最后一道保险 ——
  // 应用层 R1 判重是逻辑,这个唯一索引是硬约束,并发写入也拦得住。
  @@unique([userId, fingerprint])
  @@map("question_items")
}
```

`User` 模型需补 `questionSets QuestionSet[]` 与 `questionItems QuestionItem[]` 两个关系字段。

### 指纹唯一索引的取舍

`(userId, fingerprint)` 唯一索引把 R1 从「应用层逻辑」升级成「数据库硬约束」：即使两个确认请求并发，或某条代码路径绕过了判重，数据库也会拒绝第二份。

代价是写入时可能撞唯一约束 —— 这正是期望行为，捕获该错误并当作「重复题」跳过即可，而不是报错。R2/R3 判出的近似题指纹不同，仍由应用层拦截。

### 为什么 QuestionSet 单独建表

套级去重必须能按 `setId` 取回**整套题**来计算重复率。这一张表是整个去重机制的地基 —— 若只靠 `QuestionItem.setId` 分组，每次判重都要在内存里 groupBy 全量题，随着题库增长会明显变慢。

---

## 4. 去重机制

### 4.1 生成前规避（主力）

出题 prompt 里带上该简历**已出过的题干原文**（按创建时间倒序，最多取 60 条），明确要求模型避开。这是成本最低、覆盖面最广的一层。

### 4.2 生成后本地判定（三条规则，命中任一即判重复）

| 规则 | 判据 | 抓什么 |
|---|---|---|
| **R1 精确** | 归一化题干完全相同 | 一字不差的重复 |
| **R2 近似** | 字符 bigram 的 Jaccard 相似度 ≥ `0.82` | 换标点、换措辞的微调 |
| **R3 同考点** | `topic` 归一化后相同 | **换皮问法**（模型最常见的重复形态） |

**R3 是关键一层。** 模型每次出的「同考点不同问法」，文本相似度往往只有 0.3~0.5，靠 R2 抓不住；但让模型在生成时自己标注 `topic`（如「RAG 召回策略」），等于让它先把问题归一化了一次，后续判定退化成确定性的字符串相等。

### 4.3 归一化算法

```
normalize(text):
  1. 全角字符 → 半角
  2. 转小写
  3. 去掉所有空白
  4. 去掉所有中英文标点
  5. 剥离开头的填充词：反复尝试下面这组词，每轮剥掉一个匹配的前缀，
     最多剥 2 轮（再多就会伤及题干本体）：
     请介绍一下 / 介绍一下 / 请谈谈 / 谈谈 / 说说 / 请说说 / 简述 /
     描述一下 / 请描述 / 说一下 / 聊聊 / 请聊一下
```

```
fingerprint(text) = sha1(normalize(text)).slice(0, 16)

bigrams(s) = s 中所有相邻两字符组成的集合

similarity(a, b) = |A ∩ B| / |A ∪ B|     // Jaccard
```

### 4.4 套级拦截

若本套题中，与库中**任一既有套**重复的题数占比 ≥ `55%`，整套不入库。

- 12 题时即「重复 ≥ 7 题」（`ceil(12 × 0.55) = 7`）
- 模型只出了 6 题时，「重复 ≥ 4 题」同样触发（`ceil(6 × 0.55) = 4`）—— 阈值按**比例**算，不写死题数
- 页面提示：「这套与《简历 X》2026-10-28 那套高度重复」
- 同时提供按钮「仍要入库（只保留不重复的 N 题）」→ 跳过重复题后写入剩余题
- **不硬拦死**：误杀（R3 把两道确实不同的题判成同考点）时由用户拍板

### 4.5 已知取舍

- R3 会误杀「同考点但确实不同的题」。缓解：阈值提为命名常量 + 「仍要入库」逃生口。
- 阈值不做 UI 配置，避免增加交互面。

---

## 5. 押题流程

```
scan ──────→ generate ──→ dedupe ──→ answer ──→ confirm
简历扫描      出 12 题题干    查重       出参考答案    待确认入库
```

### 5.1 节点定义（5 个）

| key | 名称 | 做什么 | 完成提示 |
|---|---|---|---|
| `scan` | 简历扫描 | 抽取技能关键词、项目与经历 | 「识别到 N 个技能 · M 段项目」 |
| `generate` | 出题 | 模型出 12 道题的题干/考点/难度/分类 | 「生成 12 道题」 |
| `dedupe` | 查重 | 与已有题库比对，标出重复 | 「跳过 N 道重复题」 |
| `answer` | 出答案 | 只对保留下来的题生成参考答案 | 「生成 N 份参考答案」 |
| `confirm` | 待确认入库 | 等用户确认 | 「等你确认后写入题库」 |

### 5.2 题目分布

12 题 = 4 档难度 × 3 题，基础/深挖各 6：

| 难度档 | 题目数 | 基础 | 深挖 |
|---|---|---|---|
| 1 入门理解 | 3 | 2 | 1 |
| 2 熟练使用 | 3 | 2 | 1 |
| 3 原理机制 | 3 | 1 | 2 |
| 4 场景深挖 | 3 | 1 | 2 |

前面偏基础、后面偏深挖，与「从易到难」一致。题卡按难度升序排列。

### 5.3 后台执行

完全沿用优化模块的机制：

- 任务表挂 `globalThis`（Next 每个 route 单独打包，模块级 Map 不共享）
- `POST /api/interview` 立即返回 202，`void runJob(job.id)` 不 await
- 前端 700ms 轮询；进 `/interview` 先 GET 找活跃任务接管
- 切页面 / 关标签页不中断
- 节点最短展示 420ms（`endStage` 先 sleep 再标 done，否则进度条会出现「无节点在跑」的空白）
- 任务 TTL 2 小时

### 5.4 两次模型调用

1. **`generate`**：出题干 + 考点 + 难度 + 分类。输出量小。
2. **`answer`**：只对**去重后保留下来的题**出参考答案。不在重复题上白烧 token。

`dedupe` 是本地计算，不调模型。

### 5.5 无 MiniMax key 时的本地兜底

沿用优化模块「本地引擎永远先跑」的思路：

- `scan`：从 `skills` / `projects` 抽关键词
- `generate`：按技能名与项目名套模板出题
- `answer`：给答题要点提纲（提示用户自行组织语言）

标注 `engineNote: 「本地兜底：模板化问题，参考答案仅为要点提纲」`。

---

## 6. 模型协议

### 6.1 出题（generate）

系统提示词要点：

- 扮演面试官，针对该简历提问
- 严格输出 12 道，分布固定（4 档 × 3 题，基础/深挖按 §5.2 配比）
- 每题必须带 `topic`（考点关键词，2-4 个词，同考点只能出现一次）
- 不得出「已出过的题」清单里的题
- 绝不编造简历里没有的经历、公司、数字
- 只输出 JSON

用户提示词包含：简历 JSON（去掉头像）+ 目标岗位 + 已出过的题干清单。

输出格式：

```json
{
  "questions": [
    {
      "question": "题干",
      "topic": "RAG 召回策略",
      "category": "basic",
      "difficulty": 1
    }
  ]
}
```

### 6.2 出答案（answer）

系统提示词要点：

- 扮演资深面试官，给出**参考答案要点**
- 答案要具体、可背诵，禁止空话（「要深入理解原理」这类不算答案）
- 不编造简历里没有的成果
- 只输出 JSON

输出格式：

```json
{ "answers": [ { "index": 0, "answer": "…" } ] }
```

`index` 是**去重后保留下来的题目序号**（0 起），对应传给模型的那份题目清单。模型返回的 `index` 越界或缺失时，该题答案留空并在 UI 上标注「参考答案生成失败」，不猜、不编。

### 6.3 JSON 解析与模型客户端

把 `chat()` / `extractJson()` / `stripThinking()` 从 `optimize/providers/minimax.ts` 抽到 **`src/lib/llm/chat.ts`**，optimize 与 interview 两边共用同一份实现。

`extractJson()` 已经处理了 `<think>` 思考块剥离、```json 围栏、配对花括号扫描 —— **不要重写**，直接 import。

### 6.4 异常与降级

| 情况 | 处理 |
|---|---|
| 模型返回题数 < 12 | 以实际返回为准继续，UI 顶部提示「本次只出了 N 题」；不强行补齐 |
| 模型返回 0 题 | 任务失败，错误信息「模型没有生成出任何题目」 |
| 去重后 0 题存活 | 整套不入库，提示「这套题全部与题库重复，换一份简历或稍后再试」 |
| `topic` 解析失败（缺字段） | 降级为不启用 R3（只用 R1/R2），并在 `engineNote` 注明「考点标注缺失，重复判定精度下降」 |

---

## 7. API 契约

```
POST   /api/interview                创建押题任务 → 202 { job }
GET    /api/interview                我的活跃任务 → { jobs }
GET    /api/interview/[jobId]        状态 + 结果 → { job, set }
DELETE /api/interview/[jobId]        取消任务
POST   /api/interview/[jobId]/confirm 确认入库 → { inserted, skipped, setId }

GET    /api/questions                题库列表 → { items, total, sets }
PATCH  /api/questions/[id]           { starred: boolean } → 收藏切换
DELETE /api/questions/[id]           删除单题
DELETE /api/questions?setId=<setId>  删除整套
```

### 创建任务请求体

```jsonc
{
  "source": { "kind": "resume", "resumeId": "<id>" }
}
```

`source` 是**判别联合**，不是字符串（与优化模块同构）。

### 查询参数（`GET /api/questions`）

| 参数 | 说明 |
|---|---|
| `resumeId` | 按来源简历筛选 |
| `category` | `basic` / `deep` |
| `difficulty` | `1`~`4` |
| `starred` | `true` / `false` |
| `q` | 关键词，匹配题干、答案、考点 |
| `setId` | 取某一整套 |

### 权限

全部接口：`getSession()` 拿 userId → 校验 `job.userId === session.sub` / `item.userId === session.sub`。题库不共享。

---

## 8. UI 规格

### 8.1 `/interview` 押题页

三段式，与优化模块一致：

1. **来源选择**：选一份历史简历（可复用 `source-picker` 的模式，但独立组件，字段不同）
2. **进度面板**：5 节点进度条
3. **结果面板**：题卡列表 + 入库确认

题卡：

```
┌─────────────────────────────────────────┐
│ 入门理解 · 基础 · 考点「RAG 召回策略」  ☆ │  ← 难度/分类/考点 + 收藏
│                                          │
│  介绍一下 RAG 检索里你用的召回策略，      │  ← 题干始终可见
│  为什么选它而不是别的？                  │
│                                          │
│  ▸ 看参考答案                            │  ← 默认收起
└─────────────────────────────────────────┘
```

- 题干**始终可见**，答案**默认收起**
- 用受控 React disclosure（`button` + `aria-expanded`），不用原生 `<details>`：样式可控，且与仓库现有组件风格一致
- 收藏按钮当场可点
- 折叠态**不显示答案摘要**（答案只整段出现，避免一眼瞥到要点）

底部：「确认入库题库」→ 二次确认层显示「12 题入库 / 跳过 N 题重复」→ 写入 → 「已入库 12 题 → 去题库」。

整套被拦截时：顶部黄色提示条 + 「仍要入库（只保留不重复的 N 题）」按钮。

### 8.2 `/questions` 我的题库

- 筛选条：来源简历 / 分类 / 难度 / 仅看收藏 / 关键词搜索
- 列表按**套分组**展示（组头显示来源简历、生成时间、题数、provider）
- 每题：折叠答案 + 收藏 + 删除
- 组级：删除整套
- 顶部：「再押一套」→ 回 `/interview`

### 8.3 导航

`SiteNav` 的 `PRIMARY_LINKS` 增加：

```ts
{ href: "/interview", label: "面试押题", mark: "◎" },
```

保持 5 项，不再加第 6 项。

### 8.4 样式约束

- CSS Modules：**纯选择器必须含本地类名**
- 复用既有设计令牌：`--paper` / `--paper-deep` / `--paper-edge` / `--ink` / `--ink-soft` / `--pencil` / `--blue` / `--highlight`
- 不引入新字体（`--font-display` Fraunces / `--font-ui` DM Sans / `--font-mono` JetBrains Mono）
- 难度标签用四档色阶（青 → 蓝 → 靛 → 深蓝），与 `--blue` 系保持一致，不引入新色相

---

## 9. 文件清单

### 新增

```
prisma/migrations/<时间戳>_add_question_bank/migration.sql   ← 目录名由 prisma migrate dev 自动生成

src/lib/interview/types.ts              类型：Question / QuestionSet / Difficulty / Category / JobState
src/lib/interview/stages.ts             5 个节点定义 + MIN_STAGE_MS
src/lib/interview/fingerprint.ts        normalize / fingerprint / bigrams / similarity
src/lib/interview/fingerprint.test.ts
src/lib/interview/dedupe.ts             题级三规则 + 套级拦截
src/lib/interview/dedupe.test.ts
src/lib/interview/generator.ts          prompt 构造 + 模型调用 + 解析 + 本地兜底
src/lib/interview/generator.test.ts
src/lib/interview/job-store.ts          globalThis 任务表
src/lib/interview/runner.ts             节点推进
src/lib/interview/repo.ts               Prisma 题库读写（list / insert / star / delete）
src/lib/interview/repo.test.ts

src/lib/llm/chat.ts                      共享模型客户端：chat() / extractJson() / stripThinking()
                                         （从 optimize/providers/minimax.ts 抽出，两边共用）

src/app/api/interview/route.ts
src/app/api/interview/[jobId]/route.ts
src/app/api/interview/[jobId]/confirm/route.ts
src/app/api/questions/route.ts
src/app/api/questions/[id]/route.ts

src/app/interview/page.tsx
src/app/questions/page.tsx

src/components/interview/interview-workspace.tsx
src/components/interview/source-picker.tsx
src/components/interview/progress-panel.tsx
src/components/interview/question-card.tsx
src/components/interview/interview.module.css

src/components/questions/question-bank.tsx
src/components/questions/questions.module.css
```

### 改动

| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | 加 2 个 model + `User` 关系字段 |
| `src/components/site-nav/site-nav.tsx` | `PRIMARY_LINKS` +1 项 |
| `src/lib/optimize/job-store.ts` | 注释「项目当前禁止新增 Prisma 迁移」已不成立，改掉 |
| `src/lib/optimize/providers/minimax.ts` | `chat()` / `extractJson()` / `stripThinking()` 移到 `src/lib/llm/chat.ts`，这里改为引用 |
| `src/lib/optimize/providers/minimax.test.ts` | 跟着 import 路径调整，测试逻辑不变 |

---

## 10. 测试策略

| 目标 | 手段 |
|---|---|
| 归一化正确性 | 单测：全角/半角、大小写、空白、标点、填充词各一例 |
| R1/R2/R3 判定 | 单测：完全相同、换标点近似、同 topic 换皮、确实不同四类样例 |
| 套级拦截 | 单测：7/12 重复触发拦截、6/12 不触发；6 题套按比例判（4/6 触发、3/6 不触发） |
| 指纹稳定性 | 单测：同一文本两次归一化结果一致；不同文本不碰撞 |
| 题目分布 | 单测：生成结果按 §5.2 配比校验 |
| 题库仓储层 | 单测：收藏切换幂等；删题/删套；写入撞 `(userId, fingerprint)` 唯一约束时**跳过而非报错**；他人题目访问返回 403/404 |
| API 权限 | 集成：他人简历 / 他人题目访问返回 403/404 |
| 端到端 | Playwright：选简历 → 出题 → 折叠展开 → 收藏 → 入库 → 题库可见 → 重复押题不入库 |

回归门禁：`npm run typecheck`（0 error）、`npx vitest run` 全绿、`npm run build` exit 0。

---

## 11. 风险与取舍

| 风险 | 缓解 |
|---|---|
| 模型不按格式输出 `topic` | `extractJson()` 逐个候选解析；解析失败降级为不启用 R3（只用 R1/R2）并在 `engineNote` 注明 |
| 12 题一次输出量大导致超时 | 出题与出答案**分两次调用**；出答案只针对保留题；超时给 180s（同优化模块） |
| 重复率阈值过严/过松 | 阈值提为命名常量；「仍要入库」按钮兜底 |
| 题库数据量大后加载慢 | `QuestionSet` 独立表 + 三个查询索引 + 一个唯一索引；题库页分页 |
| 本地兜底质量低 | 明确标注 `engineNote`，不让用户误以为是 AI 生成 |

---

## 12. 实施顺序

1. Prisma model + 迁移 + `repo.ts`
2. `fingerprint.ts` + `dedupe.ts` + 单测（**先去重后 UI**，去重是核心风险）
3. `generator.ts`（prompt / 协议 / 本地兜底）+ 单测
4. `job-store.ts` + `runner.ts` + `stages.ts` + `types.ts`
5. API 四组路由
6. UI：题卡 → 押题页 → 题库页
7. 导航接入 + 全量回归 + 端到端验证
