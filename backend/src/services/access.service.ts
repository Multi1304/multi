import { prisma } from '../prisma';
import { logger } from '../utils/logger';

export type Permission = 'READ' | 'WRITE' | 'EXECUTE';
export type ResourceType = 'profile' | 'flow';

export class AccessService {
  /**
   * Check if a user has access to a resource.
   * Admins have full access to everything in their tenant.
   * Owners (creators) have full access to their resources.
   */
  static async canAccess(
    userId: string,
    tenantId: string,
    role: string,
    resourceType: ResourceType,
    resourceId: string,
    permission: Permission
  ): Promise<boolean> {
    // Admin bypass
    if (role === 'ADMIN') return true;

    // Check ownership
    const resource = await this.getResource(resourceType, resourceId);
    if (!resource) return false;
    
    if (resource.tenantId !== tenantId) {
      logger.warn('Resource tenant mismatch', { userId, tenantId, resourceId, resourceTenant: resource.tenantId });
      return false;
    }

    if (resource.userId === userId) return true;

    // Check explicit ACL
    const acl = await (prisma as any).accessControl.findFirst({
      where: {
        userId,
        tenantId,
        resourceType,
        resourceId,
        permission: { in: [permission, 'WRITE'] } // WRITE implies READ and EXECUTE usually
      }
    });

    return !!acl;
  }

  static async getEffectivePermissions(
    userId: string,
    tenantId: string,
    role: string,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<Permission[]> {
    if (role === 'ADMIN') return ['READ', 'WRITE', 'EXECUTE'];

    const resource = await this.getResource(resourceType, resourceId);
    if (!resource || resource.tenantId !== tenantId) return [];
    if (resource.userId === userId) return ['READ', 'WRITE', 'EXECUTE'];

    const grants = await (prisma as any).accessControl.findMany({
      where: {
        tenantId,
        userId,
        resourceType,
        resourceId,
      },
      select: { permission: true }
    });

    const permissions = new Set<Permission>();
    grants.forEach((grant: any) => {
      if (grant.permission === 'WRITE') {
        permissions.add('WRITE');
        permissions.add('READ');
        permissions.add('EXECUTE');
      } else if (grant.permission === 'EXECUTE') {
        permissions.add('EXECUTE');
        permissions.add('READ');
      } else if (grant.permission === 'READ') {
        permissions.add('READ');
      }
    });

    return Array.from(permissions);
  }

  /**
   * Grant access to a user (RWX permissions)
   */
  static async grantAccess(
    granterId: string,
    targetUserId: string,
    tenantId: string,
    resourceType: ResourceType,
    resourceId: string,
    permission: Permission
  ) {
    // Upsert the specific ACL rule for the target user
    return await (prisma as any).accessControl.upsert({
      where: {
        id: `${targetUserId}-${resourceType}-${resourceId}-${permission}` // Pseudo-ID for this logic if UUID not used
      },
      update: { permission },
      create: {
        userId: targetUserId,
        tenantId,
        resourceType,
        resourceId,
        permission
      }
    }).catch(async () => {
       // Fallback for V2 schema where id is auto-increment or uuid
       return await (prisma as any).accessControl.create({
         data: {
           userId: targetUserId,
           tenantId,
           resourceType,
           resourceId,
           permission
         }
       });
    });
  }

  static async listResourceAccess(
    tenantId: string,
    resourceType: ResourceType,
    resourceId: string
  ) {
    return await (prisma as any).accessControl.findMany({
      where: {
        tenantId,
        resourceType,
        resourceId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          }
        }
      },
      orderBy: [{ permission: 'asc' }, { createdAt: 'desc' }]
    });
  }

  static async getTenantAclSummary(tenantId: string) {
    const [totals, byResourceType, byPermission] = await Promise.all([
      (prisma as any).accessControl.count({ where: { tenantId } }),
      prisma.accessControl.groupBy({
        by: ['resourceType'],
        where: { tenantId },
        _count: { resourceType: true }
      }),
      prisma.accessControl.groupBy({
        by: ['permission'],
        where: { tenantId },
        _count: { permission: true }
      })
    ]);

    return {
      totalGrants: totals,
      byResourceType: byResourceType.map((row: any) => ({
        resourceType: row.resourceType,
        count: row._count.resourceType,
      })),
      byPermission: byPermission.map((row: any) => ({
        permission: row.permission,
        count: row._count.permission,
      })),
    };
  }

  /**
   * Revoke access from a user
   */
  static async revokeAccess(
    targetUserId: string,
    tenantId: string,
    resourceType: ResourceType,
    resourceId: string
  ) {
    return await (prisma as any).accessControl.deleteMany({
      where: {
        userId: targetUserId,
        tenantId,
        resourceType,
        resourceId
      }
    });
  }

  private static async getResource(type: string, id: string) {
    if (type === 'profile') {
      return await (prisma as any).profile.findUnique({ where: { id } });
    }
    if (type === 'flow') {
      return await (prisma as any).flow.findUnique({ where: { id } });
    }
    return null;
  }
}
