-- CreateTable
CREATE TABLE "question_collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "question_collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill:给**每个有套的用户**建一个「默认题库」。
--
-- 为什么要有这一步:题库这一层是这次新加的,老库里只有「套」没有「库」。
-- 直接把 collectionId 收紧成 NOT NULL 会让老套无处可去(整列拷不进非空约束),
-- 所以先给每个用户兜一个库,历史套才有地方落。
--
-- 还没有套的用户不建 —— 等他第一次押题入库时,服务端按需建。
-- id 用随机 hex:这里要的是「一批互不相同的 id」,不是 cuid 的格式。
INSERT INTO "question_collections" ("id", "userId", "name", "isDefault", "createdAt", "updatedAt")
SELECT
    lower(hex(randomblob(16))),
    "userId",
    '默认题库',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "question_sets" GROUP BY "userId";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_question_sets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "resumeId" TEXT,
    "resumeTitle" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "question_sets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "question_sets_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "question_collections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- 拷贝时顺手把历史套归置到该用户的「默认题库」——
-- 上面的 INSERT 已经给每个有套的用户建好了默认库,所以这个子查询必定有值,
-- 拷进 NOT NULL 列不会撞约束。
INSERT INTO "new_question_sets" ("createdAt", "id", "provider", "resumeId", "resumeTitle", "updatedAt", "userId", "collectionId")
SELECT
    "createdAt",
    "id",
    "provider",
    "resumeId",
    "resumeTitle",
    "updatedAt",
    "userId",
    (
        SELECT c."id" FROM "question_collections" c
        WHERE c."userId" = "question_sets"."userId" AND c."isDefault" = 1
    )
FROM "question_sets";
DROP TABLE "question_sets";
ALTER TABLE "new_question_sets" RENAME TO "question_sets";
CREATE INDEX "question_sets_userId_createdAt_idx" ON "question_sets"("userId", "createdAt");
CREATE INDEX "question_sets_collectionId_idx" ON "question_sets"("collectionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "question_collections_userId_updatedAt_idx" ON "question_collections"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "question_collections_userId_name_key" ON "question_collections"("userId", "name");
