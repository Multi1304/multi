import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/prisma';

describe('Bulk Operations API', () => {
  const testTenant = `bulk-tenant-${Date.now()}`;
  const adminEmail = `admin@${testTenant}.com`;
  const password = 'Password123!';
  let token = '';
  let tenantId = '';
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
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await prisma.session.deleteMany({ where: { user: { email: adminEmail } } });
    await prisma.accessControl.deleteMany({ where: { user: { email: adminEmail } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { tenant: { name: testTenant } },
          { user: { email: adminEmail } }
        ]
      }
    });
    await prisma.profile.deleteMany({ where: { tenant: { name: testTenant } } });
    await prisma.bulkOperation.deleteMany({ where: { tenant: { name: testTenant } } });
    await prisma.profile.deleteMany({ where: { user: { email: adminEmail } } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.tenant.deleteMany({ where: { name: testTenant } });
  });

  it('should validate bulk profile data (Dry Run)', async () => {
    const res = await request(app)
      .post('/bulk/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        profiles: [
          { name: 'Profile A' },
          { name: 'Profile B' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBeDefined();
  });

  it('should create multiple profiles in bulk', async () => {
    const res = await request(app)
      .post('/bulk/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        profiles: [
          { name: 'Bulk 1' },
          { name: 'Bulk 2' }
        ]
      });

    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/started/i);
  });

  it('should clone an existing profile N times', async () => {
    // First create a profile manually to clone
    const p = await prisma.profile.create({
      data: { tenantId, userId: adminUserId, name: 'Source Clone Target' }
    });
    const profileId = p.id;

    const res = await request(app)
      .post('/bulk/profiles/clone')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceProfileId: profileId, count: 2 });

    expect(res.status).toBe(202);
    expect(res.body.operationId).toBeDefined();
  });
});
