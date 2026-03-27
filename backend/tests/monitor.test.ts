import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/prisma';

describe('Monitor & LiveOps API', () => {
  const testTenant = `monitor-tenant-${Date.now()}`;
  const adminEmail = `admin@${testTenant}.com`;
  const password = 'Password123!';
  let token = '';

  beforeAll(async () => {
    const res = await request(app).post('/auth/register').send({
      tenantName: testTenant,
      email: adminEmail,
      password,
      termsAccepted: true
    });
    token = res.body.token;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: adminEmail } } });
    await prisma.user.deleteMany({ where: { email: adminEmail } });
    await prisma.tenant.deleteMany({ where: { name: testTenant } });
  });

  it.skip('should return a 200 on SSE stream endpoint startup (Headers check)', () => {
    // Skipped: Supertest lacks native support for asserting ongoing stream headers without hanging.
  });

  it('should fetch the monitor dashboard snapshot', async () => {
    const res = await request(app)
      .get('/monitor/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.workers).toBeDefined();
    expect(res.body.recentEvents).toBeDefined();
  });
});
