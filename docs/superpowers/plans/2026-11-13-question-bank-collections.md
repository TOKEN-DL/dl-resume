# 我的题库：自建分组 + 三层折叠 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「我的题库」加一层用户自建的分组（题库），押题入库时能选存到哪个库；题库页改成 **题库 › 套 › 题** 三层，两层都默认折叠。

**Architecture:** 新增 `QuestionCollection` 表，`QuestionSet` 加必填的 `collectionId` 指向它。题库是**分组视图**，不是去重边界 —— `(userId, fingerprint)` 唯一索引不动，题库只决定「这套题显示在哪个块里」。折叠状态只存在组件内存里，不进 URL；URL 上的参数仍然是筛选条件。

**Tech Stack:** Next.js 15.5.28 App Router、React 19、TypeScript、CSS Modules、Prisma(SQLite)、Vitest、Playwright

**设计文档：** `docs/superpowers/specs/2026-11-13-question-bank-collections-design.md`

## Global Constraints

- 所有 npm 命令在 `apps/web` 下执行；UI 文案与代码注释一律中文
- **判重口径不动**：一个用户一道题只存一份，题库只是分组视图
- **SQLite 不支持 `ALTER COLUMN ... SET NOT NULL`** —— 「可空 → 必填」必须拆成「手写 backfill 迁移 + Prisma 收紧约束」两步，否则重建表拷贝时撞非空约束
- `prisma generate` 前**必须停掉 dev server**（引擎 DLL 被占用 → EPERM）
- e2e 用独立端口 3110 / 独立库 `prisma/e2e.db` / 独立构建目录 `.next-e2e`
- 提交时只 `git add` 本任务涉及的文件，禁止 `git add -A`

---

### Task 1: 数据层 —— 题库表 + 历史套归位

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/20261113081040_add_question_collections/migration.sql`

**Interfaces:**
- Produces:
  - `model QuestionCollection`：`id / userId / name / isDefault / createdAt / updatedAt`，`@@unique([userId, name])`，`@@map("question_collections")`
  - `QuestionSet.collectionId String`（**必填**）+ `collection` 关系 + `@@index([collectionId])`
  - `User.questionCollections QuestionCollection[]`

- [x] **Step 1: 改 schema**

  `QuestionSet.collectionId` 必填而不是可空 —— 应用层与 DB 双保险，不留 null 分支让下游到处判空。

- [x] **Step 2: 手写迁移 A（建表 + backfill）**

  ```sql
  CREATE TABLE "question_collections" (...);
  ALTER TABLE "question_sets" ADD COLUMN "collectionId" TEXT;
  -- 给每个有套的用户建「默认题库」
  INSERT INTO "question_collections" ("id","userId","name","isDefault","createdAt","updatedAt")
  SELECT lower(hex(randomblob(16))), "userId", '默认题库', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "question_sets" GROUP BY "userId";
  -- 历史套归置进去
  UPDATE "question_sets" SET "collectionId" = (
    SELECT c."id" FROM "question_collections" c
    WHERE c."userId" = "question_sets"."userId" AND c."isDefault" = 1);
  ```

- [x] **Step 3: 迁移 B（Prisma 生成）把 `collectionId` 收紧为必填**

  此时数据已全部有值，重建表拷贝不会撞非空约束。

- [x] **Step 4: 实测迁移**

  `prisma migrate dev` 跑在 dev.db 副本上，核对：两个用户各自动获得 1 个「默认题库」，历史套全部归位（admin 24 题 / 2374041800@qq.com 24 题）。

---

### Task 2: 仓储层 —— 题库 CRUD + 套入库带归属

**Files:**
- Create: `apps/web/src/lib/interview/collections-repo.ts`
- Create: `apps/web/src/lib/interview/collections-repo.test.ts`
- Modify: `apps/web/src/lib/interview/repo.ts`、`repo.test.ts`、`runner.test.ts`
- Modify: `apps/web/scripts/seed-questions.ts`

**Interfaces:**
- Produces（`collections-repo.ts`）：
  - `listCollectionsByUser(userId)` —— 按最近更新倒序
  - `createCollection(userId, name, isDefault?)` —— 重名抛 `DuplicateCollectionNameError`
  - `renameCollection(id, userId, name)` —— 不属于本人返回 `null`
  - `deleteCollection(id, userId)` —— 连同套与题一起删，返回 `{ deletedSets, deletedQuestions }`；默认题库返回 `null`
  - `resolveTargetCollection(userId)` —— 有库取最近更新的，没有就建「默认题库」
  - `getCollection(id, userId)`、`countCollectionContents(id, userId)`
  - `DEFAULT_COLLECTION_NAME = "默认题库"`
- Produces（`repo.ts`）：`QuestionSetRow.collectionId`、`SaveQuestionSetInput.collectionId`（必填）、`listQuestionSetsByUserWithCounts(userId)`

- [x] **Step 1: 写仓储层失败测试**（15 个用例）

  重点盯：重名抛业务错误、删默认题库返回 `null`、删题库连同套与题、`resolveTargetCollection` 的兜底建库。

- [x] **Step 2: 实现仓储层，测试转绿**

  删除是**显式删子再删父**（先删题、再删套、最后删库），沿用 `deleteQuestionSet` 的既有风格 —— 行为不依赖 FK 级联在当前连接上是否生效。

- [x] **Step 3: `saveQuestionSet` 带上 `collectionId`**

  `repo.test.ts` 补一个「写入整套时带上题库归属」的用例；`runner.test.ts` 的 `QuestionSetRow` 夹具补 `collectionId`；`seed-questions.ts` 用 `resolveTargetCollection` 拿落点。

---

### Task 3: 接口层 —— 题库 CRUD + 入库选题库

**Files:**
- Create: `apps/web/src/app/api/question-collections/route.ts` + `route.test.ts`
- Create: `apps/web/src/app/api/question-collections/[id]/route.ts` + `route.test.ts`
- Modify: `apps/web/src/app/api/questions/route.ts` + `route.test.ts`
- Modify: `apps/web/src/app/api/interview/[jobId]/confirm/route.ts` + `route.test.ts`

**Interfaces:**
- `GET /api/question-collections` → `{ collections: [{ id, name, isDefault, setCount, questionCount, createdAt }] }`
- `POST /api/question-collections` `{ name }` → `201 { collection }`；重名 → `409 { error: "duplicate_name" }`
- `PATCH /api/question-collections/[id]` `{ name }` → `200 { collection }`；非本人 `403` / 不存在 `404` / 重名 `409`
- `DELETE /api/question-collections/[id]` → `200 { ok: true, deletedSets, deletedQuestions }`；默认题库 → `409 { error: "default_collection" }`
- `GET /api/questions` → `{ items, total, sets, collections }`，`sets` 每项带 `collectionId`
- `POST /api/interview/[jobId]/confirm` 请求体加 `collectionId?: string`

- [x] **Step 1: 写 `[id]` 路由的失败测试**

  盯五件事：未登录 401 不碰仓储层、别人的库 403 与不存在的 404 **要分得开**、重名 409、默认题库删不掉 409、删题库报删了几套几题。

- [x] **Step 2: 实现 `[id]` 路由**

  403/404 的区分靠一次**只读探测**：`prisma.questionCollection.findUnique({ select: { userId: true } })` —— 只取 userId，不取内容，别人的题库一个字都不泄。

- [x] **Step 3: 扩展 `/api/questions`**

  改用 `listQuestionSetsByUserWithCounts`（带 `collectionId` 与套内题数），题库块头的「N 套 · M 题」按**全量**算，不是当前筛选命中数。

- [x] **Step 4: 扩展 confirm 接口**

  - 给了 `collectionId` → 校验归属（不存在 404 / 非本人 403），入库到该库
  - 没给 → `resolveTargetCollection`（最近更新的 / 自动建默认）
  - **题库解析放在 preview 之后** —— 预览是「只算不写」，不该顺手把默认题库建出来

---

### Task 4: 页面层 —— 题库块 + 三层折叠

**Files:**
- Modify: `apps/web/src/components/questions/question-bank.tsx`、`question-bank.test.tsx`
- Modify: `apps/web/src/components/questions/questions.module.css`

**Interfaces:**
- Consumes: `GET /api/questions` 的 `collections`；`POST/PATCH/DELETE /api/question-collections[/:id]`
- Produces: 三层折叠结构 + 题库管理操作

- [x] **Step 1: 写失败测试**（27 个用例）

  盯九件事：题库默认折叠、展开题库才见套、展开套才见题卡、`aria-expanded` 状态、有筛选时命中块自动展开、筛选变化重置手动折叠、套头四要素、收藏回写、删单题/删整套/删题库、新建与重命名题库、默认题库不能删。

- [x] **Step 2: 实现三层折叠**

  折叠状态是**三态**：`true`=手动展开、`false`=手动收起、没有这个键=听自动口径的。

  ```
  isCollectionOpen(id) = openCollections[id] ?? (hasFilter && hitCollections.has(id))
  isSetOpen(id)        = openSets[id]        ?? (hasFilter && hitSets.has(id))
  ```

  筛选条件一变就重置两个手动状态表（`filterKey` 变化时 effect 重置）—— 用户改完筛选，上一轮手动展开的块不再保留。

- [x] **Step 3: 实现题库管理**

  - 新建：页头「＋ 新建题库」→ 行内输入 → 建好**自动展开新库**
  - 重命名：块头「重命名」→ 行内输入 → 回写
  - 删除：块头「删除」→ 行内二次确认报「会删掉 N 套 M 题」→ 确认后连同套与题一起删
  - 默认题库（`isDefault`）：给「默认题库不能删」的提示，不给删除按钮

---

### Task 5: 押题页 —— 确认层加「保存到」

**Files:**
- Modify: `apps/web/src/components/interview/interview-workspace.tsx`、`interview-workspace.test.tsx`
- Modify: `apps/web/src/components/interview/interview.module.css`

**Interfaces:**
- Consumes: `GET /api/question-collections`、`POST /api/question-collections`
- Produces: 确认层的「保存到」下拉 + 「＋ 新建题库」

- [x] **Step 1: 写失败测试**（5 个用例）

  下拉列出题库、默认选中最近更新的那个、换选后 `collectionId` 跟着递上去、一个题库都没有时显示「默认题库(自动创建)」且不递 id、「＋ 新建题库」建好即选中。

- [x] **Step 2: 实现确认层**

  打开确认层时拉一次题库列表；默认选中最近更新的那个（接口按最近更新倒序给）；一个都没有时下拉显示「默认题库(自动创建)」，确认时**不带** `collectionId`，服务端自己建。

---

### Task 6: 验证

- [x] **Step 1: 类型检查 + 全量单测**

  `npx tsc --noEmit` 无输出；`npm test` 55 个文件 724 个用例全绿。

- [x] **Step 2: e2e 跟着三层结构改**

  题卡默认不在 DOM 里 → 加 `openBank(page)` 助手（按标题层级找折叠按钮：题库名在 `h2`、套名在 `h3`），在数题卡前先展开；筛选清空后折叠状态重置，也要重新展开。

  新增「题库自建分组」一组用例：新建题库 → 出现第二个题库 → 默认题库删不掉 → 押题时选「保存到」新建的题库 → 这一套真的落在它下面。

- [x] **Step 3: 迁移实测**

  e2e 库重建时新迁移正常应用；dev.db 副本上历史套全部归位到「默认题库」。

- [x] **Step 4: 重启 dev server（3002）**
