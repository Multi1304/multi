const axios = require('axios');

const API = 'http://localhost:4000';

(async () => {
  console.log('🚀 Iniciando Test Backend API Core...');
  try {
    // 1. Health
    console.log('➡️ Verificando Health Check...');
    const health = await axios.get(`${API}/health`);
    console.log(`✅ Status: ${health.data.status}, DB: ${health.data.db}`);

    // 2. Auth Flow
    const userNum = Math.floor(Math.random() * 9000);
    const email = `api_test_${userNum}@local`;
    const password = 'adminadmin';
    const tenantName = `Tenant_API_${userNum}`;

    console.log(`➡️ Registrando nuevo tenant (${tenantName})...`);
    let regRes;
    try {
      regRes = await axios.post(`${API}/auth/register`, {
        tenantName,
        email,
        password,
        termsAccepted: true
      });
    } catch (e) {
      if (e.response && e.response.status === 400 && e.response.data.error === 'Email already in use') {
        console.log('Email taken, trying Login instead...');
      } else {
        throw e;
      }
    }
    
    let token = null;
    if (regRes) {
      token = regRes.data.token || (regRes.data.user && regRes.data.user.token);
    }
    
    // Test Login just in case
    console.log('➡️ Probando Login (Waiting 1.5s for JWT iat uniqueness)...');
    await new Promise(r => setTimeout(r, 1500));
    const logRes = await axios.post(`${API}/auth/login`, {
      email,
      password
    });
    const accessToken = logRes.data.token || logRes.data.user?.token;
    if(!accessToken) throw new Error('Falló el Login - Token nulo');
    console.log('✅ Autenticación Exitosa. Token obtenido.');

    // 3. Crear Perfil Stealth Avanzado
    console.log('➡️ Creando Perfil vía API...');
    const profileRes = await axios.post(`${API}/profiles`, {
      name: `Stealth Profile API ${userNum}`,
      config: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        canvas: { noiseSeed: Math.random() },
        webgl: { vendor: 'Google Inc. (NVIDIA)' }
      },
      proxy: { type: 'none' }
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log(`✅ Perfil Creado exitosamente! ID: ${profileRes.data.id}`);

    // 4. Crear Flujo de Automatización
    console.log('➡️ Creando Tarea de Automatización (RPA)...');
    const flowRes = await axios.post(`${API}/flows`, {
      name: `Flujo API ${userNum}`,
      description: 'Auto login flow test',
      steps: [
        { order: 0, type: 'navigate', config: { url: 'https://example.com' } },
        { order: 1, type: 'wait', config: { ms: 2000 } }
      ]
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    console.log(`✅ Flujo de Automatización Creado! ID: ${flowRes.data.id}`);

    console.log('🎉 TODOS LOS ENDPOINTS CORE ESTÁN OPERATIVOS Y RESPONDEN.');

  } catch(e) {
    console.error('❌ Falló el Test de API:');
    if (e.response) {
      console.error(e.response.status, e.response.data);
    } else {
      console.error(e.message);
    }
  }
})();
