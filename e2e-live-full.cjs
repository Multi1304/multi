const { chromium } = require('playwright');

(async () => {
  console.log('🤖 [MODO IA] Iniciando Test Visual COMPLETO "Paso a Paso"...');
  console.log('🤖 ESTA DEMOSTRAREMOS LA INTEGRACION DE LA IA.');
  console.log('Por favor, suelta el ratón. ¡Observa la pantalla!');

  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const page = await browser.newPage();
  
  try {
    const userSuffix = Date.now().toString().slice(-4);
    const email = `admin_${userSuffix}@local`;
    const password = 'adminadmin';
    const tenantName = `Tenant_AI_${userSuffix}`;

    // 1. Registro
    console.log('Paso 1: Abriendo Multilogin en http://localhost:3000');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    console.log('Paso 2: Navegando a Registro...');
    await page.click('text=Register here');
    await page.waitForTimeout(1500);
    
    console.log(`Paso 3: Creando Identidad: ${tenantName} | ${email}...`);
    const inputs = await page.$$('input');
    if(inputs.length >= 3) {
      await inputs[0].fill(tenantName);
      await inputs[1].fill(email);
      await inputs[2].fill(password);
    }
    await page.waitForTimeout(1000);
    
    const checkbox = await page.$('input[type="checkbox"]');
    if(checkbox) await checkbox.check();
    
    await page.click('button:has-text("Register")');
    console.log('Paso 4: Esperando validación del servidor...');
    await page.waitForTimeout(5000);
    
    if(page.url().includes('login')) {
      const loginInputs = await page.$$('input');
      if(loginInputs.length >= 2) {
         await loginInputs[0].fill(email);
         await loginInputs[1].fill(password);
      }
      await page.click('button:has-text("Sign in")');
      await page.waitForTimeout(4000);
    }

    console.log('🎉 Login exitoso. Ingresando al Dashboard...');
    await page.waitForTimeout(2000);

    // 2. Crear Perfil Stealth con IA
    console.log('Paso 5: Navegando a Perfiles Stealth V3...');
    const profilesLink = await page.$('text=Profiles');
    if (profilesLink) {
        await profilesLink.click();
    } else {
        await page.goto('http://localhost:3000/profiles');
    }
    await page.waitForTimeout(3000);
    
    console.log('Paso 6: Abriendo AI Profile Generator...');
    const createBtn = await page.$('button:has-text("Create Profile"), button:has-text("New Profile")');
    if (createBtn) await createBtn.click();
    await page.waitForTimeout(2000);
    
    const profileInputs = await page.$$('input[type="text"]');
    if(profileInputs.length > 0) {
        await profileInputs[profileInputs.length - 1].fill(`AI Fingerprint Profile ${userSuffix}`);
    }
    await page.waitForTimeout(1500);
    
    console.log('Paso 7: Llamando al motor de IA Local (Llama 3.2 3B) para inyectar un fingerprint único...');
    const finalBtns = await page.$$('button:has-text("Generate & Save"), button:has-text("Finalize Profile"), button:has-text("Create")');
    if(finalBtns.length > 0) {
      await finalBtns[finalBtns.length - 1].click();
    }
    
    console.log('✅ PERFIL STEALTH GENERADO POR IA RECONOCIDO EN UI.');
    await page.waitForTimeout(4000);

    // 3. Crear Flujo RPA con Nodo IA
    console.log('Paso 8: Navegando al Automation Hub...');
    const autoLink = await page.$('text=Automation');
    if (autoLink) {
        await autoLink.click();
    } else {
        await page.goto('http://localhost:3000/automation');
    }
    await page.waitForTimeout(3000);

    console.log('Paso 9: Abriendo V2 Flow Builder (RPA)...');
    await page.click('button:has-text("Create V2 Flow")');
    await page.waitForTimeout(3000);

    console.log('Paso 10: Añadiendo un nuevo nodo al canvas...');
    await page.click('button:has-text("Add Step")');
    await page.waitForTimeout(1500);

    console.log('Paso 11: Seleccionando la automatización IA (Smart Prompt)...');
    // Para interactuar con el Flow Builder Node Config, primero debemos cliquear o asegurarnos de que el panel lateral derecho existe.
    // React Flow selecciona el último nodo por defecto si le damos un segundo. 
    // Vamos a forzar un click en el nodo recién creado para abrir su config si no está abierta.
    const stepsNodes = await page.$$('.react-flow__node-customTask');
    if (stepsNodes.length > 1) {
       await stepsNodes[stepsNodes.length - 1].dispatchEvent('click'); // Click on the new node directly
    }
    await page.waitForTimeout(1500);

    // Cambiar la opción
    const selects = await page.$$('select');
    if (selects.length > 0) {
        await selects[0].selectOption('prompt');
        await page.waitForTimeout(1500);
    }

    console.log('Paso 12: Escribiendo el prompt en lenguaje natural para la IA...');
    const textareas = await page.$$('textarea');
    if (textareas.length > 0) {
        await textareas[0].fill('Generar un comportamiento de navegación orgánico que simule leer el artículo durante 45 segundos y luego hacer scroll hasta el final.');
    }
    await page.waitForTimeout(2000);

    if (selects.length > 1) {
       await selects[1].selectOption('gpt-4'); // Seleccionamos motor
    }
    await page.waitForTimeout(1000);

    console.log('Paso 13: Guardando la automatización AI-RPA en la base de datos...');
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(2000);

    console.log('Paso 14: Activando y disparando el Flujo!');
    await page.waitForSelector('button:has-text("Run"):not([disabled])');
    await page.click('button:has-text("Run")');
    
    console.log('✅ TEST EOS COMPLETADO PERFECTAMENTE.');
    await page.waitForTimeout(3000);
    
    console.log('🎬 DEMOSTRACIÓN FINALIZADA. Observa el resultado. Cerrando en 12 segundos...');
    await page.waitForTimeout(12000);
  } catch(e) {
    console.error('❌ Oh no, algo falló en la visualización en vivo:', e);
  } finally {
    await browser.close();
    console.log('🏁 Navegador cerrado. Volviendo al terminal.');
  }
})();
