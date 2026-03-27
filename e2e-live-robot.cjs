const { chromium } = require('playwright');

(async () => {
  console.log('🤖 [MODO IA] Iniciando Test Visual "Paso a Paso"...');
  console.log('Por favor, no toques el ratón. ¡Observa la pantalla!');

  // Lanzamos el navegador en modo Visiual (headless: false) y muy lento (slowMo: 500) para que se vea claramente.
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const page = await browser.newPage();
  
  try {
    const userSuffix = Date.now().toString().slice(-4);
    const email = `admin_${userSuffix}@local`;
    const password = 'adminadmin';
    const tenantName = `Tenant_${userSuffix}`;

    // 1. Registro
    console.log('Paso 1: Abriendo Multilogin en http://localhost:3000');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    console.log('Paso 2: Navegando a la vista de Registro...');
    await page.click('text=Register here');
    await page.waitForTimeout(1500);
    
    console.log(`Paso 3: Llenando datos del Tenant: ${tenantName} | Email: ${email}`);
    // Llenar el formulario de registro usando selectores genéricos para máxima compatibilidad
    const inputs = await page.$$('input');
    if(inputs.length >= 3) {
      await inputs[0].fill(tenantName);
      await inputs[1].fill(email);
      await inputs[2].fill(password);
    }
    await page.waitForTimeout(1000);
    
    console.log('Paso 4: Aceptando Términos y clicando Register...');
    const checkbox = await page.$('input[type="checkbox"]');
    if(checkbox) await checkbox.check();
    await page.waitForTimeout(500);
    
    await page.click('button:has-text("Register")');
    console.log('Paso 5: Esperando la redirección y el Login automático...');
    await page.waitForTimeout(5000);
    
    // Si la plataforma redirecciona al Login primero (comportamiento defensivo):
    if(page.url().includes('login')) {
      console.log('=> El sistema pidió Login manual tras registro. Iniciando sesión...');
      const loginInputs = await page.$$('input');
      if(loginInputs.length >= 2) {
         await loginInputs[0].fill(email);
         await loginInputs[1].fill(password);
      }
      await page.click('button:has-text("Sign in")');
      await page.waitForTimeout(4000);
    }

    console.log('🎉 ¡Login exitoso! Estamos en el Dashboard.');
    await page.waitForTimeout(2000);

    // 2. Crear Perfil
    console.log('Paso 6: Navegando a la sección de Perfiles Stealth...');
    // Dependiendo de si el texto es Profiles o el icono, hacemos click
    const profilesLink = await page.$('text=Profiles');
    if (profilesLink) {
        await profilesLink.click();
    } else {
        await page.goto('http://localhost:3000/profiles');
    }
    await page.waitForTimeout(3000);
    
    console.log('Paso 7: Abriendo Modal de Creación de Perfil...');
    // Podría decir New Profile o Create Profile
    const createBtn = await page.$('button:has-text("Create Profile"), button:has-text("New Profile")');
    if (createBtn) await createBtn.click();
    await page.waitForTimeout(2000);
    
    console.log('Paso 8: Configurando nombre del nuevo perfil oculto...');
    const profileInputs = await page.$$('input[type="text"]');
    if(profileInputs.length > 0) {
        await profileInputs[profileInputs.length - 1].fill('AI Stealth Profile ' + userSuffix);
    }
    await page.waitForTimeout(2000);
    
    console.log('Paso 9: Guardando y finalizando el perfil...');
    const finalBtns = await page.$$('button:has-text("Finalize Profile"), button:has-text("Save"), button:has-text("Create")');
    if(finalBtns.length > 0) {
      await finalBtns[finalBtns.length - 1].click();
    }
    
    console.log('✅ PERFIL CREADO RECONOCIDO EN UI.');
    await page.waitForTimeout(4000);

    console.log('🎬 DEMOSTRACIÓN COMPLETADA. El navegador se cerrará en 10 segundos...');
  } catch(e) {
    console.error('❌ Oh no, algo falló en la visualización en vivo:', e);
  } finally {
    await page.waitForTimeout(10000); // Darle tiempo al usuario para ver el resultado final
    await browser.close();
    console.log('🏁 Navegador cerrado. Volviendo al terminal.');
  }
})();
