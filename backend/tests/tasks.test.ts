import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/prisma';

describe('Tasks & Orchestration API', () => {
  const testTenant = `tasks-tenant-${Date.now()}`;
  const adminEmail = `admin@${testTenant}.com`;
  const password = 'Password123!';
  let token = '';
  let tenantId = '';
  let templateId = '';
  let batchId = '';
  let accountIds: string[] = [];
  let adminUserId = '';

  beforeAll(async () => {
    const res = await request(app).post('/auth/register').send({
      tenantName: testTenant,
      email: adminEmail,
      password,
      termsAccepted: true
    });
    token = res.body.token;
    tenantId = res.body.tenant.id;
    adminUserId = res.body.user.id;

    // Seed profile and accounts
    const profile = await prisma.profile.create({
      data: { name: 'Task Profile', tenantId, userId: adminUserId }
    });
    const acc1 = await prisma.account.create({
      data: { username: 'user1', password: 'p1', profileId: profile.id, tenantId }
    });
    const acc2 = await prisma.account.create({
      data: { username: 'user2', password: 'p2', profileId: profile.id, tenantId }
    });
    accountIds = [acc1.id, acc2.id];
  });

  afterAll(async () => {
    await prisma.jobLog.deleteMany({ where: { tenantId } });
    await prisma.session.deleteMany({ where: { user: { email: adminEmail } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.profile.deleteMany({ where: { tenantId } });
    await prisma.taskBatch.deleteMany({ where: { tenantId } });
    await prisma.taskTemplate.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('should create a new task template', async () => {
    const res = await request(app)
      .post('/tasks/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Warmup Profile',
        jobType: 'automation.warmup',
        payload: { targetUrl: 'google.com' }
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    templateId = res.body.id;
  });

  it('should list task templates', async () => {
    const res = await request(app)
      .get('/tasks/templates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should create a task batch', async () => {
    const res = await request(app)
      .post('/tasks/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        templateId,
        targetAccountIds: accountIds,
        payloadOverride: { url: 'a.com' }
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    batchId = res.body.id;
  });

  it('should fetch batch status', async () => {
    const res = await request(app)
      .get(`/tasks/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running'); // Initial state when not scheduledAt
  });

  it('should cancel a task batch', async () => {
    const res = await request(app)
      .post(`/tasks/batches/${batchId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cancelled/i);
  });
});
