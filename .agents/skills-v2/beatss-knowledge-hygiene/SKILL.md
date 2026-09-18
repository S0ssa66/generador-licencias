---
name: beatss-knowledge-hygiene
description: Audita la fuente de verdad de BEATSS entre código, handoffs y la bóveda de Obsidian mediante manifiestos saneados y de solo lectura. Usar para detectar documentación obsoleta, contradicciones, duplicados, enlaces rotos y tareas sin evidencia.
---

# BEATSS Knowledge Hygiene

## Objetivo

Mantener documentación útil sin enviar la bóveda completa al modelo ni asumir
que una nota histórica describe el estado vigente.

## Flujo seguro

1. Define un alcance pequeño y las preguntas que debe resolver.
2. Construye localmente un manifiesto permitido y saneado.
3. Excluye `.env`, credenciales, certificados, datos personales, cachés,
   dependencias, backups y artefactos derivados masivos.
4. Entrega al agente solo rutas y fragmentos necesarios.
5. Contrasta afirmaciones con código o evidencia reciente.
6. Clasifica hallazgos por prioridad, impacto y acción segura.
7. Propón cambios; no escribas en proyecto o bóveda desde el agente.

## Reglas

- La bóveda completa nunca es contexto automático.
- Las rutas del manifiesto no amplían permisos.
- No ejecutar Graphify automáticamente tras cambios o commits.
- No tratar documentación derivada como código fuente.
- No afirmar vigencia, despliegue o funcionalidad fuera de la evidencia recibida.
- No almacenar secretos ni contenido sensible en memoria del agente.

## Salida

Devuelve estado, alcance literal, fuentes consultadas, hallazgos con evidencia,
límites y siguientes acciones seguras. Si la evidencia no basta, usa
`needs_input` o `blocked`; no inventes conclusiones.
