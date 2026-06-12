# Reporte de Auditoría de Seguridad: Firebase Security Rules (BEATSS)

Este reporte detalla los hallazgos de seguridad encontrados tras auditar el archivo `firestore.rules` del proyecto. Se asigna una calificación de seguridad del **1 al 5** (donde 1 es Crítico y 5 es Seguro) y se proveen recomendaciones de código para corregir cada vulnerabilidad detectada.

---

## Calificación de Seguridad: 1 / 5 (Crítico)

Se ha detectado una vulnerabilidad de severidad **Crítica** relacionada con la modificación no autorizada de contactos de otros usuarios, además de riesgos **Mayores** en la autenticación administrativa y vulnerabilidades de **Denegación de Servicio (DoS)** por falta de límites en las escrituras públicas.

---

## Hallazgos de Seguridad Detectados

### 🚨 1. Modificación Pública No Autorizada en Subcolección de Contactos
* **Severidad**: `critical`
* **Descripción**: La regla para `/users/{userId}/contacts/{contactId}` permite `create, update: if true;` públicamente para capturar leads. Al permitir `update` público sin validar la identidad ni la consistencia del documento, un atacante no autenticado podría modificar o sobrescribir el correo electrónico, teléfono o nombre de cualquier contacto de cualquier productor simplemente enviando peticiones directas a Firestore.
* **Impacto**: Pérdida de integridad de la base de datos de contactos y posibilidad de secuestro de leads.
* **Recomendación**: Restringir el `update` público únicamente al propietario del documento (el email no puede ser modificado), o permitir actualizaciones públicas solo bajo condiciones muy específicas, y dejar la escritura total al productor dueño de la cuenta.

### ⚠️ 2. Falta de Verificación de Email en Acceso Administrativo (Email Spoofing)
* **Severidad**: `major`
* **Descripción**: Todas las reglas de administrador validan el correo de forma hardcodeada: `request.auth.token.email.lower() == 'masterjuego25@gmail.com'`. Sin embargo, **no se valida que el correo haya sido verificado** (`request.auth.token.email_verified == true`). Si un atacante crea una cuenta mediante un proveedor vulnerable o spoofea el email en la cabecera del token de autenticación sin verificarlo, podría obtener permisos completos de administración de Sossa.
* **Impacto**: Posible bypass administrativo completo y escalación de privilegios.
* **Recomendación**: Agregar `request.auth.token.email_verified == true` en cada validación del correo administrativo.

### ⚠️ 3. Abuso de Almacenamiento y Falta de Tipo de Datos (Riesgo DoS / Inyección)
* **Severidad**: `moderate`
* **Descripción**: Las escrituras públicas en `payments` (`allow create: if request.resource.data.type == 'beat_purchase'`) y `contacts` no tienen límites de longitud de cadena (string length) ni validación de tipos (`is string`, `is int`).
* **Impacto**: Un atacante podría inyectar objetos gigantescos de megabytes en los campos de texto, agotando la cuota de almacenamiento de Firebase o incrementando las lecturas/costos (Ataque de Denegación de Servicio por Recursos).
* **Recomendación**: Validar que los campos obligatorios existan, que sean del tipo de datos correcto (`string`, `number`, `timestamp`) y definir límites de longitud máximos (v.g., nombres y correos < 100 caracteres).

---

## JSON de Auditoría (Formato Estándar)

```json
{
  "score": 1,
  "summary": "Vulnerabilidad crítica en la actualización de contactos públicos y falta de validación de email verificado para cuentas de administrador.",
  "findings": [
    {
      "check": "Field-Level vs. Identity-Level Security",
      "severity": "critical",
      "issue": "La subcolección 'contacts' permite actualizaciones ('update') sin verificar la propiedad ni restringir la modificación del correo original.",
      "recommendation": "Permitir update público solo si el email entrante coincide con el existente: `request.resource.data.email == resource.data.email`, o limitar el update únicamente al productor autenticado."
    },
    {
      "check": "Authority Source",
      "severity": "major",
      "issue": "El acceso de administrador por email no valida que 'email_verified' sea verdadero.",
      "recommendation": "Agregar la regla `request.auth.token.email_verified == true` en todos los accesos del correo administrador."
    },
    {
      "check": "Storage Abuse & Type Safety",
      "severity": "moderate",
      "issue": "Las colecciones con escritura pública ('payments' y 'contacts') no limitan el tamaño de las cadenas de texto ni validan tipos de campos.",
      "recommendation": "Implementar validaciones como `request.resource.data.email is string && request.resource.data.email.size() < 100`."
    }
  ]
}
```

---

## Archivo Propuesto de Reglas Corregidas (`firestore.rules`)

Aquí tienes la propuesta mejorada y robusta para tu archivo `firestore.rules`:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Función auxiliar para verificar si el usuario es el administrador de Sossa
    function isAdmin() {
      return request.auth != null && 
             request.auth.token.email.lower() == 'masterjuego25@gmail.com' &&
             request.auth.token.email_verified == true;
    }

    // Función auxiliar para validar datos de contacto públicos
    function isValidContact() {
      let data = request.resource.data;
      return data.email is string && data.email.size() < 100 &&
             data.name is string && data.name.size() < 100 &&
             (!data.keys().contains('phone') || (data.phone is string && data.phone.size() < 30));
    }

    // Regla para la contabilidad consolidada de Sossa Admin (Collection Group query)
    match /{path=**}/licencias/{document} {
      allow read: if isAdmin();
    }

    // Regla para consulta de configuraciones de todos los productores (Sossa Admin y Tienda Pública)
    match /{path=**}/config/{document} {
      allow read: if true;
    }

    // Regla para consulta global de beats (Catálogo Global)
    match /{path=**}/beats/{document} {
      allow read: if true;
    }

    // Regla para solicitudes de pago local y compras de beats
    match /payments/{paymentId} {
      allow create: if (request.resource.data.type == 'beat_purchase' && 
                        request.resource.data.userId is string && 
                        request.resource.data.producerId is string) || 
                       (request.auth != null && request.resource.data.userId == request.auth.uid);
      allow read: if request.auth != null && (resource.data.userId == request.auth.uid || resource.data.producerId == request.auth.uid || isAdmin());
      allow update: if request.auth != null && (isAdmin() || resource.data.producerId == request.auth.uid);
      allow delete: if false;
    }

    // Regla para referidos (referrals)
    match /referrals/{referralId} {
      allow read: if request.auth != null && (resource.data.referrerId == request.auth.uid || isAdmin());
      allow create: if request.auth != null && request.auth.uid == referralId;
      allow update: if request.auth != null && (request.auth.uid == referralId || isAdmin());
      allow delete: if isAdmin();
    }

    // Regla para códigos VIP
    match /vip_codes/{codeId} {
      allow get: if request.auth != null;
      allow list, write: if isAdmin();
    }

    // Regla principal por usuario
    match /users/{userId} {
      // Sossa Admin tiene acceso completo
      allow read, write: if isAdmin();

      // El propio usuario puede leer su documento
      allow read: if request.auth != null && request.auth.uid == userId;
      
      // El propio usuario puede crear/actualizar su documento principal con restricciones de plan
      allow create: if request.auth != null && request.auth.uid == userId && (
        !request.resource.data.keys().hasAny(['plan', 'planActivatedAt']) || request.resource.data.plan == 'inicial'
      );
      allow update: if request.auth != null && request.auth.uid == userId && (
        !request.resource.data.diff(resource.data).affectedKeys().hasAny(['plan', 'planActivatedAt']) || 
        (request.resource.data.plan == 'inicial' && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['planActivatedAt']))
      );

      // Reglas para subcolección config/producer
      match /config/producer {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId && (
          !request.resource.data.keys().hasAny(['plan', 'expirationPro', 'redeemedCodes']) || 
          request.resource.data.plan == 'inicial'
        );
        allow update: if isAdmin() || (
          request.auth != null && request.auth.uid == userId && (
            // Permitir actualización si no se tocan los campos de plan
            (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['plan', 'expirationPro', 'redeemedCodes'])) ||
            // Permitir degradar a plan inicial sin alterar redeemedCodes ni expirationPro
            (request.resource.data.plan == 'inicial' && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['expirationPro', 'redeemedCodes']))
          )
        );
      }

      // Reglas para subcolecciones normales
      match /beats/{beatId} {
        allow read: if true;
        allow write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      }

      match /templates/{templateId} {
        allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      }

      match /licencias/{licenciaId} {
        allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      }

      match /contacts/{contactId} {
        allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
        
        // Permitir creación pública (leads) con tipos de datos e input sanos
        allow create: if isValidContact();
        
        // Impedir que usuarios públicos editen arbitrariamente correos o secuestren contactos
        allow update: if isValidContact() && request.resource.data.email == resource.data.email;
      }
    }
  }
}
```
