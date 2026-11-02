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

export async function writeAdminAudit(
  transaction: Prisma.TransactionClient,
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
