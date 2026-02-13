-- CreateTable
CREATE TABLE "generation_states" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "auto_segment" INTEGER,
    "blueprint_id" TEXT,
    "component_html" JSONB,
    "shared_styles" JSONB,
    "completed_pages" JSONB,
    "page_statuses" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generation_states_conversation_id_key" ON "generation_states"("conversation_id");

-- AddForeignKey
ALTER TABLE "generation_states" ADD CONSTRAINT "generation_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
