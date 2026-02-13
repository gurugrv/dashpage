-- CreateTable
CREATE TABLE "blueprints" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blueprints_conversation_id_key" ON "blueprints"("conversation_id");

-- AddForeignKey
ALTER TABLE "blueprints" ADD CONSTRAINT "blueprints_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
