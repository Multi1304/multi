import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/prisma';

describe('Compliance & Security API', () => {
  const testTenant = `compliance-tenant-${Date.now()}`;
  const adminEmail = `admin@${testTenant}.com`;
  const password = 'Password123!';
  let token = '';
  let tenantId = '';

  beforeAll(async () => {
    const res = await request(app).post('/auth/register').send({
      tenantName: testTenant,
      email: adminEmail,
      password,
      termsAccepted: true
    });
    token = res.body.token;
    if (!res.body.tenant) throw new Error(`Registration failed: ${res.status} ${JSON.stringify(res.body)}`);
    tenantId = res.body.tenant.id;
  });

  afterAll(async () => {
    // Reset Kill Switch just in case test failed halfway
    await prisma.featureFlag.deleteMany({
      where: { tenantId: null as any, key: 'platform.enabled' }
    });
    await prisma.featureFlag.create({
      data: { tenantId: null as any, key: 'platform.enabled', enabled: true }
    });

    // Cleanup all audit logs first
    await prisma.auditLog.deleteMany({
      where: { OR: [{ tenantId }, { tenant: { name: { contains: 'dummy-suspend' } } }] }
    });

    await prisma.session.deleteMany({
      where: { user: { OR: [{ tenantId }, { tenant: { name: { contains: 'dummy-suspend' } } }] } }
    });
    
    // Cleanup users
    await prisma.user.deleteMany({
      where: { OR: [{ tenantId }, { tenant: { name: { contains: 'dummy-suspend' } } }] }
    });

    // Cleanup flags
    await prisma.featureFlag.deleteMany({
      where: { OR: [{ tenantId }, { tenant: { name: { contains: 'dummy-suspend' } } }] }
    });

    // Cleanup tenants
    await prisma.tenant.deleteMany({
      where: { OR: [{ id: tenantId }, { name: { contains: 'dummy-suspend' } }] }
    });
  });

  it('should list feature flags (Admin)', async () => {
    const res = await request(app)
      .get('/admin/flags')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should create a tenant-specific feature flag', async () => {
    const res = await request(app)
      .post('/admin/flags')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tenantId,
        key: 'feature.special.enabled',
        enabled: true
      });

    expect(res.status).toBe(201);
    expect(res.body.key).toBe('feature.special.enabled');
  });

  it('should toggle a tenant suspension lock', async () => {
    // Register a new tenant specifically for this test
    const dummyTenantName = `dummy-suspend-${Date.now()}`;
    const dummyEmail = `dummy@${dummyTenantName}.com`;
    const regRes = await request(app).post('/auth/register').send({
      tenantName: dummyTenantName,
      email: dummyEmail,
      password: 'Password123!',
      termsAccepted: true
    });
    
    if (regRes.status !== 201) {
      throw new Error(`Registration for dummy tenant failed: ${regRes.status} ${JSON.stringify(regRes.body)}`);
    }
    const dummyToken = regRes.body.token;
    const dummyTenantId = regRes.body.tenant.id;

    const res = await request(app)
      .post(`/admin/tenants/${dummyTenantId}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .send({ suspended: true });

    expect(res.status).toBe(200);
    expect(res.body.tenant.suspended).toBe(true);

    // Verify it blocks access for the user of THAT tenant
    const blockedRes = await request(app)
      .get('/profiles')
      .set('Authorization', `Bearer ${dummyToken}`);

    expect(blockedRes.status).toBe(403);
    
    // Unsuspend
    await request(app)
      .post(`/admin/tenants/${dummyTenantId}/suspend`)
      .set('Authorization', `Bearer ${token}`)
      .send({ suspended: false });
  });

  it('should trigger the global kill switch and block traffic, then restore', async () => {
    // 1. Enable Kill Switch (disable platform)
    const killRes = await request(app)
      .post('/admin/flags')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tenantId: null,
        key: 'platform.enabled',
        enabled: false
      });

    expect(killRes.status).toBe(201);

    // 2. Test regular endpoint (should be 503)
    const blockedRes = await request(app)
      .get('/profiles')
      .set('Authorization', `Bearer ${token}`);
      
    expect(blockedRes.status).toBe(503);

    // 3. Restore Platform
    const restoreRes = await request(app)
      .post('/admin/flags')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tenantId: null,
        key: 'platform.enabled',
        enabled: true
      });

    expect(restoreRes.status).toBe(201);
  });

  it('should record an audit log for the actions', async () => {
    // Need auditor access, but ADMIN can also read their own audit logs depending on how we built it.
    const res = await request(app)
      .get('/audit')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // At least the suspension toggle and feature flag changes should be logged
    const actions = res.body.data.map((l: any) => l.action);
    expect(actions).toContain('tenant.suspend.toggle');
    expect(actions).toContain('feature_flag.change');
  });
});
