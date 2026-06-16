# AeroSend 🚀 - WhatsApp Bulk Message Sender

AeroSend es una aplicación local y segura diseñada para realizar envíos de mensajes masivos por WhatsApp utilizando la automatización de WhatsApp Web mediante la biblioteca `@whiskeysockets/baileys`. 

## Características
- **Interfaz Web Ultra Premium:** Diseñada en modo oscuro, con efecto de cristal esmerilado (glassmorphism) y animaciones fluidas.
- **Vinculación Rápida:** Genera un código QR dinámico listo para ser escaneado con la aplicación de WhatsApp Business o WhatsApp Personal.
- **Sesión Persistente:** La sesión se mantiene iniciada localmente incluso si reinicias el servidor.
- **Envío Masivo Seguro:** Incorpora un retardo seguro y variable (entre 3 y 7 segundos) entre mensajes para proteger la línea contra bloqueos/baneos por spam.
- **Verificación de Número:** Comprueba automáticamente si el destinatario tiene una cuenta de WhatsApp registrada antes de intentar enviar el mensaje, evitando intentos inútiles.
- **Monitoreo en Tiempo Real:** Barra de progreso interactiva, estadísticas en vivo (Enviados, Procesados, Fallidos) e historial de logs.
- **Cancelación Directa:** Puedes detener el envío en cualquier momento si detectas un error.

---

## Requisitos
- **Node.js** v18 o superior.
- **NPM** instalado.
- Un teléfono celular con WhatsApp (Personal o Business) para escanear el QR.

---

## Instrucciones de Uso

### 1. Iniciar el Servidor
En la raíz de este proyecto, ejecute el siguiente comando para levantar el servidor web local:

```bash
npm start
```

El servidor se iniciará y estará disponible en:
👉 [http://localhost:3000](http://localhost:3000)

### 2. Vincular su Dispositivo
1. Abra su navegador en [http://localhost:3000](http://localhost:3000).
2. Verá el código QR.
3. Desde su teléfono móvil en WhatsApp, vaya a **Menú/Configuración** > **Dispositivos vinculados** > **Vincular un dispositivo**.
4. Escanee el código QR de la pantalla.
5. El estado en el dashboard cambiará automáticamente a **Conectado** indicando su nombre de perfil y número.

### 3. Enviar Mensajes
1. En el campo **Destinatarios**, pegue la lista de números telefónicos. 
   - Deben incluir el código de país.
   - Ejemplo: `5491122334455` (Argentina), `573001234567` (Colombia), etc.
   - Puede separarlos por comas o saltos de línea.
2. Escriba el **Mensaje** que desea enviar.
3. Presione el botón **Iniciar Envío**.
4. Observe el progreso en tiempo real y el log de eventos en la parte inferior.
