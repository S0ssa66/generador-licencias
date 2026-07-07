---
description: Guía detallada para configurar y poner en marcha el módulo de Facturación Electrónica del SRI con RUC en la plataforma BEATSS.
---

# Guía de Configuración: Facturación Electrónica SRI (Ecuador)

El sistema de **BEATSS** cuenta con un facturador electrónico integrado que se conecta directamente con los servicios web del **SRI (Servicio de Rentas Internas de Ecuador)**. Este módulo permite firmar digitalmente cada factura generada tras una venta y tramitar su autorización de manera automatizada.

---

## 📋 Requisitos para Emisión en Producción

Antes de activar la facturación en vivo, necesitas contar con lo siguiente:
1. **RUC Activo:** Tu Registro Único de Contribuyentes emitido por el SRI (ej. `0803743111001`).
2. **Firma Electrónica en Formato Archivo (`.p12` o `.pfx`):** Emitida por entidades autorizadas en Ecuador (ej. Security Data, Consejo de la Judicatura, Registro Civil, etc.).
3. **Contraseña de la Firma:** La contraseña que creaste al descargar tu firma.
4. **Convenio de Débito:** Tener registrado un convenio de débito en el portal del SRI para el pago de impuestos (indispensable para facturación electrónica).

---

## ⚙️ Configuración en el Panel de Administración de BEATSS

Para ingresar tus credenciales y configurar el facturador, sigue estos pasos:

1. Inicia sesión en tu panel de **BEATSS** con tu cuenta de administrador (`sossabeatz1@gmail.com`).
2. Ve a la pestaña **Administración** ➔ **Contabilidad General / Facturación**.
3. Completa los campos del formulario con tus datos reales:

| Campo | Descripción | Ejemplo |
| :--- | :--- | :--- |
| **RUC Emisor** | Tu número de RUC completo (13 dígitos) | `0803743111001` |
| **Razón Social** | Tu nombre completo tal como consta en el RUC | `JOAO DAVID DOMINGUEZ` |
| **Nombre Comercial** | Nombre de tu marca o tienda de beats | `BEATSS` |
| **Dirección Matriz** | Dirección comercial registrada. Recuerda usar **"Quito - Ecuador"** para proteger la privacidad de tu casa | `Quito - Ecuador` |
| **Código Establecimiento** | El código de tu punto de emisión (usualmente `001`) | `001` |
| **Punto de Emisión** | Código del punto de emisión (usualmente `001`) | `001` |
| **Régimen RIMPE** | Tu tipo de régimen tributario actual | *Negocio Popular* o *Emprendedor* |
| **Obligado a llevar Contabilidad** | Marcar "NO" a menos que tu RUC indique lo contrario | `NO` |

### Carga de la Firma Electrónica
1. En el campo **Firma Electrónica (.p12 / .pfx)**, haz clic en **Seleccionar archivo** y sube tu archivo de firma.
2. Introduce la **Contraseña de la Firma**.
3. Haz clic en **Guardar Configuración**.

> [!NOTE]
> **Seguridad de tus datos:** Por motivos de seguridad y privacidad (Directiva SEC-02), tu archivo de firma `.p12` en formato Base64 y tu contraseña no se almacenan en la configuración pública. Se guardan en una colección privada en Firestore (`/users/{uid}/private_config/producer`) que es inaccesible para los compradores y visitantes de la tienda.

---

## 🔄 Ambientes de Emisión: Pruebas vs. Producción

El SRI provee dos ambientes independientes. En tu configuración puedes elegir:

### 1. Ambiente de Pruebas (Ambiente 1)
* **Propósito:** Validar que la firma electrónica, contraseña y formato del XML sean correctos.
* **Validez:** Las facturas emitidas aquí **NO tienen validez legal ni tributaria**. El SRI las procesa y autoriza, pero no se reportan para impuestos.
* **Uso recomendado:** Déjalo en este ambiente hasta que subas tu firma real y confirmemos que la primera factura se firma y envía con éxito.

### 2. Ambiente de Producción (Ambiente 2)
* **Propósito:** Emisión en vivo para clientes reales.
* **Validez:** Las facturas generadas tienen **plena validez legal**. Cada transacción se reporta automáticamente al SRI para tu contabilidad.
* **Uso recomendado:** Actívalo únicamente después de haber completado con éxito al menos una prueba en el ambiente de pruebas.

---

## 🔍 Gestión de Errores y Reintentos

Si por algún motivo el servicio web del SRI se encuentra temporalmente caído (algo común en sus servidores) o la factura es rechazada:
1. El backend de BEATSS registrará la factura en tu historial con el estado **Rechazada por SRI** o **Error de Conexión**.
2. Podrás ingresar a tu panel de **Historial**, seleccionar la licencia afectada y hacer clic en **"Reintentar Facturación SRI"**.
3. El sistema reconstruirá la clave de acceso, firmará nuevamente el documento y reintentará el envío directamente al web service del SRI sin necesidad de alterar los datos del cliente.
