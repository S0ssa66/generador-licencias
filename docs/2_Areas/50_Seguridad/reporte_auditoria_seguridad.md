# 🔒 Reporte de Auditoría de Seguridad Completo — BEATSS Licencias

Este reporte detalla la auditoría de seguridad realizada en la aplicación BEATSS, incluyendo las reglas de Firebase (`firestore.rules`), el servidor local de sincronización (`server.py`), las funciones serverless de Vercel (`api/`) y los scripts frontend.

---

## 📋 Resumen Ejecutivo
Se realizó una revisión exhaustiva de la seguridad del repositorio `/Users/sossa/IA/generador-licencias`. El objetivo fue identificar vulnerabilidades activas, configuraciones inseguras y oportunidades de mejora para garantizar la confidencialidad, integridad y disponibilidad del sistema.

### Nivel de Riesgo Global: 🚨 CRÍTICO (Antes de remediaciones)
Se identificaron múltiples fallas graves de seguridad, de las cuales las más críticas corresponden al servidor de backend local y a las reglas de base de datos en la nube.

---

## 🔍 Hallazgos de Seguridad Detectados

### 🚨 SEC-01: Evasión de Verificación de Licencia en Creación de Whitelist (Severidad: Mayor)
* **Archivo:** [firestore.rules](file:///Users/sossa/IA/generador-licencias/firestore.rules) (Líneas 133–136)
* **Detalle:** La regla actual para la subcolección `whitelist` permite escrituras completas (`write`) si el usuario es el dueño del canal o el admin. El bloque `allow create: if exists(...)` queda sin efecto porque `write` otorga permisos de creación incondicionales sin exigir la referencia de licencia válida.
* **Impacto:** Un usuario podría crear entradas en la whitelist sin poseer una licencia válida.
* **Remediación:** Separar `write` en operaciones individuales y verificar la existencia de la licencia en la creación:
  ```javascript
  match /whitelist/{whitelistId} {
    allow read, delete: if (request.auth != null && request.auth.uid == userId) || isAdmin();
    allow create: if ((request.auth != null && request.auth.uid == userId) || isAdmin()) &&
                     exists(/databases/$(database)/documents/users/$(userId)/licencias/$(request.resource.data.licenseRef));
    allow update: if false;
  }
  ```

---

### 🚨 SEC-02: Exposición de Watermarks Base64 en Configuración Pública (Severidad: Moderada)
* **Archivo:** [firestore.rules](file:///Users/sossa/IA/generador-licencias/firestore.rules)
* **Detalle:** La regla pública permite a cualquiera leer la configuración del productor en `/users/{userId}/config/producer` (`allow read: if true;`). Esta colección contiene el string base64 de la marca de agua del beat (`audioTagBase64`).
* **Impacto:** Usuarios maliciosos pueden descargar el archivo de la marca de agua y utilizar cancelación de fase para remover la voz de protección de los beats de preview de la tienda.
* **Remediación:** Mover `audioTagBase64` al documento `/private_config/producer`, que está restringido al productor y al administrador.

---

### 🚨 SEC-03: Falta de Validación de Esquema y Límites de Tamaño en Contactos (Severidad: Moderada)
* **Archivo:** [firestore.rules](file:///Users/sossa/IA/generador-licencias/firestore.rules)
* **Detalle:** El endpoint público para guardar prospectos/leads (`contacts`) no restringe campos adicionales ni el tamaño máximo de los datos almacenados.
* **Impacto:** Un atacante puede enviar objetos gigantescos en campos de texto para llenar la cuota de almacenamiento gratuito de Firestore (DoS por almacenamiento).
* **Remediación:** Usar `keys().hasOnly()` y limitar los tamaños:
  ```javascript
  function isValidContact(userId) {
    let data = request.resource.data;
    return exists(/databases/$(database)/documents/users/$(userId)) &&
           data.keys().hasOnly(['email', 'name', 'phone', 'createdAt']) &&
           data.email is string && data.email.size() < 100 &&
           data.name is string && data.name.size() < 100 &&
           (!('phone' in data) || (data.phone is string && data.phone.size() < 30));
  }
  ```

---

### 🚨 SEC-04: Evasión del Estado de Tareas (Tasks) en Firestore (Severidad: Mayor)
* **Archivo:** [firestore.rules](file:///Users/sossa/IA/generador-licencias/firestore.rules)
* **Detalle:** La regla de tareas (`tasks`) permite a los usuarios modificar libremente el documento, incluidos los campos de `estado` o `resultado`.
* **Impacto:** Un usuario malicioso podría marcar manualmente una tarea pesada como `completed` y definir un `resultado` falso, engañando a la interfaz o a los flujos automatizados de backend.
* **Remediación:** Restringir la actualización de campos de ejecución:
  ```javascript
  allow update: if request.auth != null && (
    isAdmin() || 
    (resource.data.userId == request.auth.uid && 
     !request.resource.data.diff(resource.data).affectedKeys().hasAny(['estado', 'resultado', 'progreso', 'tipo', 'consulta']))
  );
  ```

---

### 🚨 SEC-05 & SEC-06 & SEC-07: Operaciones de Base de Datos Locales sin Autenticación (Severidad: Crítica)
* **Archivo:** [server.py](file:///Users/sossa/IA/generador-licencias/server.py)
* **Detalle:**
  1. `/api/load-local` descarga copias completas de la base de datos local (incluyendo tokens OAuth, configuraciones y datos de clientes).
  2. `/api/save-local` permite sobreescribir la base de datos local.
  3. Los archivos de respaldo generados se guardan directamente dentro de la raíz web expuesta por el servidor.
* **Impacto:** Si el servidor se expone a la red local (o mediante túneles/IP pública), un atacante podría robar las bases de datos de respaldo o inyectar código dañino sobreescribiendo los backups locales.
* **Remediación:**
  1. Enlazar el servidor estrictamente a la interfaz loopback local (`127.0.0.1` en vez de `0.0.0.0` o vacío `""`):
     ```python
     server_address = ('127.0.0.1', port)
     ```
  2. Implementar un token pre-compartido (PSK) o secreto local en la cabecera `Authorization` de todas las peticiones a la API local.

---

### 🚨 SEC-10: Extracción de Archivos de Google Drive sin Firma (Severidad: Mayor)
* **Archivo:** [api/proxy-audio.js](file:///Users/sossa/IA/generador-licencias/api/proxy-audio.js)
* **Detalle:** Si una petición de streaming no viene firmada, el script verifica si el nombre de archivo solicitado termina en `.mp3` o `.jpg` para asumir que es de acceso público.
* **Impacto:** Cualquier atacante que conozca el ID de archivo (`fileId`) de una licencia firmada o de un PDF confidencial del cliente almacenado en la misma cuenta central de Google Drive podría descargarlo simplemente enviando una petición con la extensión cambiada a `.mp3`.
* **Remediación:** No validar por la extensión. En su lugar, realizar una consulta a Firestore para verificar si el `fileId` corresponde a una propiedad pública registrada del beat (como la vista previa o la carátula) antes de proceder con la descarga.

---

### 🚨 SEC-11: Vulnerabilidad XSS del DOM en la Tienda y Panel de Control (Severidad: Mayor)
* **Archivos:** [main.js](file:///Users/sossa/IA/generador-licencias/main.js), [checkout.js](file:///Users/sossa/IA/generador-licencias/checkout.js), [catalog.js](file:///Users/sossa/IA/generador-licencias/catalog.js)
* **Detalle:** Se renderizan dinámicamente propiedades del beat (`item.beatName`, `item.buyer`) en plantillas usando `.innerHTML` directamente sin sanitización.
* **Impacto:** Si un atacante registra un beat con un AKA o nombre de beat malicioso conteniendo scripts (`<img src=x onerror=...>`), dicho código JS se ejecutará automáticamente en el navegador de cualquier visitante de la tienda o del administrador al visualizar la tabla de ventas.
* **Remediación:** Cambiar el renderizado de campos de texto plano a `.textContent`, o pasar los strings a través de `sanitizeHtml()` antes de asignarlos a `innerHTML`.

---

## 🛠️ Próximos Pasos Recomendados
1. **Aplicar los parches de Firestore Rules:** Incorporar las correcciones sugeridas para el whitelisting y la restricción de tareas.
2. **Robustecer el Servidor Local:** Restringir el socket de escucha a `127.0.0.1` y añadir validación de token local en cabeceras.
3. **Validar Archivos de Google Drive mediante Base de Datos:** Quitar la validación de extensiones insegura en `proxy-audio.js`.
4. **Sanitizar el DOM en Frontend:** Sustituir inserciones directas de `innerHTML` por asignaciones seguras.
