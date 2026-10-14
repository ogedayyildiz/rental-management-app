-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BranchScope" AS ENUM ('ALL_BRANCHES', 'SELECTED_BRANCHES');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('TENANT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "legalName" VARCHAR(200),
    "defaultCurrency" CHAR(3) NOT NULL,
    "defaultLanguage" VARCHAR(10) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "country" CHAR(2),
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "preferredLanguage" VARCHAR(10),
    "timezone" VARCHAR(100),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issuer" VARCHAR(2048) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INACTIVE',
    "branchScope" "BranchScope" NOT NULL DEFAULT 'SELECTED_BRANCHES',
    "joinedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "templateKey" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" VARCHAR(100) NOT NULL,
    "scope" "PermissionScope" NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "organizationId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionKey" VARCHAR(100) NOT NULL,
    "permissionScope" "PermissionScope" NOT NULL DEFAULT 'TENANT',

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("organizationId","roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "MembershipRole" (
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "MembershipRole_pkey" PRIMARY KEY ("organizationId","membershipId","roleId")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBranch" (
    "organizationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "MembershipBranch_pkey" PRIMARY KEY ("organizationId","membershipId","branchId")
);

-- CreateTable
CREATE TABLE "OrganizationInvitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "invitedById" UUID NOT NULL,
    "acceptedById" UUID,
    "tokenHash" CHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "branchScope" "BranchScope" NOT NULL DEFAULT 'SELECTED_BRANCHES',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationRole" (
    "organizationId" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "InvitationRole_pkey" PRIMARY KEY ("organizationId","invitationId","roleId")
);

-- CreateTable
CREATE TABLE "InvitationBranch" (
    "organizationId" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "InvitationBranch_pkey" PRIMARY KEY ("organizationId","invitationId","branchId")
);

-- CreateTable
CREATE TABLE "PlatformAccess" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRole" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlatformRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAccessRole" (
    "accessId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "PlatformAccessRole_pkey" PRIMARY KEY ("accessId","roleId")
);

-- CreateTable
CREATE TABLE "PlatformRolePermission" (
    "roleId" UUID NOT NULL,
    "permissionKey" VARCHAR(100) NOT NULL,
    "permissionScope" "PermissionScope" NOT NULL DEFAULT 'PLATFORM',

    CONSTRAINT "PlatformRolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" UUID,
    "systemActor" VARCHAR(100),
    "action" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(100) NOT NULL,
    "targetId" VARCHAR(200) NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "AuditResult" NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "requestId" UUID NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_issuer_subject_key" ON "ExternalIdentity"("issuer", "subject");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_id_key" ON "Membership"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_id_key" ON "Role"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_scope_key" ON "Permission"("key", "scope");

-- CreateIndex
CREATE INDEX "MembershipRole_organizationId_roleId_idx" ON "MembershipRole"("organizationId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_organizationId_id_key" ON "Branch"("organizationId", "id");

-- CreateIndex
CREATE INDEX "MembershipBranch_organizationId_branchId_idx" ON "MembershipBranch"("organizationId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvitation_organizationId_email_status_idx" ON "OrganizationInvitation"("organizationId", "email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvitation_organizationId_id_key" ON "OrganizationInvitation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccess_userId_key" ON "PlatformAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRole_name_key" ON "PlatformRole"("name");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_timestamp_idx" ON "AuditEvent"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_timestamp_idx" ON "AuditEvent"("actorUserId", "timestamp");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_permissionScope_fkey" FOREIGN KEY ("permissionKey", "permissionScope") REFERENCES "Permission"("key", "scope") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRole" ADD CONSTRAINT "MembershipRole_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBranch" ADD CONSTRAINT "MembershipBranch_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBranch" ADD CONSTRAINT "MembershipBranch_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationRole" ADD CONSTRAINT "InvitationRole_organizationId_invitationId_fkey" FOREIGN KEY ("organizationId", "invitationId") REFERENCES "OrganizationInvitation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationRole" ADD CONSTRAINT "InvitationRole_organizationId_roleId_fkey" FOREIGN KEY ("organizationId", "roleId") REFERENCES "Role"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationBranch" ADD CONSTRAINT "InvitationBranch_organizationId_invitationId_fkey" FOREIGN KEY ("organizationId", "invitationId") REFERENCES "OrganizationInvitation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationBranch" ADD CONSTRAINT "InvitationBranch_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccess" ADD CONSTRAINT "PlatformAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccessRole" ADD CONSTRAINT "PlatformAccessRole_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "PlatformAccess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccessRole" ADD CONSTRAINT "PlatformAccessRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRolePermission" ADD CONSTRAINT "PlatformRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRolePermission" ADD CONSTRAINT "PlatformRolePermission_permissionKey_permissionScope_fkey" FOREIGN KEY ("permissionKey", "permissionScope") REFERENCES "Permission"("key", "scope") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
