-- CreateTable
CREATE TABLE "RefItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefItem_category_idx" ON "RefItem"("category");

-- CreateIndex
CREATE UNIQUE INDEX "RefItem_category_code_key" ON "RefItem"("category", "code");
