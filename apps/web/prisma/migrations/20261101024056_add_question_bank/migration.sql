-- CreateTable
CREATE TABLE "question_sets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT,
    "resumeTitle" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "question_sets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "question_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "resumeId" TEXT,
    "resumeTitle" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "question_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "question_items_setId_fkey" FOREIGN KEY ("setId") REFERENCES "question_sets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "question_sets_userId_createdAt_idx" ON "question_sets"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "question_items_userId_createdAt_idx" ON "question_items"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "question_items_userId_starred_idx" ON "question_items"("userId", "starred");

-- CreateIndex
CREATE UNIQUE INDEX "question_items_userId_fingerprint_key" ON "question_items"("userId", "fingerprint");
