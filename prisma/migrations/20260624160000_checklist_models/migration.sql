-- CreateTable
CREATE TABLE "checklist_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "moment" TEXT,
    "scope" "ChecklistScope" NOT NULL DEFAULT 'UNIT',
    "limitTime" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_model_items" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "section" TEXT,
    "text" TEXT NOT NULL,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_model_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_models_active_order_idx" ON "checklist_models"("active", "order");

-- CreateIndex
CREATE INDEX "checklist_model_items_modelId_idx" ON "checklist_model_items"("modelId");

-- AddForeignKey
ALTER TABLE "checklist_models" ADD CONSTRAINT "checklist_models_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_model_items" ADD CONSTRAINT "checklist_model_items_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "checklist_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

