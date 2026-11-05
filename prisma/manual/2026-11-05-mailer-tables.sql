-- Applied to production on 5 Nov 2026, before merging PR #11 (equivalent to
-- pnpm prisma db push for the Mailer tables, plus RLS and no Data API rights
-- to match prisma/manual/2026-11-04-revoke-data-api-grants.sql).
-- The worker's pg_cron job (cue-mailer) was created the same day; its SQL is in docs/mailer.md.
-- Not safe to re-run as-is: the CREATE statements fail once the tables exist.

-- Mailer tables (PR #11), applied 5 Nov 2026. Additive only.
BEGIN;
-- CreateEnum
CREATE TYPE "MailerCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MailerAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT,
    "apiKey" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "perMinute" INTEGER NOT NULL DEFAULT 60,
    "perDay" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailerContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fields" JSONB,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailerSuppression" (
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "campaignId" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailerSuppression_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "MailerTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailerTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailerCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "status" "MailerCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailerCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailerSend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "vars" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailerSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailerAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailerSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "footerName" TEXT NOT NULL DEFAULT 'Cue',
    "footerAddress" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailerAccount_name_key" ON "MailerAccount"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MailerContact_email_key" ON "MailerContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MailerTemplate_name_key" ON "MailerTemplate"("name");

-- CreateIndex
CREATE INDEX "MailerCampaign_status_scheduledAt_idx" ON "MailerCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailerSend_providerMessageId_key" ON "MailerSend"("providerMessageId");

-- CreateIndex
CREATE INDEX "MailerSend_campaignId_status_idx" ON "MailerSend"("campaignId", "status");

-- CreateIndex
CREATE INDEX "MailerSend_status_nextAttemptAt_idx" ON "MailerSend"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailerSend_campaignId_email_key" ON "MailerSend"("campaignId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MailerAsset_storageKey_key" ON "MailerAsset"("storageKey");

-- AddForeignKey
ALTER TABLE "MailerCampaign" ADD CONSTRAINT "MailerCampaign_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailerSend" ADD CONSTRAINT "MailerSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MailerCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailerSend" ADD CONSTRAINT "MailerSend_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MailerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Match the rest of the database: RLS on, no rights for the Data API roles.
ALTER TABLE "MailerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailerContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailerSuppression" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailerTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailerCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailerSend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailerAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailerSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MailerAccount" FROM anon, authenticated;
REVOKE ALL ON TABLE "MailerContact" FROM anon, authenticated;
REVOKE ALL ON TABLE "MailerSuppression" FROM anon, authenticated;
REVOKE ALL ON TABLE "MailerTemplate" FROM anon, authenticated;
REVOKE ALL ON TABLE "MailerCampaign" FROM anon, authenticated;
REVOKE ALL ON TABLE "MailerSend" FROM anon, authenticated;
REVOKE ALL ON TABLE "MailerAsset" FROM anon, authenticated;
REVOKE ALL ON TABLE "MailerSettings" FROM anon, authenticated;
COMMIT;
