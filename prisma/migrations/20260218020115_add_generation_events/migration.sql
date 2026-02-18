-- DropIndex
DROP INDEX "messages_conversation_finish_unique";

-- CreateTable
CREATE TABLE "generation_events" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "scope" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "finish_reason" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL,
    "tool_call_count" INTEGER NOT NULL DEFAULT 0,
    "has_file_output" BOOLEAN NOT NULL DEFAULT false,
    "repair_triggered" BOOLEAN NOT NULL DEFAULT false,
    "text_fallback" BOOLEAN NOT NULL DEFAULT false,
    "cost_usd" DOUBLE PRECISION,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_events_conversation_id_idx" ON "generation_events"("conversation_id");

-- CreateIndex
CREATE INDEX "generation_events_provider_model_idx" ON "generation_events"("provider", "model");

-- CreateIndex
CREATE INDEX "generation_events_created_at_idx" ON "generation_events"("created_at");
