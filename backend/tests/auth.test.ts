import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/prisma';

describe('Authentication API', () => {
  const testTenantPrefix = `test-tenant-${Date.now()}`;
  const testEmail = `admin@${testTenantPrefix}.com`;
  const testPassword = 'Password123!';

  beforeAll(async () => {
    // Optionally clean up before running
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.session.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.tenant.deleteMany({ where: { name: testTenantPrefix } });
  });

  it('should register a new tenant and admin user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        tenantName: testTenantPrefix,
        email: testEmail,
        password: testPassword,
        termsAccepted: true,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('should prevent registering duplicate email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        tenantName: `${testTenantPrefix}-dup`,
        email: testEmail, // same email
        password: testPassword,
        termsAccepted: true,
      });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('should login successfully with correct credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(testEmail);
    expect(res.headers['set-cookie']).toBeDefined(); // Refresh cookie should be set
  });

  it('should fail login with incorrect password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
  });

  let validToken = '';
  let refreshTokenCookie = '';

  it('should authenticate user and store tokens for subsequent tests', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    
    expect(res.status).toBe(200);
    validToken = res.body.token;
    refreshTokenCookie = res.headers['set-cookie'][0];
  });

  it('should list active sessions', async () => {
    const res = await request(app)
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should rotate access token using refresh token cookie', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', refreshTokenCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should logout and revoke token', async () => {
    const res = await request(app)
      .post('/auth/logout')
      .set('Cookie', refreshTokenCookie);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
  });
});
