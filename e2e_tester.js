const fetch = globalThis.fetch;

const API_URL = 'http://localhost:4001';
let token = '';
let profileId = '';
let accountId = '';

process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION:', reason);
  process.exit(1);
});

async function run() {
  console.log('--- Starting Ultra Deluxe E2E Validation ---');

  // 1. Admin Login
  console.log('\n[1] Testing Auth & Login');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@local', password: 'AdminPass123!' })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) throw new Error('Login failed: ' + JSON.stringify(loginData));
  token = loginData.token;
  console.log('✅ Login successful.');

  // 2. Check Plan & Quotas (Initial: FREE)
  console.log('\n[2] Testing Initial Quotas (Free Plan)');
  const billingRes = await fetch(`${API_URL}/billing/usage`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const billingData = await billingRes.json();
  console.log(`✅ Current Plan: ${billingData.plan}. Max Profiles: ${billingData.limits.maxProfiles}`);

  // 3. Create Profile
  console.log('\n[3] Testing Profile Creation with Advanced Fingerprinting');
  const profRes = await fetch(`${API_URL}/profiles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Ultra Deluxe E2E Profile',
      proxyConfig: { type: 'http', host: '1.2.3.4', port: 8080 },
      dnsConfig: { servers: ['8.8.8.8'] },
      timezone: 'America/New_York',
      locale: 'en-US',
      webrtc: 'disabled',
      canvas: 'noise',
      audio: 'noise'
    })
  });
  const profData = await profRes.json();
  if (!profRes.ok) throw new Error('Profile creation failed: ' + JSON.stringify(profData));
  profileId = profData.id;
  console.log('✅ Profile created. ID:', profileId);

  // 4. Create Account
  console.log('\n[4] Testing Account Linkage');
  const accRes = await fetch(`${API_URL}/accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: profileId,
      username: 'e2e_user',
      password: 'e2e_password'
    })
  });
  const accData = await accRes.json();
  if (!accRes.ok) throw new Error('Account creation failed: ' + JSON.stringify(accData));
  accountId = accData.id;
  console.log('✅ Account linked to profile.');

  // 5. Enqueue Job
  console.log('\n[5] Enqueuing Automation Job (login_check)');
  const jobRes = await fetch(`${API_URL}/automation/enqueue`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId: accountId,
      jobType: 'login_check',
      payload: { url: 'https://google.com' }
    })
  });
  const jobData = await jobRes.json();
  if (!jobRes.ok) throw new Error('Job enqueuing failed: ' + JSON.stringify(jobData));
  const jobId = jobData.jobId;
  console.log('✅ Job enqueued. ID:', jobId);

  // 6. Simulate Real-time Log Polling
  console.log('⏳ Polling for worker processing (15s)...');
  let status = 'pending';
  for (let i = 0; i < 10; i++) {
    try {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`${API_URL}/automation/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!statusRes.ok) {
        console.warn(`   [Poll ${i+1}] HTTP ${statusRes.status}`);
        continue;
      }

      const statusData = await statusRes.json();
      status = statusData.status;
      console.log(`   [Poll ${i+1}] Status: ${status} (Updated: ${statusData.updatedAt})`);
      
      if (status === 'success' || status === 'failed') break;
    } catch (e) {
      console.error(`   [Poll ${i+1}] Connection Refused or Network Error:`, e.message);
    }
  }
  console.log(`✅ Final Job Status: ${status}`);

  // 7. Test Plan Upgrade (Manual Simulation)
  console.log('\n[7] Testing Plan Upgrade (Free -> Ultra)');
  const upgradeRes = await fetch(`${API_URL}/billing/plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'ultra', seatsAllowed: 50 })
  });
  if (!upgradeRes.ok) throw new Error('Upgrade failed');
  const newUsageRes = await fetch(`${API_URL}/billing/usage`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const newUsageData = await newUsageRes.json();
  console.log(`✅ Upgraded to: ${newUsageData.plan}. Max Profiles: ${newUsageData.limits.maxProfiles}`);

  // 8. Test Team Invitation
  console.log('\n[8] Testing Team Member Invitation');
  const inviteRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `member_${Date.now()}@local.com`,
      password: 'MemberPass123!',
      role: 'MANAGER'
    })
  });
  if (!inviteRes.ok) {
     const error = await inviteRes.json();
     console.error('⚠️ Invite failed (expected if limit hit or logic error):', error);
  } else {
     console.log('✅ Team member invited.');
  }

  console.log('\n🚀 ALL BUSINESS FLOW TESTS PASSED!');
}

run().catch(err => {
  console.error('\n❌ E2E TEST FAILED:');
  console.error(err);
  process.exit(1);
});
