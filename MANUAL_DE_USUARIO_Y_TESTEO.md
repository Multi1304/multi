# 🐫 Manual Didáctico y Guía de Testeo - CamelFarm Premium (Groq Turbo Edition)

¡Bienvenido a la nueva era de **CamelFarm**! Este documento te guiará por la plataforma de navegación stealth más avanzada del mundo, ahora potenciada por la inteligencia artificial **Groq (Llama 3)** con respaldo de **Grok (xAI)**.

---

## 🧭 ¿Qué es CamelFarm?

CamelFarm es un "Establo de Navegadores Virtuales". Cada perfil es una identidad digital única, aislada y matemáticamente perfecta. Gracias a **Grok**, CamelFarm no solo oculta tu huella, sino que **aprende de las tendencias de baneo en tiempo real de X (Twitter)** para protegerte antes de que ocurra un "ban wave".

---

## 🛠️ PASO 1: Arrancando el Sistema

1. **Terminal 1 (Infraestructura)**: `docker-compose up -d --remove-orphans`
   - Levanta Redis y Postgres (memoria y almacenamiento).
2. **Terminal 2 (Cerebro Backend)**: `npm run dev` en la carpeta `backend`.
   - Activa el motor de evasión Grok-Evade.
3. **Terminal 3 (Interfaz CamelFarm)**: `npm run dev` en la carpeta `frontend`.
   - Abre `http://localhost:3000` para empezar.

> [!NOTE]
> **Potencia Groq**: Hemos integrado **Groq** como motor principal. Esto permite respuestas de IA en milisegundos para la generación de flujos y análisis de huellas. Grok permanece activo como sistema de respaldo (backup).

---

## 🎭 PASO 2: Gestión de Perfiles (Identidad CamelFarm)

1. Ve a **"Profiles"**.
2. Haz clic en **"Create Profile"**.
3. **CREACIÓN SEMÁNTICA (Premium)**: En vez de configurar cada campo, usa el **Chatbot de CamelFarm** (esquina inferior derecha) y di: *"Crea un perfil de iPhone 15 en Londres para entrar a TikTok"*.
4. **Grok Analysis**: Al guardar, Grok generará una semilla de ruido (Canvas/WebGL) basada en estadísticas reales para asegurar 100% de éxito en BrowserLeaks.

---

## 🤖 PASO 3: Automatización Grok-RPA

1. Ve a **"Automation"**.
2. **Brain-to-Flow**: Dicta o escribe tu objetivo. Grok lo convertirá en un flujo de bloques funcional.
3. **Smart Prompt (Cyber-Purple)**:
   - Añade un nodo al lienzo.
   - Cámbialo a **"Smart Prompt (IA)"**. Verás el color púrpura cibernético.
   - Dale una instrucción libre (ej. "Resume el perfil de este usuario de Twitter"). Grok lo ejecutará en vivo.

---

## 🛡️ PASO 4: Proactive Ban Analysis (IA Predictiva)

Esta es la joya de la corona de CamelFarm.

1. Ve a **"Ban Analysis"** en el menú lateral.
2. Observa el gráfico de **Global Risk**. Si sube del 50%, CamelFarm aplicará parches automáticos.
3. **Grok X-Intelligence**: El sistema lee X en tiempo real buscando nuevas firmas de detección de Google, Meta o LinkedIn.
4. Si ves un riesgo "High" en una plataforma, haz clic en **Sync Live Intelligence** para recibir la remediación técnica inmediata.

---

## 📊 PASO 5: Telemetría y Salud

CamelFarm vigila tus sesiones. Si una sesión se comporta de forma "poco humana", recibirás una alerta en el Dashboard:
- *"Grok detecta patrones de clic muy rápidos. Sugerimos activar HumanMode V2."*

---

## 💡 Resumen del Administrador

Como tester de **CamelFarm**, verifica:
1. **Badges**: Que aparezca "IA Powered" en la interfaz.
2. **Latencia Groq**: La IA debe responder casi instantáneamente (gracias a Llama 3 en Groq).
3. **Estabilidad**: El sistema debe mantener <600MB por instancia gracias al sistema de colas BullMQ.

¡Disfruta de la potencia de Grok en tu establo de perfiles!
e.
4. **Resistencia del Sistema**: Todo debe ejecutarse consumiendo poca RAM gracias a la arquitectura PM2 que hemos implementado de fondo.

¡Feliz Testing! Reúne cualquier error o ajuste de diseño (UI) que detectes durante esta fase manual.
