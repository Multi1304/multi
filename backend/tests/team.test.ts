import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/prisma';
import { signToken } from '../src/utils/auth';

describe('Team Management API', () => {
  const testTenant = `team-tenant-${Date.now()}`;
  const adminEmail = `admin@${testTenant}.com`;
  const userEmail = `user@${testTenant}.com`;
  const password = 'Password123!';
  
  let adminToken = '';
  let userToken = '';
  let baseUserId = '';
  let tenantId = '';

  beforeAll(async () => {
    // Register Admin
    const adminRes = await request(app).post('/auth/register').send({
      tenantName: testTenant,
      email: adminEmail,
      password,
      termsAccepted: true
    });
    adminToken = adminRes.body.token;
    tenantId = adminRes.body.tenant.id;

    // Register User (same tenant, simulated via invite logic ideally, but we'll mock it here by setting tenantId)
    // For test simplicity we'll just test the invite endpoint and role checks
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: { in: [adminEmail, userEmail, `invited@${testTenant}.com`] } } } });
    await prisma.invitation.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, userEmail, `invited@${testTenant}.com`] } } });
    await prisma.tenant.deleteMany({ where: { name: testTenant } });
  });

  it('should allow ADMIN to list team members', async () => {
    const res = await request(app)
      .get('/team')
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].email).toBe(adminEmail);
  });

  it('should allow ADMIN to invite a new user', async () => {
    const res = await request(app)
      .post('/team/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `invited@${testTenant}.com`, role: 'USER', password: 'Password123!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('invitationId');
  });

  it('should deny USER from inviting new users (RBAC check)', async () => {
    const standardUser = await prisma.user.create({
      data: {
        email: userEmail,
        password: 'hashed', // doesn't matter for this unit
        role: 'USER',
        tenantId,
      }
    });
    baseUserId = standardUser.id;
    userToken = signToken({ userId: standardUser.id, tenantId, role: 'USER' });

    const res = await request(app)
      .post('/team/invite')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ email: `blocked@${testTenant}.com`, role: 'USER', password: 'Password123!' });

    expect(res.status).toBe(403);
  });

  it('should update user role (ADMIN only)', async () => {
    const res = await request(app)
      .put(`/team/${baseUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'MANAGER' });

    expect(res.status).toBe(200);
  });
});
