# Knowledge Steward de BEATSS

Knowledge Steward audita documentación de BEATSS y Obsidian sin modificar la
bóveda ni el código. Su función es detectar contradicciones, duplicados,
enlaces rotos y notas obsoletas, y devolver hallazgos verificables.

## Ejecución segura

Desde la raíz del proyecto:

```bash
node scripts/run-knowledge-steward.mjs vault-index --save
```

Alcances disponibles:

- `handoffs`: documentación operativa del proyecto.
- `project-docs`: documentación curada del proyecto.
- `vault-index`: índices, proyectos y áreas de la bóveda Obsidian.

El script genera localmente un manifiesto limitado, excluye secretos,
configuración interna de Obsidian y contenido derivado de Graphify. El modelo
solo recibe ese manifiesto y no obtiene acceso directo a archivos. Los informes
opcionales se guardan localmente en `.knowledge_steward_reports/`, que no se
versiona.

Cada informe incluye prioridad, impacto, evidencia y la siguiente acción
segura. Los hallazgos son recomendaciones: ningún cambio se aplica sin una
autorización posterior.

## Registro de cambios al iniciar una tarea

Al iniciar una tarea del sistema de agentes de BEATSS, el monitor local registra
los cambios acumulados de BEATSS y Obsidian con ruta, fecha, categoría y huella
criptográfica; nunca guarda el contenido de la nota dentro del registro. La
primera ejecución crea una línea base local. Las posteriores detectan altas,
modificaciones y eliminaciones.

```bash
npm run knowledge:monitor
npm run knowledge:status
```

Un cambio en `00_Indice`, `1_Proyectos` o `2_Areas` se agrupa para una auditoría
limitada de `vault-index`. Cambios en código u otras áreas se registran sin
enviar su contenido al modelo. El monitor no escribe en Obsidian y no aplica
las recomendaciones que genere una auditoría.

No existe una vigilancia permanente: el Mac puede permanecer apagado y todos
los cambios se detectan al iniciar la siguiente tarea. Si no hay cambios
documentales permitidos, no se invoca DeepSeek. Si una auditoría falla, queda
pendiente para el siguiente inicio. La ejecución manual continúa disponible
con `npm run knowledge:monitor:local`.
