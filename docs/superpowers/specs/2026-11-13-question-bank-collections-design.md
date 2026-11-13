# 我的题库：自建分组 + 三层折叠 — 设计文档

- 日期：2026-11-13
- 状态：已确认
- 关联：原设计文档 `2026-11-01-interview-question-bank-design.md`（本文在其基础上加一层「题库」分组，并改变题库页的展开口径）

---

## 1. 背景与目标

现在的「我的题库」页把用户所有的押题批次（套）平铺在一页上，每一套的题目**全部展开**。押三五次之后页面就被题目撑爆了，翻找某一轮押的题要先滚动再辨认。

同时，题目只能"落进唯一那个题库"——用户没法按公司、岗位、招聘批次把不同轮次的押题归到一起。

目标：

1. **用户能自建多个题库**（命名分组），押题入库时**选择保存到哪一个**。
2. **题库默认折叠**：进页面先看到题库列表（每个一行摘要），点开才看到里面的套，点套才看到题目。
3. 三层结构：**题库 › 套 › 题**。批次（套）这一层保留 —— 整套重复 55% 拦截那套判重逻辑的地基就是它。

### 非目标

- 不做题库导出 / 分享 / 协作
- 不做题库排序拖拽（按最近更新倒序即可）
- 不做跨题库的题目副本（见 §4 判重口径）
- 不做错题本、掌握度标记

---

## 2. 关键决策

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 层级 | 三层：题库（用户自建） › 套（一次押题） › 题 |
| 2 | 折叠 | 题库默认折叠，套默认折叠；点套才出题卡 |
| 3 | 历史数据 | 迁移时给每个有套的用户自动建一个「默认题库」，历史套全归进去 |
| 4 | 删题库 | 连同里面的套和题一起删；二次确认报「会删 N 套 M 题」；「默认题库」不可删 |
| 5 | 判重口径 | **不变**：一个用户一道题只存一份，题库只是分组视图，不是去重边界 |
| 6 | 折叠状态 | 组件内存态，不进 URL（URL 上的参数是筛选条件，折叠不是） |

---

## 3. 数据模型

新增一张表 `QuestionCollection`（题库），`QuestionSet` 加一列指向它。

```prisma
/// 我的题库 —— 用户自建的分组。一套押题题归到某个题库里。
model QuestionCollection {
  id        String   @id @default(cuid())
  userId    String
  /// 题库名。同一个用户下不重名。
  name      String
  /// 系统兜底题库:用户一个题库都没有时自动建,名字叫「默认题库」,不可删。
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  sets QuestionSet[]

  @@unique([userId, name])
  @@index([userId, createdAt])
  @@map("question_collections")
}
```

`QuestionSet` 增补：

```prisma
  /// 所属题库
  collectionId String
  collection   QuestionCollection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
```

`User` 增补 `questionCollections QuestionCollection[]`。

`@@unique([userId, name])` 让重名在建库那一刻就被数据库挡住 —— 用户建「腾讯」两次，第二次报 409 而不是静默多出一个同名库。

### 迁移分两步（SQLite 的限制）

SQLite 不支持 `ALTER COLUMN ... SET NOT NULL`，Prisma 对「可空 → 必填」的变更会生成「建新表 + 拷贝 + 删旧表 + 改名」。拷贝时若旧列有 null 就会撞非空约束。所以拆成两步：

**迁移 A（手写 backfill）**

1. `CREATE TABLE "question_collections"`（照 `20261101024056_add_question_bank/migration.sql` 的手写风格）
2. `ALTER TABLE "question_sets" ADD COLUMN "collectionId" TEXT`（先可空）
3. 给每个有套的用户建一个「默认题库」：

```sql
INSERT INTO "question_collections" ("id","userId","name","isDefault","createdAt","updatedAt")
SELECT lower(hex(randomblob(16))), "userId", '默认题库', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "question_sets" GROUP BY "userId";
```

4. 把历史套归置进去：

```sql
UPDATE "question_sets" SET "collectionId" = (
  SELECT c."id" FROM "question_collections" c
  WHERE c."userId" = "question_sets"."userId" AND c."isDefault" = 1
);
```

**迁移 B（Prisma 生成）**：把 `collectionId` 收紧为必填。此时拷贝的数据已全部有值，不会撞非空约束。

> 没有套的用户不会建默认题库 —— 等他第一次押题入库时，服务端按需建。

---

## 4. 判重口径：不变

**题库是分组视图，不是去重边界。**

- `(userId, fingerprint)` 唯一索引不动 —— 一个用户一道题只存一份。
- 套级 55% 拦截仍跨用户的所有套比较，不按题库切分。

理由：整套拦截的地基是「按 `setId` 取回整套题算重复率」。要按题库切分，得把判重改成「同库内比」或「跨库比」，两者的重复率口径都会变，现有 e2e 里锁死的那套契约（24 道两两不同、窄池整套被判重拦下）要重写。

代价说在明处：同一道题不会在两个题库里各存一份。用户把「字节跳动」的题删掉，「腾讯」库里那份也一起没了 —— 因为库里本来就只有一份。

---

## 5. 页面结构

### 5.1 题库页（`/questions`）

```
我的题库                                     [＋ 新建题库] [再押一套]
每押一次题就是一套…

来源简历 ▾ | 分类 ▾ | 难度 ▾ | □仅看收藏 | 关键词 [筛选]

▶ 字节跳动 · 后端          3 套 · 36 题          [重命名] [删除]
▶ 腾讯 · 前端              1 套 · 12 题          [重命名] [删除]
```

题库块**默认折叠**，展开后里面是套，套也**默认折叠**：

```
▶ 字节跳动 · 后端          3 套 · 36 题
  ▶ 11-01 · 示例简历 · 12 题 · DeepSeek      [删掉这套]
  ▶ 11-05 · 另一份简历 · 12 题 · DeepSeek
```

再点套才出题卡（复用现有的 `QuestionCard`，答案本身仍是折叠的 disclosure）。

### 5.2 折叠状态的两个来源

| 情况 | 展开谁 |
|---|---|
| 无筛选条件 | 全折叠（默认口径） |
| 有筛选条件 | 自动展开**有命中题**的题库与套 |

筛选完却看不见命中的题，等于没筛。

筛选条件变化时重置手动折叠状态 —— 用户改筛选后，上一轮手动展开的块不再保留，避免"我明明关掉了它又自己开了"。

### 5.3 题库管理操作（完整清单）

| 操作 | 入口 | 行为 |
|---|---|---|
| 新建题库 | 题库页顶部「＋ 新建题库」；押题确认层里也有「＋ 新建题库」 | 输入名字 → 建好 → 题库页自动展开新库 |
| 重命名 | 题库块头「重命名」 | 原地改成新名字；重名报 409 并提示 |
| 删除 | 题库块头「删除」 | 二次确认报「会删掉 N 套 M 题」→ 确认后连同套和题一起删 |
| 选择 | 押题确认层「保存到」下拉 | 决定这一套进哪个库 |

「默认题库」（`isDefault = true`）**可以重命名，不能删除** —— 它是用户的兜底容器，删了历史套就没地方去了。

### 5.4 空状态

用户一个题库都没有、也没押过题时，题库页给「还没有题库」+「新建一个 / 去押一套」两个入口（不是现在的「题库还是空的」）。

---

## 6. 押题页：确认时选库

结果页「确认入库题库」→ 二次确认层里多一个「保存到」下拉：

```
保存到：[ 字节跳动 · 后端        ▾ ]  [＋ 新建题库]
12 题入库 / 跳过 0 题重复
```

- 下拉列出该用户的所有题库
- 下拉里带「＋ 新建题库」，选中后展开成输入框，输入即建并选中
- **一个题库都没有时**，下拉显示「默认题库（自动创建）」，确认即建
- 默认选中：最近更新的那个题库

---

## 7. 接口契约

### `GET /api/question-collections`

```json
{ "collections": [ { "id", "name", "isDefault", "setCount", "questionCount", "createdAt" } ] }
```

### `POST /api/question-collections`

请求体 `{ "name": "字节跳动" }` → `201 { "collection": {...} }`；重名 → `409 { "error": "duplicate_name" }`。

### `PATCH /api/question-collections/[id]`

请求体 `{ "name": "新名字" }` → `200 { "collection": {...} }`；不存在/非本人 → `404`/`403`；重名 → `409`。

### `DELETE /api/question-collections/[id]`

→ `200 { "ok": true, "deletedSets": N, "deletedQuestions": M }`；`isDefault` 的 → `409 { "error": "default_collection" }`。

### `GET /api/questions`（扩展）

返回 `{ items, total, sets, collections }`：

- `sets` 每项增加 `collectionId`
- `collections` = 该用户的所有题库（含 `setCount` / `questionCount`）

### `POST /api/interview/[jobId]/confirm`（扩展）

请求体增加 `collectionId?: string`。

- 给了 → 入库到该库；不存在或不属于该用户 → `404`/`403`
- 没给 → 用该用户**最近更新的题库**；一个都没有 → 自动建「默认题库」再用

幂等不变：任务记着上次入库的套 id，重复确认直接返回那次的结果。

### 仓储层新增

```ts
listCollectionsByUser(userId)            // 按最近更新倒序
createCollection(userId, name)           // 重名抛 DuplicateNameError
renameCollection(id, userId, name)
deleteCollection(id, userId)             // 连同套与题；返回删掉几套几题
ensureDefaultCollection(userId)          // 没有就建一个「默认题库」；有则返回最近更新的
saveQuestionSet({ ..., collectionId })    // 新增必填字段
```

---

## 8. 错误处理

| 场景 | 表现 |
|---|---|
| 建题库重名 | 409 + 「已经有同名题库了」 |
| 删默认题库 | 409 + 「默认题库不能删」 |
| confirm 传了别人的题库 id | 403 |
| confirm 传了不存在的题库 id | 404 |
| 题库页接口失败 | 顶部红条「题库没拉下来，稍后再试一次」（沿用现有写法） |

题库不存在时的兜底：**服务端不猜** —— 传了错 id 就报错，让用户重新选；只有完全没传 `collectionId` 才走「最近更新的 / 自动建默认」。

---

## 9. 测试

### 单测（vitest）

- 题库块默认折叠：DOM 里没有题卡
- 展开题库 → 出现套；展开套 → 出现题卡
- 有筛选条件时命中块自动展开
- 新建题库 → 回写接口并自动展开
- 重命名 → 回写
- 删除 → 二次确认报「会删 N 套 M 题」→ 确认后块消失
- confirm 带 `collectionId` → 套落到该题库下
- confirm 不带 → 落到最近更新的题库
- 一个题库都没有时 confirm → 自动建默认题库

### 端到端（Playwright）

- 押题 → 确认层选「字节跳动」→ 入库 → 题库页里那套在「字节跳动」下
- 新建题库 → 选它入库 → 题库页出现两个题库
- 旧库升级后历史套出现在「默认题库」里

### 迁移

在旧库副本上跑迁移，核对历史套的 `collectionId` 全部指向「默认题库」。

---

## 10. 明确不做

- 题库排序拖拽
- 题库跨用户分享
- 同一道题在多个题库里各存一份
- 题库的题目级"移库"操作（只做整库删除与整库归置）
