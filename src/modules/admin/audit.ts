import { AdminAuditAction, Prisma } from '@/generated/prisma/client';

export type AdminAuditInput = {
  action: AdminAuditAction;
  githubId: string;
  metadata?: Prisma.InputJsonValue;
  success?: boolean;
  summary: string;
  targetId?: string | null;
  targetType: 'note' | 'photo';
};

// Prisma Accelerate wraps transaction clients with extension-specific generic
// delegates. This is the exact transaction capability the audit module needs,
// and both generated and extended transaction clients satisfy it.
export type AdminAuditTransactionClient = {
  adminAuditLog: {
    create(args: {
      data: Prisma.AdminAuditLogCreateInput;
    }): PromiseLike<unknown>;
  };
};

export async function writeAdminAudit(
  transaction: AdminAuditTransactionClient,
  {
    action,
    githubId,
    metadata,
    success = true,
    summary,
    targetId,
    targetType,
  }: AdminAuditInput,
) {
  await transaction.adminAuditLog.create({
    data: {
      action,
      githubId,
      metadata,
      success,
      summary,
      targetId,
      targetType,
    },
  });
}
