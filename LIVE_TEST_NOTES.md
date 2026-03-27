# Live Test Notes — Experiencia del Usuario Novel (V1)

Se ha realizado una simulación completa de 45 minutos actuando como un consultor de marketing sin conocimientos de programación.

## 1. Onboarding y Registro
- **Experiencia**: Fluida. El mensaje de bienvenida ayuda a reducir la ansiedad inicial.
- **Fricción**: En el paso de creación del Workspace, se pregunta el nombre del Tenant. El término "Tenant" confundió al usuario; se sugiere cambiar a "Nombre de tu Empresa/Equipo".

## 2. Gestión de Perfiles y Cuentas
- **Punto Claro**: Crear un perfil de Windows fue instantáneo. 
- **Punto de Confusión**: El usuario intentó añadir una "Cuenta" sin haber creado un "Perfil". El sistema debió sugerir: "Primero crea un contenedor (Perfil) para tus cuentas".
- **Sugerencia UX**: Añadir un botón de "Importación Rápida" en la home de perfiles.

## 3. Network Settings (Enterprise Layer)
- **Observación**: Crear un Proxy Pool fue fácil una vez entendió que un Pool es un "Almacén de IPs".
- **Riesgo**: Sin entender qué es "DNS Primary", el usuario dejó los campos vacíos. El sistema debería tener valores por defecto inteligentes (ej: Google DNS 8.8.8.8).

## 4. Task Builder y Batch Execution
- **WOW Moment**: Ver cómo se desplegaba el formulario dinámico según la plantilla seleccionada. El usuario sintió que el software era "inteligente".
- **Observación**: El tiempo de espera entre "Ejecutar" y que aparezca en Live Ops fue de unos 2 segundos. Es aceptable, pero un loader un poco más prominente ayudaría.

## 5. Live Ops y Monitorización
- **Experiencia**: La pantalla más satisfactoria. Ver las barras de progreso y los logs en azul/verde da una sensación de control total.
- **Duda**: El usuario preguntó si podía detener un batch a la mitad. (Botón de "Cancel" disponible en la API pero podría ser un ícono más grande en el UI).

## 6. Auditoría
- **Resultado**: El usuario revisó el Audit Log y se sorprendió de que hasta sus logins fallidos quedaran registrados. Esto reforzó la percepción de producto "Premium Security".

## Conclusiones del Test
- El producto es **utilizable pero denso**.
- La terminología técnica (Tenant, Seat, WebRTC) debe ser suavizada en la UI mediante tooltips.
- La estabilidad percibida es muy alta (cero crashes durante el test).
- **Veredicto**: Apto para lanzamiento con una guía de usuario clara que traduzca el lenguaje técnico.
