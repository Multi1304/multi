import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';

export interface AppNotification {
  id: string;
  tenantId: string;
  kind: 'security' | 'profile' | 'launch' | 'account' | 'system';
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
  read: boolean;
}

export class NotificationCenterService {
  static async list(tenantId: string, limit = 20) {
    const items = await this.read(tenantId);
    return items.slice(0, limit);
  }

  static async push(tenantId: string, notification: Omit<AppNotification, 'id' | 'tenantId' | 'createdAt' | 'read'>) {
    const items = await this.read(tenantId);
    const next: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      createdAt: new Date().toISOString(),
      read: false,
      ...notification,
    };
    const merged = [next, ...items].slice(0, 100);
    await this.write(tenantId, merged);
    return next;
  }

  static async markRead(tenantId: string, id: string) {
    const items = await this.read(tenantId);
    await this.write(
      tenantId,
      items.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  }

  private static filePath(tenantId: string) {
    return path.resolve(config.profileStateDir, 'notifications', `${tenantId}.json`);
  }

  private static async read(tenantId: string): Promise<AppNotification[]> {
    try {
      return await fs.readJson(this.filePath(tenantId));
    } catch {
      return [];
    }
  }

  private static async write(tenantId: string, items: AppNotification[]) {
    await fs.ensureDir(path.dirname(this.filePath(tenantId)));
    await fs.writeJson(this.filePath(tenantId), items, { spaces: 2 });
  }
}
