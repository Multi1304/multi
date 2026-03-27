import crypto from 'crypto';
import { prisma } from '../prisma';
import { config } from '../config';

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', config.encryption.key).update(payload).digest('hex');
}

export class AuditIntegrityService {
  static buildIntegrity(args: {
    prevHash: string | null;
    tenantId: string;
    userId: string;
    action: string;
    resource: string;
    detail: any;
    createdAt: Date;
  }) {
    const payload = [
      args.prevHash || 'root',
      args.tenantId,
      args.userId,
      args.action,
      args.resource,
      stableStringify(args.detail),
      args.createdAt.toISOString(),
    ].join('|');

    return {
      version: 'audit-chain-v1',
      prevHash: args.prevHash,
      chainHash: signPayload(payload),
      createdAt: args.createdAt.toISOString(),
    };
  }

  static async getPreviousHash(tenantId: string) {
    const latest = await prisma.auditLog.findFirst({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { detail: true },
    });

    const detail = latest?.detail as any;
    return detail?._integrity?.chainHash || null;
  }

  static attachIntegrity(detail: any, integrity: any) {
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      return { ...detail, _integrity: integrity };
    }
    return {
      value: detail ?? null,
      _integrity: integrity,
    };
  }

  static async verifyTenant(tenantId: string, limit = 200) {
    const records = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    let prevHash: string | null = null;
    let valid = 0;
    let broken = 0;
    const brokenEntries: Array<{ id: string; action: string }> = [];

    for (const record of records) {
      const detail = record.detail as any;
      const integrity = detail?._integrity;
      if (!integrity?.chainHash) {
        broken += 1;
        brokenEntries.push({ id: record.id, action: record.action });
        continue;
      }

      const normalizedDetail = detail && typeof detail === 'object' && '_integrity' in detail
        ? Object.fromEntries(Object.entries(detail).filter(([key]) => key !== '_integrity'))
        : detail;

      const recomputed = this.buildIntegrity({
        prevHash,
        tenantId: record.tenantId,
        userId: record.userId,
        action: record.action,
        resource: record.resource,
        detail: normalizedDetail,
        createdAt: record.createdAt,
      });

      if (recomputed.chainHash === integrity.chainHash) {
        valid += 1;
        prevHash = integrity.chainHash;
      } else {
        broken += 1;
        brokenEntries.push({ id: record.id, action: record.action });
      }
    }

    const exportSignature = signPayload(
      stableStringify({
        tenantId,
        total: records.length,
        valid,
        broken,
        lastHash: prevHash,
      })
    );

    return {
      tenantId,
      total: records.length,
      valid,
      broken,
      status: broken === 0 ? 'verified' : valid > 0 ? 'degraded' : 'unverified',
      lastHash: prevHash,
      exportSignature,
      brokenEntries: brokenEntries.slice(0, 20),
    };
  }
}
