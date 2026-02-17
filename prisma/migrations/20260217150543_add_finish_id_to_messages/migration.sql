-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "finish_id" TEXT;

-- CreateIndex
CREATE INDEX "messages_conversation_id_finish_id_idx" ON "messages"("conversation_id", "finish_id");

-- Partial unique index for idempotency (not expressible in Prisma schema)
CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversation_finish_unique" ON "messages" ("conversation_id", "finish_id") WHERE "finish_id" IS NOT NULL;
