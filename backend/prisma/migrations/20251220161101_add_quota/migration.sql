-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "publicKey" TEXT,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),
    "oauthProvider" TEXT,
    "email" TEXT,
    "registrationSponsored" BOOLEAN NOT NULL DEFAULT false,
    "uploadsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "revokesThisMonth" INTEGER NOT NULL DEFAULT 0,
    "quotaResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasSelfWallet" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivedRequest" (
    "id" TEXT NOT NULL,
    "userAddress" VARCHAR(42) NOT NULL,
    "requestId" VARCHAR(66) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivedRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordMetadata" (
    "id" TEXT NOT NULL,
    "cidHash" VARCHAR(66) NOT NULL,
    "ownerAddress" VARCHAR(42) NOT NULL,
    "recordTypeHash" VARCHAR(66),
    "createdBy" VARCHAR(42) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyShare" (
    "id" TEXT NOT NULL,
    "cidHash" VARCHAR(66) NOT NULL,
    "senderAddress" VARCHAR(42) NOT NULL,
    "recipientAddress" VARCHAR(42) NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "KeyShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "cidHash" VARCHAR(66) NOT NULL,
    "accessorAddress" VARCHAR(42) NOT NULL,
    "action" TEXT NOT NULL,
    "consentVerified" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ArchivedRequest_userAddress_idx" ON "ArchivedRequest"("userAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedRequest_userAddress_requestId_key" ON "ArchivedRequest"("userAddress", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordMetadata_cidHash_key" ON "RecordMetadata"("cidHash");

-- CreateIndex
CREATE INDEX "KeyShare_recipientAddress_status_idx" ON "KeyShare"("recipientAddress", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KeyShare_cidHash_senderAddress_recipientAddress_key" ON "KeyShare"("cidHash", "senderAddress", "recipientAddress");

-- CreateIndex
CREATE INDEX "AccessLog_cidHash_idx" ON "AccessLog"("cidHash");

-- CreateIndex
CREATE INDEX "AccessLog_accessorAddress_idx" ON "AccessLog"("accessorAddress");

-- AddForeignKey
ALTER TABLE "ArchivedRequest" ADD CONSTRAINT "ArchivedRequest_userAddress_fkey" FOREIGN KEY ("userAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordMetadata" ADD CONSTRAINT "RecordMetadata_ownerAddress_fkey" FOREIGN KEY ("ownerAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordMetadata" ADD CONSTRAINT "RecordMetadata_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyShare" ADD CONSTRAINT "KeyShare_cidHash_fkey" FOREIGN KEY ("cidHash") REFERENCES "RecordMetadata"("cidHash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyShare" ADD CONSTRAINT "KeyShare_senderAddress_fkey" FOREIGN KEY ("senderAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyShare" ADD CONSTRAINT "KeyShare_recipientAddress_fkey" FOREIGN KEY ("recipientAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_accessorAddress_fkey" FOREIGN KEY ("accessorAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;
