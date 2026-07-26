# BEATSS — endurecimiento de seguridad

Fecha: 2026-07-25

## Cambios aplicados

- El servidor local escucha en `127.0.0.1` por defecto; solo se permite cambiarlo mediante `BEATSS_BIND_HOST` a un valor explícito.
- `/api/local-token` ya no confía en `Origin` ni `Referer`: solo responde a clientes loopback y no revela un token vacío.
- La comparación del token local y de las firmas de descarga usa comparación de tiempo constante.
- Se genera una `DOWNLOAD_SIGNING_KEY` aleatoria localmente si falta; se eliminó la clave fija `dev-signing-key`.
- Las descargas RIDE/XML locales exigen origen loopback o autenticación local.
- `/api/get-order-downloads` valida ID, secreto, firma o sesión Firebase, y comprueba que la sesión corresponda al comprador/productor/admin. Ya no permite consultar pedidos pendientes sin autorización.
- Los enlaces firmados usan un origen validado, no el encabezado `Host` sin verificar.
- `/api/log-download` valida tipos de archivo y autorización mediante enlace firmado o sesión del propietario/admin; dejó de aceptar CORS `*` y dejó de devolver mensajes internos.
- La configuración sensible de Google Drive se lee con credenciales administrativas en el servidor; se eliminó la regla global de lectura pública de `config`.
- Firestore: códigos VIP solo para admin; creación de contactos y whitelist solo para propietario/admin.
- Storage: el admin puede operar contratos y se mantienen límites de PDF (15 MB y `application/pdf`).
- Los mocks de PayPal/PayPhone solo funcionan con `ALLOW_PAYMENT_MOCKS=true` y desde loopback.

## Verificación realizada

- `python3 -m py_compile` para los módulos Python modificados: correcto.
- `node --check` para las funciones y el checkout modificados: correcto.
- `npm run build` con Vite: correcto.
- Balance de llaves de `firestore.rules` y `storage.rules`: correcto.

## Pendientes antes de declarar seguridad completa

1. Publicar las reglas de Firestore/Storage y configurar `DOWNLOAD_SIGNING_KEY` en Vercel con un secreto distinto al local.
2. Separar los datos públicos de estado de los pagos de la información privada del comprador. La regla de invitado para `/payments/{paymentId}` todavía existe para no romper el listener de checkout; contiene más campos de los ideales.
3. Ejecutar `npm run security:check` antes de cada deploy y pruebas de autorización para cada endpoint de descarga y las reglas de Firestore.
4. Migrar el frontend a CSP sin `unsafe-inline`/`unsafe-eval` y retirar scripts CDN no esenciales.
5. Sustituir los `Access-Control-Allow-Origin: *` heredados del servidor Python por el helper de CORS restringido si el servidor local llega a exponerse fuera de loopback.

El archivo `.env.example` contiene las variables mínimas y el gate local no modifica datos ni llama a servicios externos.

No se hizo ningún despliegue ni se borraron datos, facturas, licencias o historiales.
