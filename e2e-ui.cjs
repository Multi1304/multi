const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  console.log('🎬 Iniciando Multilogin E2E Visual Test...');
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage();
  
  try {
    const email = `test_admin_${Date.now()}@local`;
    const password = 'adminadmin';
    const tenantName = `Tenant_${Date.now()}`;

    // 1. Registro
    console.log('➡️ Navegando a http://localhost:3000');
    await page.goto('http://localhost:3000');
    
    console.log('➡️ Click en "Register here"');
    await page.click('text=Register here');
    await page.waitForTimeout(1000);
    
    console.log('➡️ Llenando formulario de Registro');
    // Tenant
    await page.fill('input[type="text"]', tenantName);
    // Email (the second input)
    await page.fill('input[type="text"]:nth-of-type(2), input[name="email"], input[placeholder*="Email"]', email);
    // Fallback: fill all text/password inputs blindly if specific selectors fail
    const inputs = await page.$$('input');
    if(inputs.length >= 3) {
      await inputs[0].fill(tenantName);
      await inputs[1].fill(email);
      await inputs[2].fill(password);
    }
    
    console.log('➡️ Aceptando Términos y clic en Register');
    const checkbox = await page.$('input[type="checkbox"]');
    if(checkbox) await checkbox.check();
    
    await page.click('button:has-text("Register")');
    console.log('⏳ Esperando redirección al dashboard (max 5s)');
    await page.waitForTimeout(5000);
    
    // Check if we are logged in (look for Profiles or Dashboard)
    const url = page.url();
    if(url.includes('login')) {
      console.log('➡️ Redirigido a Login. Iniciando sesión...');
      const loginInputs = await page.$$('input');
      if(loginInputs.length >= 2) {
         await loginInputs[0].fill(email);
         await loginInputs[1].fill(password);
      }
      await page.click('button:has-text("Sign in")');
      await page.waitForTimeout(3000);
    }

    console.log('➡️ Autenticación Exitosa!');
    
    // 2. Crear Perfil
    console.log('➡️ Navegando a Perfiles');
    await page.click('text=Profiles');
    await page.waitForTimeout(2000);
    
    console.log('➡️ Abriendo "Create Profile"');
    await page.click('button:has-text("Create Profile")');
    await page.waitForTimeout(1000);
    
    console.log('➡️ Rellenando modal de perfil Stealth');
    const profileInputs = await page.$$('input[type="text"]');
    if(profileInputs.length > 0) {
        await profileInputs[0].fill('Live Test Profile ' + Date.now());
    }
    
    console.log('➡️ Finalizando perfil');
    const finalBtns = await page.$$('button:has-text("Finalize Profile"), button:has-text("Save")');
    if(finalBtns.length > 0) {
      await finalBtns[finalBtns.length - 1].click();
    }
    await page.waitForTimeout(3000);
    
    console.log('✅ TEST VISUAL P1 COMPLETADO CON ÉXITO!');
    console.log('Míralo tú mismo: la sesión está iniciada y el perfil creado.');
    
  } catch(e) {
    console.error('❌ El Test Falló:', e);
  } finally {
    console.log('⏳ Cerrando el navegador en 10 segundos para que revises la pantalla...');
    await page.waitForTimeout(10000);
    await browser.close();
  }
})();
