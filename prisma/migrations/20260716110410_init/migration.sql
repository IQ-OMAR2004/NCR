-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Ncr" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slNo" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "ncrNo" INTEGER NOT NULL,
    "so" TEXT,
    "fg" TEXT,
    "prO" TEXT,
    "projectName" TEXT,
    "panelRef" TEXT,
    "panelType" TEXT,
    "itemCode" TEXT,
    "itemName" TEXT,
    "itemDescription" TEXT,
    "make" TEXT,
    "totalQty" REAL,
    "defectQty" REAL,
    "serialsJson" TEXT NOT NULL DEFAULT '[]',
    "defectDetails" TEXT,
    "defectType" TEXT,
    "ncType" TEXT,
    "cause" TEXT,
    "disposition" TEXT,
    "dispositionNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "statusChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingDate" DATETIME,
    "sapClosed" BOOLEAN NOT NULL DEFAULT false,
    "sapClosingDate" DATETIME,
    "responsiblePerson" TEXT,
    "responsibleDept" TEXT,
    "remarks" TEXT,
    "importRaw" TEXT,
    "importedLegacy" BOOLEAN NOT NULL DEFAULT false,
    "needsTriage" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ncr_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ncrId" INTEGER NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transition_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ncrId" INTEGER NOT NULL,
    "gate" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ncrId" INTEGER,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "before" TEXT,
    "after" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ncrId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ncrId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "ncrId" INTEGER,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Person" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Ncr_ncrNo_idx" ON "Ncr"("ncrNo");

-- CreateIndex
CREATE INDEX "Ncr_status_idx" ON "Ncr"("status");

-- CreateIndex
CREATE INDEX "Ncr_year_slNo_idx" ON "Ncr"("year", "slNo");

-- CreateIndex
CREATE INDEX "Ncr_make_idx" ON "Ncr"("make");

-- CreateIndex
CREATE INDEX "Ncr_projectName_idx" ON "Ncr"("projectName");

-- CreateIndex
CREATE INDEX "Ncr_panelType_idx" ON "Ncr"("panelType");

-- CreateIndex
CREATE INDEX "Ncr_date_idx" ON "Ncr"("date");

-- CreateIndex
CREATE INDEX "Transition_ncrId_idx" ON "Transition"("ncrId");

-- CreateIndex
CREATE INDEX "Approval_ncrId_idx" ON "Approval"("ncrId");

-- CreateIndex
CREATE INDEX "AuditLog_ncrId_idx" ON "AuditLog"("ncrId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Comment_ncrId_idx" ON "Comment"("ncrId");

-- CreateIndex
CREATE INDEX "Attachment_ncrId_idx" ON "Attachment"("ncrId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabItem_category_value_key" ON "VocabItem"("category", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Person_name_department_key" ON "Person"("name", "department");
