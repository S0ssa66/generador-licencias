export const LICENSE_CONFIGS = {
    basic: {
        name: "Básica",
        price: 30.00,
        formats: "MP3",
        streams: "40,000",
        physical: "500",
        videos: "un (1) video",
        videoDuration: "5 minutos",
        years: "5 años",
        writerShare: 50,
        producerShare: 50,
        contentId: true,
        credits: '"Producido por sossa" o "Prod. por sossa"'
    },
    premium: {
        name: "Premium",
        price: 60.00,
        formats: "MP3 y WAV",
        streams: "100,000",
        physical: "3,000",
        videos: "dos (2) videos",
        videoDuration: "10 minutos",
        years: "10 años",
        writerShare: 50,
        producerShare: 50,
        contentId: true,
        credits: '"Producido por sossa" o "Prod. por sossa"'
    },
    premium_plus: {
        name: "Premium Plus",
        price: 100.00,
        formats: "MP3, WAV y Stems (Trackouts)",
        streams: "100,000,000 (Ilimitados)",
        physical: "Ilimitadas",
        videos: "Ilimitados",
        videoDuration: "Ilimitada",
        years: "10 años",
        writerShare: 50,
        producerShare: 50,
        contentId: true,
        credits: '"Producido por sossa" o "Prod. por sossa"'
    },
    unlimited_flp: {
        name: "Ilimitada (STEMS + FLP)",
        price: 200.00,
        formats: "MP3, WAV, Stems de la pista y Proyecto FLP",
        streams: "100,000,000 (Ilimitados)",
        physical: "Ilimitadas",
        videos: "Ilimitados",
        videoDuration: "Ilimitada",
        years: "10 años",
        writerShare: 50,
        producerShare: 50,
        contentId: true,
        credits: '"Producido por sossa" o "Prod. por sossa"'
    },
    exclusive: {
        name: "Exclusiva",
        price: 500.00,
        formats: "MP3, WAV y Stems (Trackouts) con archivos máster",
        streams: "Ilimitados",
        physical: "Ilimitadas",
        videos: "Ilimitados",
        videoDuration: "Ilimitada",
        years: "Perpetua / De por vida",
        writerShare: 50,
        producerShare: 50,
        contentId: false,
        credits: '"Producido por sossa" o "Prod. por sossa"'
    }
};

export const SUBSCRIPTION_CONFIGS = {
    creator: {
        id: "creator",
        name: "Plan Creador",
        price: 9.99,
        period: "Mensual",
        downloadsLimit: 5,
        licenseType: "basic",
        desc: "Acceso a 5 descargas mensuales bajo Licencia Básica. Ideal para nuevos artistas."
    },
    pro_artist: {
        id: "pro_artist",
        name: "Plan Artista Pro",
        price: 19.99,
        period: "Mensual",
        downloadsLimit: 15,
        licenseType: "premium",
        desc: "Acceso a 15 descargas mensuales bajo Licencia Premium. Ideal para cantantes activos."
    }
};

export const SEED_LICENSES = [
    {
        refCode: "BSGUEST_0413063001733767700_1750860020567910",
        date: "2025-06-06",
        beatName: "Mami",
        buyerName: "Hernán Jair Nogales Pupiales",
        type: "premium",
        value: 60,
        paymentMethod: "Transferencia Bancaria",
        formData: {
            buyerId: "",
            buyerEmail: "",
            buyerPhone: "",
            buyerCity: "Santo Domingo",
            buyerCountry: "Ecuador",
            celebrationPlace: "Esmeraldas, Ecuador",
            formats: "MP3 y WAV",
            streams: "100,000",
            physical: "3,000",
            videos: "2",
            videoDuration: "cinco (5) minutos",
            years: "diez (10) años",
            terminationFee: "200% ($120.00 USD)",
            writerShare: 50,
            producerShare: 50,
            credits: "\"Producido por sossa\" o \"Prod. por sossa\"",
            contentId: true
        }
    },
    {
        refCode: "CANDY-BASIC-20250310-YEPEZ",
        date: "2025-03-10",
        beatName: "Candy",
        buyerName: "Milton Andres Yepez Rosero",
        type: "basic",
        value: 100,
        paymentMethod: "Transferencia Bancaria",
        formData: {
            buyerId: "",
            buyerEmail: "",
            buyerPhone: "",
            buyerCity: "",
            buyerCountry: "Ecuador",
            celebrationPlace: "",
            formats: "MP3 y WAV",
            streams: "500,000",
            physical: "2,000",
            videos: "1",
            videoDuration: "cinco (5) minutos",
            years: "diez (10) años",
            terminationFee: "200% ($200.00 USD)",
            writerShare: 50,
            producerShare: 50,
            credits: "\"Produced by Sossa\"",
            contentId: true
        }
    },
    {
        refCode: "EXCL-BANDIDAJE-TRIP-20240101-ELVIS",
        date: "2024-01-01",
        beatName: "Bandidaje & Trip",
        buyerName: "Elvis Alberto Lopez Troya",
        type: "exclusive",
        value: 450,
        paymentMethod: "Transferencia Bancaria",
        formData: {
            buyerId: "",
            buyerEmail: "",
            buyerPhone: "",
            buyerCity: "Quito",
            buyerCountry: "Ecuador",
            celebrationPlace: "Quito, Ecuador",
            formats: "MP3 y WAV",
            streams: "Ilimitado (Exclusiva)",
            physical: "Ilimitado (Exclusiva)",
            videos: "Ilimitado",
            videoDuration: "Sin límite",
            years: "Perpetuo",
            terminationFee: "No aplica (Exclusivo)",
            writerShare: 90,
            producerShare: 10,
            credits: "\"Producido por Sossa\"",
            contentId: false
        }
    }
];

export const DEFAULT_TEMPLATES = [
    {
        id: "licencia_uso",
        name: "Licencia de Uso Comercial",
        markdown: `# {{producer_aka}}: Licencia {{license_type}} de Uso Musical
## Contrato de Licencia {{license_exclusivity}} para la Explotación de la Obra "{{beat_name}}"

---

### Información General del Documento
* **Código de Referencia:** Invoice # {{ref_code}}
* **Fecha de Entrada en Vigor:** {{effective_date}}
* **Lugar de Celebración:** {{celebration_place}}
* **Método de Pago:** {{payment_method}}

---

## Partes Intervinientes
El presente Contrato de Licencia {{license_type}} {{license_exclusivity}} (en adelante, el "Contrato") se celebra y declara en vigor entre las siguientes partes:

1. **El Licenciante (Productor):** {{producer_name}}, conocido profesionalmente en la industria musical como **{{producer_aka}}** (en adelante, el "Productor"), con documento de identidad Nro. {{producer_id}}, con correo electrónico de contacto: {{producer_email}} y teléfono/WhatsApp: {{producer_phone}}.
2. **El Licenciatario (Usuario):** {{buyer_name}}, con documento de identidad Nro. {{buyer_id}}, con domicilio legal registrado en la ciudad de {{buyer_city}}, {{buyer_country}}, con correo electrónico de contacto registrado en la plataforma como: {{buyer_email}} y teléfono/WhatsApp: {{buyer_phone}} (en adelante, el "Licenciatario").

Ambas partes de mutuo acuerdo y con plena capacidad legal para obligarse, suscriben las cláusulas y condiciones detalladas a continuación en el presente instrumento jurídico.

---

## Cláusulas Contractuales

### Cláusula 1. Objeto del Contrato y Tarifa de Licencia
El presente Contrato regula los términos, limitaciones y derechos otorgados sobre el archivo de audio instrumental de propiedad exclusiva del Productor titulado **"{{beat_name}}"** (en adelante, el "Beat").

El otorgamiento de dichos derechos se ejecuta en consideración al pago único e inmediato por parte del Licenciatario de la cantidad de **\${{license_value}} USD** ({{license_value_letters}} dólares de los Estados Unidos de América), denominada como la "Tarifa de Licencia". Los derechos aquí descritos están estrictamente condicionados al pago oportuno y completo de dicha tarifa; el presente documento carece de validez legal si el pago no ha sido procesado de manera efectiva.

### Cláusula 2. Entrega del Material Musical
* **2.1. Formatos de Entrega:** El Licenciante se compromete a entregar el Beat en archivos de audio de alta calidad comercial bajo los formatos **{{clause_formats}}**, de acuerdo con los estándares técnicos vigentes en la industria fonográfica.
* **2.2. Método de Envío:** El Licenciante ejecutará los esfuerzos comerciales pertinentes para remitir el material al Licenciatario de forma inmediata tras la validación del pago. Los archivos se enviarán vía correo electrónico o mediante un enlace directo de descarga digital segura.

### Cláusula 3. Plazo de Vigencia (Término)
La vigencia de los derechos otorgados en esta licencia será de **{{clause_years}}** contados a partir de la Fecha de Entrada en Vigor. {{clause_rescission_rules}}

### Cláusula 4. Derechos de Uso y Límites de Explotación Comercial
A cambio del pago de la Tarifa de Licencia, el Productor otorga una licencia limitada, mundial, {{license_exclusivity_lower}} y no transferible para incorporar el Beat en la creación de **una (1) nueva canción derivada** (en adelante, la "Nueva Canción"). El Licenciatario podrá registrar sus propias líricas y voz sobre el Beat, así como modificar la estructura, tempo, tono y longitud del mismo para adaptarlo a su interpretación musical.

La explotación de la Nueva Canción queda sujeta a los siguientes topes y restricciones cuantitativas:
* **Transmisión de Audio Digital (Streaming):** Se autoriza un máximo de **{{clause_streams}}** reproducciones de audio monetizadas en plataformas digitales de distribución (tales como Spotify, Apple Music, Deezer o Amazon Music).
* **Copias Físicas y Descargas Pagadas:** Se permite la fabricación, venta y distribución de hasta **{{clause_physical}}** copias físicas (formatos CD, Vinilo, Casete) o descargas permanentes pagadas a través de tiendas en línea.
* **Distribución Gratuita:** Se permite un número ilimitado de descargas digitales gratuitas sin fines de lucro.
* **Regalías Fonográficas (Master Royalties):** Salvo que se disponga de otra manera en un Acuerdo de Distribución de Regalías (Split Sheet) anexo, el Licenciatario tendrá derecho a percibir el 100% de los ingresos netos derivados de la explotación de la grabación sonora (Master) de la Nueva Canción en plataformas de distribución digital (Spotify, Apple Music, etc.) hasta el límite cuantitativo de reproducciones estipulado en este contrato.

Si el Licenciatario excede cualquiera de estos límites de reproducción o ventas, la presente licencia se considerará saturada y el Licenciatario estará obligado a adquirir una licencia comercial de rango superior (*upgrade*) para continuar explotando la obra.

### Cláusula 5. Sincronización Audiovisual
* **5.1. Margen de Sincronización:** Se concede al Licenciatario el derecho no exclusivo de sincronizar la Nueva Canción con imágenes en movimiento para la creación de un máximo de **{{clause_videos}}** independientes (Videos).
* **5.2. Duración y Difusión:** Cada Video no podrá exceder los **{{clause_video_duration}}** de duración en pantalla (o la duración total de la Nueva Canción si esta fuera mayor). Dichos videos podrán ser distribuídos en redes sociales y plataformas de video digital públicas (como YouTube y Vevo).
* **5.3. Restricciones Mayores:** Queda expresamente prohibida la sincronización del Beat o de la Nueva Canción en producciones de cine, cortometrajes, programas de televisión, videojuegos o comerciales publicitarios de marcas de consumo masivo, salvo acuerdo y licenciamiento independiente con el Productor.

### Cláusula 6. Restricciones de Uso y Prohibición de Content ID / Registro Digital
El Licenciatario se compromete de forma absoluta a cumplir las siguientes prohibiciones operativas:
* **6.1. Intransferibilidad:** Los derechos otorgados en este contrato son personalísimos y no pueden ser vendidos, cedidos, sublicenciados o transferidos a ningún tercero o sello discográfico sin el consentimiento previo por escrito del Productor.
* **6.2. Prohibición de Registro en Sistemas de Huella Digital (Content ID):** {{clause_content_id_rules}}

### Cláusula 7. Propiedad Intelectual y Derechos de Autor (Publishing)
* **7.1. Propiedad del Master Original:** El Productor retiene la propiedad absoluta, exclusiva y total sobre los derechos de autor del Beat, sus composiciones musicales subyacentes y su grabación sonora original. El Licenciatario bajo ninguna circunstancia registrará o intentará registrar el Beat o la Nueva Canción ante la Oficina de Derechos de Autor local o internacional como obra propia instrumental.
* **7.2. Derechos de Composición (Writer's Share):** En lo relativo a la obra musical resultante (la Nueva Canción), se establece un porcentaje de división de autoría del **{{clause_writer_share}}% para el Licenciatario ({{buyer_name}})** por sus letras y aportes originales, y un **{{clause_producer_share}}% para el Licenciante ({{producer_name}} / {{producer_aka}})** por la composición musical del Beat (afiliado a la sociedad de gestión **{{producer_pro}}** con número IPI **{{producer_ipi}}** y co-publicado a través de **{{producer_publisher}}**). Este porcentaje aplicará a todas las regalías de composición, incluyendo de manera enunciativa mas no limitativa, regalías mecánicas, regalías de ejecución pública (desempeño / comunicación pública) y regalías de sincronización digital.
* **7.3. Derechos de Edición (Publisher's Share):** El Productor poseerá y administrará de forma exclusiva su parte correspondiente de los derechos de edición (Publisher's Share) de la composición musical (equivalente a su porcentaje de participación del **{{clause_producer_share}}%**). Si el Licenciatario realiza el registro de la obra ante su respectiva Sociedad de Gestión Colectiva o PRO (v.g., SAYCO, BMI, ASCAP, SGAE), está obligado por ley a inscribir de forma simultánea la participación y datos del Productor.
* **7.4. Regalías Mecánicas (Mechanical Royalties):** El pago de la Tarifa de Licencia constituye una licencia de reproducción mecánica pagada únicamente para el número autorizado de copias físicas y descargas permanentes establecido en este contrato. En caso de exceder dichos límites o de requerirse por ley, el Licenciatario deberá pagar las regalías mecánicas adicionales correspondientes a la tasa legal vigente en favor del Productor.

### Cláusula 8. Crédito Obligatorio
El Licenciatario mantendrá la obligación comercial y moral de otorgar los créditos correspondientes al Productor en cualquier formato físico, digital o audiovisual donde la Nueva Canción sea expuesta al público. El formato de acreditación estandarizado y mandatorio deberá ser:
> **{{clause_credits}}**

### Cláusula 9. Opción de Rescisión del Licenciante (Cláusula de Salvaguarda)
El Licenciante se reserva la facultad discrecional y la opción exclusiva, ejecutable dentro de los primeros **tres (3) años** a partir de la firma de este Contrato, de dar por terminado el presente acuerdo de forma anticipada y unilateral mediante notificación escrita. Para que esta rescisión surta efecto, el Licenciante pagará al Licenciatario una indemnización equivalente al **{{clause_termination_fee}}**. Tras la notificación y el pago de dicha penalidad, el Licenciatario dispondrá de un plazo máximo de siete (7) días para dar de baja y retirar la Nueva Canción de todos los canales de distribución físicos y digitales del mercado. El Licenciatario acepta expresamente que el pago de dicha penalidad constituye una indemnización total, única y final por la terminación del contrato, y renuncia irrevocablemente a reclamar cualquier otro valor, compensación o indemnización por concepto de daños, pérdidas, gastos de promoción, marketing, producción de videoclips o cualquier otra inversión realizada en relación con la Nueva Canción.

### Cláusula 10. Incumplimiento y Penalizaciones
Cualquier violación directa o indirecta a las cláusulas descritas en este documento facultará al Productor a rescindir la licencia de manera inmediata y sin derecho a reembolsos. El Licenciatario será civil y económicamente responsable de todos los daños, perjuicios, costos legales, honorarios de abogados y gastos judiciales en los que incurra el Productor con el fin de defender sus derechos de propiedad intelectual frente a un uso no autorizado de la obra musical.

### Cláusula 11. Ley Aplicable, Jurisdicción y Competencia
Este acuerdo se rige de forma exclusiva por las leyes de la República del Ecuador. Para cualquier controversia, litigio o reclamación derivada de la interpretación, validez o ejecución de este Contrato, las partes renuncian expresamente a cualquier otro fuero que por domicilio les corresponda y se someten expresamente a la jurisdicción de los jueces y **tribunales competentes de la ciudad de {{jurisdiction_city}}**.

### Cláusula 12. Consentimiento, Aceptación por Acto de Pago y Medidas de Seguridad
Las partes acuerdan que el presente contrato puede ser formalizado de manera física, digital o mediante firmas escaneadas intercambiadas por medios electrónicos.
No obstante, en caso de no mediar una firma manuscrita, el Licenciatario declara haber leído este documento y manifiesta su **aceptación tácita, consentimiento legal y ratificación absoluta** de todos y cada uno de los términos aquí descritos mediante la ejecución del pago de la Tarifa de Licencia (\${{license_value}} USD) y la recepción conforme de los archivos musicales del Beat.

Como medida de seguridad e integridad contractual, este documento incorpora el logotipo oficial de **{{producer_aka}}** en marca de agua y un código de referencia único Invoice # **{{ref_code}}**. La remoción, ocultamiento o alteración digital de cualquiera de estos elementos de seguridad anula de forma automática e inmediata la validez de la presente licencia y los derechos de explotación sobre el Beat.`,
        markdown_en: `# {{producer_aka}}: {{license_type}} Music License Agreement
## {{license_exclusivity}} License Agreement for the Exploitation of the Work "{{beat_name}}"

---

### General Document Information
* **Reference Code:** Invoice # {{ref_code}}
* **Effective Date:** {{effective_date}}
* **Place of Celebration:** {{celebration_place}}
* **Payment Method:** {{payment_method}}

---

## Intervening Parties
This {{license_type}} {{license_exclusivity}} License Agreement (hereinafter, the "Agreement") is entered into and declared in force by and between the following parties:

1. **The Licensor (Producer):** {{producer_name}}, professionally known in the music industry as **{{producer_aka}}** (hereinafter, the "Producer"), with ID/Passport No. {{producer_id}}, contact email: {{producer_email}}, and phone/WhatsApp: {{producer_phone}}.
2. **The Licensee (User):** {{buyer_name}}, with ID/Passport No. {{buyer_id}}, registered legal address in the city of {{buyer_city}}, {{buyer_country}}, contact email registered on the platform: {{buyer_email}}, and phone/WhatsApp: {{buyer_phone}} (hereinafter, the "Licensee").

Both parties, by mutual agreement and with full legal capacity to bind themselves, subscribe to the clauses and conditions detailed below in this legal instrument.

---

## Contractual Clauses

### Clause 1. Object of the Contract and License Fee
This Agreement regulates the terms, limitations, and rights granted over the instrumental audio file of exclusive property of the Producer titled **"{{beat_name}}"** (hereinafter, the "Beat").

The granting of these rights is executed in consideration of the single and immediate payment by the Licensee of the amount of **\${{license_value}} USD** ({{license_value_letters}} United States Dollars), referred to as the "License Fee". The rights described herein are strictly conditioned upon the timely and complete payment of said fee; this document lacks legal validity if the payment has not been effectively processed.

### Clause 2. Delivery of Musical Material
* **2.1. Formats of Delivery:** The Licensor agrees to deliver the Beat in high-quality commercial audio files under the formats **{{clause_formats}}**, in accordance with current technical standards in the phonographic industry.
* **2.2. Shipping Method:** The Licensor will execute relevant commercial efforts to send the material to the Licensee immediately after payment validation. The files will be sent via email or through a secure direct digital download link.

### Clause 3. Term of Validity
The validity of the rights granted in this license will be **{{clause_years}}** from the Effective Date. {{clause_rescission_rules}}

### Clause 4. Rights of Use and Limits of Commercial Exploitation
In exchange for the payment of the License Fee, the Producer grants a limited, worldwide, {{license_exclusivity_lower}}, and non-transferable license to incorporate the Beat in the creation of **one (1) new derivative song** (hereinafter, the "New Song"). The Licensee may record their own lyrics and vocals over the Beat, as well as modify its structure, tempo, pitch, and length to adapt it to their musical interpretation.

The exploitation of the New Song is subject to the following quantitative limits and restrictions:
* **Digital Audio Streaming:** A maximum of **{{clause_streams}}** monetized audio streams is authorized on digital distribution platforms (such as Spotify, Apple Music, Deezer, or Amazon Music).
* **Physical Copies and Paid Downloads:** The manufacture, sale, and distribution of up to **{{clause_physical}}** physical copies (CD, Vinyl, Cassette formats) or permanent paid downloads through online stores is permitted.
* **Free Distribution:** An unlimited number of free non-profit digital downloads is permitted.
* **Phonographic Royalties (Master Royalties):** Unless otherwise provided in an attached Royalty Distribution Agreement (Split Sheet), the Licensee will be entitled to receive 100% of the net income derived from the exploitation of the sound recording (Master) of the New Song on digital distribution platforms (Spotify, Apple Music, etc.) up to the quantitative limit of streams stipulated in this contract.

If the Licensee exceeds any of these reproduction or sales limits, this license will be considered saturated and the Licensee will be required to purchase a higher-tier commercial license (*upgrade*) to continue exploiting the work.

### Clause 5. Audiovisual Synchronization
* **5.1. Synchronization Scope:** The Licensee is granted the non-exclusive right to synchronize the New Song with moving images for the creation of a maximum of **{{clause_videos}}** independent videos (Videos).
* **5.2. Duration and Broadcast:** Each Video may not exceed **{{clause_video_duration}}** of screen duration (or the total duration of the New Song if it is longer). Such videos may be distributed on social networks and public digital video platforms (such as YouTube and Vevo).
* **5.3. Major Restrictions:** The synchronization of the Beat or the New Song in film productions, short films, television programs, video games, or commercial advertisements of mass consumer brands is expressly prohibited, except by independent agreement and licensing with the Producer.

### Clause 6. Restrictions of Use and Prohibition of Content ID / Digital Registration
The Licensee absolutely agrees to comply with the following operational prohibitions:
* **6.1. Non-transferability:** The rights granted in this contract are personal and cannot be sold, assigned, sublicensed, or transferred to any third party or record label without the prior written consent of the Producer.
* **6.2. Digital Registration (Content ID):** {{clause_content_id_rules}}

### Clause 7. Intellectual Property and Copyright (Publishing)
* **7.1. Ownership of the Original Master:** The Producer retains absolute, exclusive, and total ownership over the copyright of the Beat, its underlying musical compositions, and its original sound recording. The Licensee will under no circumstances register or attempt to register the Beat or the New Song with the local or international Copyright Office as their own instrumental work.
* **7.2. Composition Rights (Writer's Share):** Concerning the resulting musical work (the New Song), a division of authorship percentage is established of **{{clause_writer_share}}% for the Licensee ({{buyer_name}})** for their lyrics and original contributions, and **{{clause_producer_share}}% for the Licensor ({{producer_name}} / {{producer_aka}})** for the musical composition of the Beat (affiliated with the performance rights organization **{{producer_pro}}** under IPI number **{{producer_ipi}}** and co-published through **{{producer_publisher}}**). This percentage will apply to all publishing royalties, including but not limited to mechanical royalties, public performance royalties, and digital synchronization royalties.
* **7.3. Publishing Rights (Publisher's Share):** The Producer will exclusively own and administer their corresponding share of the publishing rights (Publisher's Share) of the musical composition (equivalent to their **{{clause_producer_share}}%** participation share). If the Licensee registers the work with their respective Collective Management Organization or PRO (e.g., SAYCO, BMI, ASCAP, SGAE), they are required by law to simultaneously register the Producer's participation and details.
* **7.4. Mechanical Royalties:** The payment of the License Fee constitutes a mechanical reproduction license paid only for the authorized number of physical copies and permanent downloads established in this contract. In case of exceeding these limits or as required by law, the Licensee must pay additional mechanical royalties at the current legal rate in favor of the Producer.

### Clause 8. Mandatory Credit
The Licensee will maintain the commercial and moral obligation to grant corresponding credits to the Producer in any physical, digital, or audiovisual format where the New Song is exposed to the public. The standardized and mandatory credit format must be:
> **{{clause_credits}}**

### Clause 9. Licensor's Termination Option (Safeguard Clause)
The Licensor reserves the discretionary power and exclusive option, executable within the first **three (3) years** from the signing of this Contract, to terminate this agreement early and unilaterally by written notice. For this termination to take effect, the Licensor will pay the Licensee compensation equivalent to **{{clause_termination_fee}}**. Following notification and payment of said penalty, the Licensee will have a period of seven (7) days to take down and withdraw the New Song from all physical and digital distribution channels in the market. The Licensee expressly agrees that the payment of said penalty constitutes a full, sole, and final compensation for the termination of the agreement, and irrevocably waives the right to claim any other value, compensation, or damages for promotion, marketing, video production expenses, or any other investment made in connection with the New Song.

### Clause 10. Breach and Penalties
Any direct or indirect violation of the clauses described in this document will entitle the Producer to terminate the license immediately and without right to refunds. The Licensee will be civilly and financially responsible for all damages, losses, legal costs, attorney fees, and court expenses incurred by the Producer to defend their intellectual property rights against unauthorized use of the musical work.

### Clause 11. Applicable Law, Jurisdiction, and Competence
This agreement is governed exclusively by the laws of the Republic of Ecuador. For any controversy, litigation, or claim arising from the interpretation, validity, or execution of this Contract, the parties expressly waive any other jurisdiction that may correspond to them by reason of their domicile and expressly submit to the jurisdiction of the competent judges and **courts of the city of {{jurisdiction_city}}**.

### Clause 12. Consent, Acceptance by Payment Act, and Security Measures
The parties agree that this contract may be executed physically, digitally, or via scanned signatures exchanged by electronic means.
However, in the absence of a handwritten signature, the Licensee declares to have read this document and expresses their **tacit acceptance, legal consent, and absolute ratification** of each and every one of the terms described herein by executing the payment of the License Fee (\${{license_value}} USD) and the conforming receipt of the Beat musical files.

As a measure of security and contractual integrity, this document incorporates the official logo of **{{producer_aka}}** as a watermark and a unique reference code Invoice # **{{ref_code}}**.`
    },
    {
        id: "split_sheet",
        name: "Split Sheet (Regalías)",
        markdown: `# {{producer_aka}}: Acuerdo de Split Sheet (Distribución de Regalías)
## Declaración y Asignación de Splits para la Canción Co-escrita sobre el Instrumental "{{beat_name}}"

---

### Información General del Documento
* **Código de Referencia:** Invoice # {{ref_code}}
* **Fecha de Celebración:** {{effective_date}}
* **Lugar de Celebración:** {{celebration_place}}

---

Este documento (en adelante, el "Acuerdo de Splits") confirma los porcentajes de participación acordados de buena fe y autoría compartida sobre la obra musical titulada tentativamente como la "Nueva Canción", la cual incorpora el archivo de audio instrumental creado por el Productor titulado **"{{beat_name}}"**.

---

## 1. Splits de Composición y Autoría (Publishing Splits)
Las partes declaran ante sus respectivas sociedades de gestión de derechos de autor (PROs) los siguientes porcentajes irrevocables por la composición de la obra musical:

1. **{{producer_name}} (Afiliado/AKA: {{producer_aka}})**
   - **Participación (Compositor/Música):** {{clause_producer_share}}%
   - **Sociedad de Gestión:** {{producer_pro}}
   - **Código IPI:** {{producer_ipi}}
   - **Casa Editora / Administradora:** {{producer_publisher}}

2. **{{buyer_name}} (Afiliado/AKA: Escritor/Artista)**
   - **Participación (Autor/Letra/Voz):** {{clause_writer_share}}%
   - **Documento de Identidad:** {{buyer_id}}
   - **Sociedad de Gestión:** Registrada de forma independiente

## 2. Splits de Grabación Sonora (Master Splits)
Cualquier ingreso comercial derivado de la venta o reproducción de la grabación sonora maestra (streaming en Spotify, Apple Music, descargas digitales, etc.) administrada por el Licenciatario a través de distribuidoras digitales (como DistroKid, TuneCore, etc.) se dividirá de la siguiente manera:
- **Asignación del Artista/Licenciatario:** {{clause_writer_share}}% de los ingresos netos recibidos.
- **Asignación del Productor/Licenciante:** {{clause_producer_share}}% de los ingresos netos recibidos.

El Licenciatario se obliga a configurar esta división (*splits*) de manera formal directa en su plataforma de distribución digital dentro de los 7 días posteriores a la carga de la Nueva Canción.

**Cláusula de Prevalencia:** En caso de conflicto o contradicción entre los términos de la Licencia de Uso Comercial principal y el presente Acuerdo de Splits, prevalecerán las divisiones y porcentajes de distribución de Master y Composición aquí estipulados.

## 3. Créditos Obligatorios
En cualquier medio digital, físico o red social, se otorgará el crédito de coproducción de la siguiente manera obligatoria:
> **{{clause_credits}}**`,
        markdown_en: `# {{producer_aka}}: Split Sheet Agreement (Royalty Distribution)
## Declaration and Assignment of Splits for the Co-written Song over the Instrumental "{{beat_name}}"

---

### General Document Information
* **Reference Code:** Invoice # {{ref_code}}
* **Effective Date:** {{effective_date}}
* **Place of Celebration:** {{celebration_place}}

---

This document (hereinafter, the "Split Agreement") confirms the participation percentages agreed in good faith and shared authorship over the musical work tentatively titled "New Song", which incorporates the instrumental audio file created by the Producer titled **"{{beat_name}}"**.

---

## 1. Composition and Publishing Splits
The parties declare before their respective performance rights organizations (PROs) the following irrevocable percentages for the composition of the musical work:

1. **{{producer_name}} (Affiliated/AKA: {{producer_aka}})**
   - **Participation (Composer/Music):** {{clause_producer_share}}%
   - **Performance Rights Organization:** {{producer_pro}}
   - **IPI Code:** {{producer_ipi}}
   - **Publisher / Administrator:** {{producer_publisher}}

2. **{{buyer_name}} (Affiliated/AKA: Writer/Artist)**
   - **Participation (Author/Lyrics/Vocals):** {{clause_writer_share}}%
   - **ID/Passport No.:** {{buyer_id}}
   - **Performance Rights Organization:** Registered independently

## 2. Sound Recording Splits (Master Splits)
Any commercial income derived from the sale or reproduction of the master sound recording (streaming on Spotify, Apple Music, digital downloads, etc.) administered by the Licensee through digital distributors (such as DistroKid, TuneCore, etc.) will be divided as follows:
- **Artist/Licensee Share:** {{clause_writer_share}}% of net revenues received.
- **Producer/Licensor Share:** {{clause_producer_share}}% of net revenues received.

The Licensee agrees to formally set up this division (*splits*) directly on their digital distribution platform within 7 days of uploading the New Song.

**Prevalence Clause:** In the event of any conflict or contradiction between the terms of the main Commercial License Agreement and this Split Sheet Agreement, the splits and distribution percentages set forth herein shall prevail.

## 3. Mandatory Credit
In any digital, physical medium or social network, co-production credit must be granted in the following mandatory format:
> **{{clause_credits}}**`
    },
    {
        id: "coproduccion",
        name: "Acuerdo de Coproducción",
        markdown: `# {{producer_aka}}: Acuerdo de Co-producción y Colaboración Musical
## Contrato de Coproducción para la Obra "{{beat_name}}"

---

### Información General del Documento
* **Código de Referencia:** Invoice # {{ref_code}}
* **Fecha de Celebración:** {{effective_date}}
* **Lugar de Celebración:** {{celebration_place}}

---

Este contrato establece la colaboración y coproducción de la obra musical titulada **"{{beat_name}}"** entre:

1. **Productor Principal:** {{producer_name}} (AKA: **{{producer_aka}}**), con documento de identidad Nro. {{producer_id}}.
2. **Coproductor / Colaborador:** {{buyer_name}}, con documento de identidad Nro. {{buyer_id}}.

---

## Cláusulas de Colaboración

### 1. Objeto de la coproducción
El Coproductor y el Productor Principal colaboran en la finalización de los archivos de audio instrumental titulados **"{{beat_name}}"**. Las partes combinan sus elementos creativos individuales (ideas, melodías, ritmos, acordes y stems) para crear una grabación maestra fonográfica unificada.

### 2. Tarifas y Compensación Inicial
En consideración al trabajo aportado por el Coproductor, se acuerda el pago inicial de **\${{license_value}} USD** ({{license_value_letters}} dólares de los Estados Unidos de América).

### 3. Derechos sobre la composición musical y master
Los derechos comerciales y regalías de la obra resultante se distribuyen de la siguiente manera:
- **Asignación del Productor Principal ({{producer_aka}}):** {{clause_producer_share}}% de todos los derechos y regalías de autor, edición y master.
- **Asignación del Coproductor ({{buyer_name}}):** {{clause_writer_share}}% de todos los derechos y regalías de autor, edición y master.

Ambas partes se registran ante sus respectivas sociedades de autor registrando sus porcentajes correspondientes.

### 4. Administración Comercial de la Obra
El Coproductor otorga mandato exclusivo al Productor Principal para que este administre, licencie, venda y comercialice licencias no exclusivas sobre la obra instrumental co-producida a través de plataformas digitales (v.g., BEATSS, BeatStars). El Productor Principal se obliga irrevocablemente a liquidar y transferir al Coproductor su porcentaje de participación acordado del {{clause_writer_share}}% sobre las ventas recaudadas de forma trimestral.

### 5. Acreditación de Coproducción
Los créditos de la composición resultante se listarán siempre de la siguiente manera:
> **{{clause_credits}}**`,
        markdown_en: `# {{producer_aka}}: Co-production and Musical Collaboration Agreement
## Co-production Agreement for the Work "{{beat_name}}"

---

### General Document Information
* **Reference Code:** Invoice # {{ref_code}}
* **Effective Date:** {{effective_date}}
* **Place of Celebration:** {{celebration_place}}

---

This agreement establishes the collaboration and co-production of the musical work titled **"{{beat_name}}"** between:

1. **Principal Producer:** {{producer_name}} (AKA: **{{producer_aka}}**), with ID/Passport No. {{producer_id}}.
2. **Co-producer / Collaborator:** {{buyer_name}}, with ID/Passport No. {{buyer_id}}.

---

## Collaboration Clauses

### 1. Object of the Co-production
The Co-producer and the Principal Producer collaborate in finishing the instrumental audio files titled **"{{beat_name}}"**. The parties combine their individual creative elements (ideas, melodies, rhythms, chords, and stems) to create a unified phonographic master recording.

### 2. Fees and Initial Compensation
In consideration of the work provided by the Co-producer, an initial payment of **\${{license_value}} USD** ({{license_value_letters}} United States Dollars) is agreed.

### 3. Rights to the Musical Composition and Master
Commercial rights and royalties of the resulting work are distributed as follows:
- **Principal Producer Share ({{producer_aka}}):** {{clause_producer_share}}% of all author, publishing, and master rights and royalties.
- **Co-producer Share ({{buyer_name}}):** {{clause_writer_share}}% of all author, publishing, and master rights and royalties.

Both parties register before their respective copyright societies recording their corresponding percentages.

### 4. Commercial Administration of the Work
The Co-producer grants exclusive authority to the Principal Producer to administer, license, sell, and commercialize non-exclusive licenses for the co-produced instrumental work through digital platforms (e.g., BEATSS, BeatStars). The Principal Producer irrevocably agrees to pay and transfer to the Co-producer their agreed participation share of {{clause_writer_share}}% on the revenues collected, on a quarterly basis.

### 5. Co-production Credit
Credits of the resulting composition will always be listed in the following manner:
> **{{clause_credits}}**`
    },
    {
        id: "contrato_suscripcion",
        name: "Contrato de Suscripción Recurrente",
        markdown: `# {{producer_aka}}: Contrato de Suscripción y Licenciamiento de Beats
## Términos del Acuerdo de Suscripción Musical Recurrente

---

### Información General
* **Referencia de Suscripción:** SUB-{{ref_code}}
* **Fecha de Inicio:** {{effective_date}}
* **Plan de Suscripción:** {{license_type}}
* **Tarifa Recurrente:** \${{license_value}} USD {{license_value_letters}} al mes.

---

### Partes Contratantes
1. **El Productor:** {{producer_name}} (AKA: **{{producer_aka}}**), con identificación Nro. {{producer_id}}.
2. **El Suscriptor (Artista):** {{buyer_name}}, con identificación Nro. {{buyer_id}}.

---

## Cláusulas de la Suscripción

### 1. Objeto del Acuerdo
El Artista se suscribe al Plan {{license_type}} para descargar un máximo de instrumentales por periodo de facturación, bajo las condiciones de la Licencia Básica o Premium según corresponda al plan contratado.

### 2. Validez y Cobro Recurrente
Este contrato es válido únicamente mientras la suscripción mensual de \${{license_value}} USD se encuentre activa y al día en su pago. La falta de pago de una mensualidad suspende de forma inmediata el derecho del Artista de seguir explotando comercialmente las obras descargadas hasta que se regularice el cobro.

### 3. Límites de Descargas y Uso
Las canciones derivadas que el Artista grabe con los beats descargados durante la suscripción activa mantendrán sus derechos de distribución en plataformas digitales (Spotify, YouTube, etc.) siempre que la suscripción continúe vigente o se adquieran de por vida.

### 4. Propiedad Intelectual y Splits
Los beats siguen siendo propiedad exclusiva del Productor. Se establece un split de regalías de composición y publishing del 50% para el Artista y 50% para el Productor.`,
        markdown_en: `# {{producer_aka}}: Subscription and Beat Licensing Agreement
## Terms of the Recurring Musical Subscription Agreement

---

### General Information
* **Subscription Reference:** SUB-{{ref_code}}
* **Effective Date:** {{effective_date}}
* **Subscription Plan:** {{license_type}}
* **Recurring Fee:** \${{license_value}} USD per month.

---

### Parties
1. **The Producer:** {{producer_name}} (AKA: **{{producer_aka}}**), with ID/Passport No. {{producer_id}}.
2. **The Subscriber (Artist):** {{buyer_name}}, with ID No. {{buyer_id}}.

---

## Subscription Clauses

### 1. Object of the Agreement
The Artist subscribes to the {{license_type}} Plan to download beats under the terms of the Basic or Premium License according to the selected plan.

### 2. Validity and Recurring Fee
This contract is valid only while the monthly payment of \${{license_value}} USD is active and paid. Failure to pay will suspend the Artist's commercial exploitation rights immediately.

### 3. Royalties and Splits
The beats remain the exclusive property of the Producer. Composition and publishing royalties are split 50% for the Artist and 50% for the Producer.`
    }
];
