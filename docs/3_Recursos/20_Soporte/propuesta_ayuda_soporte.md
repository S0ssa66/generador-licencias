# Propuesta de Soporte y Educación sobre Derechos Musicales - BEATSS

Este documento presenta los recursos y guías diseñados para optimizar la experiencia de soporte al usuario y educar a los artistas sobre sus derechos y responsabilidades al adquirir licencias en la plataforma **BEATSS**. 

---

## 1. Diagnóstico del Estado Actual
Tras revisar los archivos de la aplicación (`index.html`, `config.js` e `i18n.js` en `/Users/sossa/IA/generador-licencias`), se identificaron las siguientes áreas de oportunidad:
* **Enlaces Vacíos**: En el pie de página (`index.html`) existen enlaces para "Centro de Ayuda" (`footer_help_center`), "Guía de Derechos de Autor" (`footer_copyright_guide`) y "Acuerdo de Licencia" (`footer_license_agreement`) que actualmente apuntan a `href="#"`, lo que significa que la plataforma no cuenta con contenido visible de soporte.
* **Falta de Claridad en FAQ**: No existe una sección de preguntas frecuentes estructurada que le explique al comprador final de manera sencilla qué significan los límites de streams, qué formatos recibirá y qué puede hacer comercialmente con el beat.
* **Confusión sobre Regalías y Registro**: Muchos artistas desconocen cómo registrar su canción derivada en las sociedades de gestión colectiva (PROs) y cómo aplicar el Split 50/50 tradicional con el productor (**sossa**), lo que genera fricción y consultas redundantes a soporte.

---

## 2. Sección de Preguntas Frecuentes (FAQ) para `index.html`
Esta sección de FAQs está diseñada con el tono técnico y "Elite" de la plataforma, detallando las reglas de negocio de los 5 tipos de licencias disponibles en **BEATSS** (Básica, Premium, Premium Plus, Ilimitada y Exclusiva).

### Contenido de FAQs Redactado

#### Q1. ¿Cuál es la diferencia entre una licencia No Exclusiva y una Exclusiva?
* **Respuesta**: 
  Las licencias **No Exclusivas** (Básica, Premium, Premium Plus e Ilimitada) te otorgan el derecho de usar el beat para crear tu propia canción (obra derivada) bajo ciertos límites de reproducción (streams) y tiempo. El productor retiene la propiedad total del beat y puede seguir licenciándolo a otros artistas. 
  La licencia **Exclusiva** te otorga la propiedad comercial del beat. Ningún otro artista podrá adquirirlo en el futuro, y tu derecho de uso es perpetuo e ilimitado. Sin embargo, las licencias no exclusivas vendidas *antes* de tu compra exclusiva seguirán activas hasta su vencimiento original.

#### Q2. ¿Qué formatos de archivo recibiré con mi compra?
* **Respuesta**: Depende de la licencia que elijas:
  * **Básica**: Archivo MP3 de alta calidad (320kbps).
  * **Premium**: MP3 y WAV (24-bit de calidad de estudio).
  * **Premium Plus / Exclusiva**: MP3, WAV y Stems/Trackouts (pistas de audio individuales separadas por instrumento, ideal para mezcla profesional).
  * **Ilimitada + FLP**: MP3, WAV, Stems y el archivo de proyecto original de FL Studio (.flp) para máxima personalización.

#### Q3. ¿Qué significan los límites de streams en mi licencia?
* **Respuesta**: 
  Representan el número total de reproducciones acumuladas permitidas en plataformas de streaming (Spotify, Apple Music, YouTube, etc.) para tu canción derivada.
  * La licencia **Básica** te permite hasta **40,000 streams**.
  * La licencia **Premium** te permite hasta **100,000 streams**.
  * Las licencias **Premium Plus**, **Ilimitada** y **Exclusiva** te ofrecen **streams ilimitados**.
  *Si te aproximas al límite de streams de tu licencia, debes adquirir una mejora (upgrade) de licencia para evitar la suspensión de tus derechos comerciales.*

#### Q4. ¿Puedo registrar mi canción en YouTube Content ID o sistemas de huellas digitales?
* **Respuesta**: 
  * **Licencias No Exclusivas**: **No**. Tienes estrictamente prohibido registrar tu canción en Content ID o distribuidores con el sistema de huella de audio activo (como CD Baby o TuneCore Social Video). Al compartir el mismo beat con otros artistas licenciados, si registras la pista en Content ID bloquearás los videos y monetizaciones de terceros legítimos, lo cual constituye una infracción del contrato.
  * **Licencia Exclusiva**: Aunque adquieres la propiedad del beat, por contrato te comprometes a **no registrar** la obra en sistemas de Content ID de forma global, o bien a colocar en lista blanca (whitelist) a todos los artistas que adquirieron licencias no exclusivas antes de tu compra. Esto garantiza la armonía jurídica del ecosistema.

#### Q5. ¿Qué ocurre cuando expira el plazo de años de mi licencia?
* **Respuesta**: 
  Las licencias Básica (5 años), Premium (10 años), Premium Plus (10 años) e Ilimitada (10 años) tienen una vigencia temporal. Una vez cumplido este periodo, los derechos comerciales expiran. Para continuar monetizando tu canción en plataformas, deberás renovar la licencia o adquirir una mejora al precio vigente en ese momento. La licencia Exclusiva es la única con vigencia perpetua de por vida.

---

## 3. Guía Educativa de Registro de Regalías y Splits en PROs
Esta guía está pensada para publicarse como un recurso educativo interactivo. Resuelve una de las mayores dudas de los artistas: cómo registrar su composición sin infringir los derechos del productor.

### Guía: "Registra tu Canción Derivada y splits en PROs de Forma Correcta"

Cuando escribes letra y grabas tu voz sobre un beat de **BEATSS**, creas una **Canción Derivada**. Legalmente, esta obra consta de dos partes protegidas por derechos de autor:
1. **La Composición Musical (Melodía y Letra)**: Dividida tradicionalmente al **50/50** entre tú (el compositor/letrista) y el productor (quien compuso la música).
2. **La Grabación de Sonido (El Master)**: Administrado a través de tu distribuidora (DistroKid, TuneCore, etc.).

#### ¿Qué es una PRO y por qué debes registrarte?
Una **PRO (Performing Rights Organization)** como ASCAP, BMI (en EE.UU.), SACM (en México) o SAYCO (en Colombia) se encarga de recaudar las regalías por la comunicación pública de tu música (radios, discotecas, conciertos, transmisiones en vivo y streaming). Si no registras tu obra en una PRO, estarás perdiendo dinero de regalías de composición (Publishing Royalties).

#### Paso a Paso para el Registro de la Obra:
Al registrar tu canción en el portal de tu PRO, debes indicar los porcentajes de participación (**Splits**) acordados en el contrato de **BEATSS**:

1. **Tu Participación (Compositor / Letrista)**:
   * **Rol**: Writer / Compositor de Letra.
   * **Split sugerido**: **50%** del derecho de escritor (Writer's Share).
   * **PRO**: Tu PRO local (por ejemplo, BMI o ASCAP).
2. **Participación del Productor (sossa)**:
   * **Rol**: Composer / Compositor de Música (Beatmaker).
   * **Split contractual**: **50%** de los derechos de autor musicales.
   * **Información del Productor para el Registro**:
     * **Nombre Legal / Real**: [Ingresar Nombre Real de Sossa]
     * **PRO afiliada**: [PRO del Productor, ej. ASCAP / BMI]
     * **Código IPI / CAE**: [Número IPI del Productor]
     * *(Nota: Esta información legal se autocompleta en el panel de usuario al descargar el contrato en BEATSS).*

> [!IMPORTANT]
> **Regalías de Distribución (Master) vs. Composición**:
> No confundas las regalías de tu distribuidora digital (Spotify/Apple Music) con las de tu PRO. Tu distribuidora te paga por la explotación del fonograma (grabación master), donde comúnmente retienes el **100%** de las regalías de distribución (según la licencia) hasta que alcances el límite de streams estipulado. Tu PRO te paga por los derechos de ejecución pública de la composición escrita (que siempre va 50/50).

---

## 4. Respuestas Estandarizadas de Soporte (Plantillas)
Para reducir la carga de soporte del equipo de BEATSS, se proponen tres plantillas automatizables para resolver disputas comunes.

### Plantilla A: Reclamación de Derechos de Autor (Content ID Claim) en YouTube
* **Caso**: Un artista recibe una reclamación de derechos de autor en YouTube tras publicar un tema usando un beat no exclusivo.

```text
Asunto: Soporte BEATSS - Solución a tu reclamo de Content ID en YouTube

Hola [Nombre del Artista],

Entendemos que has recibido una reclamación de derechos de autor (copyright claim) en tu video de YouTube titulado "[Título del Video]". ¡No te preocupes! Esto es muy común y fácil de solucionar.

Dado que utilizas una licencia No Exclusiva ([Básica / Premium / Premium Plus / Ilimitada]), es posible que otro artista o distribuidora haya registrado accidentalmente el beat en la base de datos de Content ID, o que el sistema de YouTube haya identificado la coincidencia automática.

Sigue estos pasos sencillos para resolver la disputa y reactivar la monetización de tu video:

1. Ve a tu panel de YouTube Studio > Contenido > Reclamaciones.
2. Haz clic en "Ver detalles" en la reclamación de tu video y selecciona "Disputar".
3. Elige la opción "Mi uso de este material no infringe los derechos de autor / Tengo una licencia comercial".
4. En el cuadro de justificación, escribe el siguiente texto explicativo:
   "Tengo los derechos de explotación comercial de esta obra bajo una licencia de uso otorgada por el productor sossa en la plataforma BEATSS. Adjunto el código de transacción de la licencia: [ID_TRANSACCION]. La licencia me autoriza a distribuir y monetizar esta grabación derivada."
5. Envía la disputa. 

Por lo general, las reclamaciones se retiran automáticamente en un plazo de 24 a 72 horas. Si el reclamo persiste después de 7 días, por favor envíanos una copia del reclamo y tu archivo PDF del contrato a este correo para ponernos en contacto directo con la distribuidora responsable.

¡Mucho éxito con tu lanzamiento!

Atentamente,
Equipo de Soporte al Cliente, BEATSS
```

---

### Plantilla B: Solicitud de Registro de Content ID por un Comprador Exclusivo
* **Caso**: Un cliente adquiere una licencia Exclusiva y solicita subir su canción al sistema de Content ID de YouTube.

```text
Asunto: Soporte BEATSS - Información sobre Registro de Content ID (Licencia Exclusiva)

Hola [Nombre del Comprador],

Felicitaciones por la adquisición exclusiva de "[Nombre del Beat]". Ahora eres el dueño comercial de esta instrumental.

Respecto a tu solicitud para registrar tu canción en YouTube Content ID u otros sistemas de huellas digitales de audio (Digital Fingerprinting):

De acuerdo con la Cláusula de Armonización Comercial del Contrato Exclusivo de BEATSS, te recordamos que tienes restringido el registro de la pista en Content ID de forma que afecte a terceros. Esto se debe a que, antes de tu compra exclusiva, otros artistas adquirieron licencias no exclusivas de este mismo beat y tienen el derecho legal de seguir monetizando sus canciones derivadas.

Para evitar bloquear a estos creadores y enfrentar penalizaciones legales por reclamos indebidos, tienes dos opciones:

Opción 1: Distribuir tu canción desactivando la monetización de Content ID / Social Video en tu distribuidora (CD Baby, TuneCore, DistroKid, etc.). Esta es la opción más segura y estándar en la industria de la venta de beats en línea.
Opción 2: Si tu distribuidora permite configurar exclusiones de Content ID, puedes registrarla asegurándote de incluir en la Lista Blanca (Whitelist) los canales de los artistas que licenciaron el beat previamente (nosotros podemos proveerte la lista de enlaces de canales registrados si nos lo solicitas).

Si registras la canción sin estas precauciones y se generan reclamos masivos contra los antiguos licenciatarios, nuestro departamento legal te solicitará remover el contenido de la base de datos de huellas digitales de inmediato.

Agradecemos tu cooperación para mantener la integridad de nuestra comunidad de creadores. Si tienes alguna pregunta adicional sobre cómo configurar tu distribución, estamos para ayudarte.

Atentamente,
Equipo Legal y Soporte, BEATSS
```

---

### Plantilla C: Actualización de Licencia por Límite de Streams Alcanzado
* **Caso**: Un artista recibió una alerta de que su canción bajo licencia Básica o Premium superó el límite de reproducciones permitido.

```text
Asunto: ¡Felicidades por tu éxito! Es momento de actualizar tu licencia en BEATSS

Hola [Nombre del Artista],

Nos hemos percatado de que tu canción "[Nombre de tu Canción]", construida sobre nuestro beat "[Nombre del Beat]", está teniendo un excelente rendimiento y se aproxima (o ha superado) el límite de reproducciones comerciales permitido por tu Licencia [Básica / Premium] ([Límite_Streams] streams).

¡Queremos felicitarte por este gran hito! Lograr este alcance es una muestra de tu talento.

Para que tu música siga sonando en todas las plataformas digitales sin interrupciones ni reclamos contractuales, es necesario realizar una actualización (upgrade) de tu licencia. Al actualizar tu licencia, solo pagas la diferencia de precio y mantienes la vigencia de tus derechos comerciales actualizados:

* **Opción Recomendada: Premium Plus (Streams Ilimitados)**: Recibe los Stems/Trackouts del beat para mejorar la mezcla de tu show en vivo o nuevas versiones, y elimina para siempre los límites de reproducción.
* **Precio de actualización**: Solamente pagarás la diferencia entre tu licencia actual y la nueva ([Diferencia_Precio] USD).

Para proceder con la actualización, simplemente:
1. Inicia sesión en tu cuenta de BEATSS.
2. Ve a la sección "Mis Licencias Adquiridas".
3. Haz clic en el botón "Mejorar Licencia" al lado de "[Nombre del Beat]".
4. Elige tu nueva licencia y completa el pago. Tu nuevo contrato se generará automáticamente.

Si necesitas asistencia personalizada con este proceso, responde a este correo y nuestro equipo te guiará paso a paso.

¡Sigue rompiendo récords!

Atentamente,
Soporte de Éxito del Artista, BEATSS
```

---

## 5. Plan de Implementación Tecnológica en Frontend
Para llevar a cabo estas mejoras de forma integrada en la interfaz web de BEATSS, se recomiendan las siguientes modificaciones de código:

### A. Modificación en `index.html` (Inserción del Acordeón de FAQs)
Reemplazar el enlace del footer `footer_help_center` por un disparador de un modal interactivo de ayuda, o crear una sección de FAQs interactiva con HTML semántico usando `<details>` y `<summary>` en la sección de inicio o en un panel lateral.
Ejemplo de estructura HTML propuesta:
```html
<div id="help-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div class="bg-charcoal-deep border border-white/10 rounded-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[85vh]">
        <div class="flex justify-between items-center mb-6">
            <h3 class="font-headline-lg text-on-surface">Centro de Ayuda y FAQs</h3>
            <button onclick="toggleHelpModal(false)" class="text-on-surface-variant hover:text-on-surface">
                <i data-lucide="x" class="w-6 h-6"></i>
            </button>
        </div>
        <div class="space-y-4">
            <!-- FAQ 1 -->
            <details class="bg-surface-container border border-white/5 rounded-lg p-4 cursor-pointer group">
                <summary class="font-bold text-on-surface flex justify-between items-center">
                    ¿Cuál es la diferencia entre una licencia No Exclusiva y una Exclusiva?
                    <i data-lucide="chevron-down" class="w-5 h-5 transition-transform group-open:rotate-180"></i>
                </summary>
                <p class="text-on-surface-variant mt-2 text-sm leading-relaxed">
                    Las licencias no exclusivas otorgan derechos limitados de uso mientras el productor puede seguir vendiendo el beat. La licencia exclusiva otorga la propiedad y retira el beat de la tienda para siempre.
                </p>
            </details>
            <!-- Más FAQs y enlaces a la Guía Educativa -->
        </div>
    </div>
</div>
```

### B. Modificación en `i18n.js`
Inyectar todas las cadenas de texto correspondientes en español e inglés para que las preguntas y respuestas sean completamente localizables y mantengan la coherencia con el resto de la app multilingüe.
