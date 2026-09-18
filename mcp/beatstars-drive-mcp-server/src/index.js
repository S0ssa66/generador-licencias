#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
    createMigrationPlan,
    executeMigrationPlan,
    getInventory,
    getMigrationPlan,
    inventoryBeatStarsExport,
    planSummary,
    storeInventory
} from './core.js';

const server = new McpServer({
    name: 'beatss-beatstars-drive-mcp-server',
    version: '0.1.0'
});

const responseFormat = z.enum(['markdown', 'json']).default('markdown')
    .describe('Formato de respuesta: markdown para lectura humana o json para automatización.');
const pagination = {
    limit: z.number().int().min(1).max(100).default(25)
        .describe('Cantidad máxima de beats que se devuelve en esta página.'),
    offset: z.number().int().min(0).default(0)
        .describe('Cantidad de beats que se omite para paginar el resultado.')
};

function asText(value, format) {
    return format === 'json' ? JSON.stringify(value, null, 2) : value;
}

function inventorySummary(inventory, inventoryId, offset, limit) {
    const beats = inventory.beats.slice(offset, offset + limit).map((beat) => ({
        id: beat.id,
        name: beat.name,
        bpm: beat.bpm,
        key: beat.key,
        genre: beat.genre,
        files: Object.fromEntries(Object.entries(beat.files).map(([role, file]) => [role, {
            path: file.relativePath,
            bytes: file.size,
            sha256: file.checksum
        }]))
    }));
    return {
        inventoryId,
        sourceDir: inventory.sourceDir,
        metadataCount: inventory.metadataCount,
        beatsTotal: inventory.beats.length,
        filesScanned: inventory.filesScanned,
        totalBytes: inventory.totalBytes,
        unmatchedFiles: inventory.unmatchedFiles,
        duplicateGroups: inventory.duplicateFiles.length,
        offset,
        count: beats.length,
        hasMore: offset + beats.length < inventory.beats.length,
        nextOffset: offset + beats.length < inventory.beats.length ? offset + beats.length : null,
        beats
    };
}

function markdownInventory(summary) {
    const lines = [
        '# Inventario de exportación BeatStars',
        '',
        `- **ID del inventario:** ${summary.inventoryId}`,
        `- **Beats encontrados:** ${summary.beatsTotal}`,
        `- **Archivos admitidos:** ${summary.filesScanned}`,
        `- **Coincidencias ambiguas/no asignadas:** ${summary.unmatchedFiles.length}`,
        `- **Grupos de duplicados por SHA-256:** ${summary.duplicateGroups}`,
        '',
        'Usa el ID del inventario en `beatss_create_migration_plan` antes de ejecutar cualquier subida.',
        ''
    ];
    summary.beats.forEach((beat) => {
        lines.push(`## ${beat.name} (${beat.id})`);
        lines.push(`- Archivos: ${Object.keys(beat.files).join(', ') || 'ninguno'}`);
        if (beat.bpm) lines.push(`- BPM: ${beat.bpm}`);
    });
    return lines.join('\n');
}

function markdownPlan(summary) {
    const lines = [
        '# Plan de migración BeatStars → BEATSS',
        '',
        `- **Plan:** ${summary.planId}`,
        `- **Beats a procesar:** ${summary.beatsTotal}`,
        `- **Archivos analizados:** ${summary.filesTotal}`,
        `- **Duplicados por archivo:** ${summary.duplicateGroups}`,
        `- **Beats existentes:** ${summary.existingPolicy === 'update_assets' ? 'se actualizarán únicamente los enlaces de archivos subidos a Drive' : 'se omitirán sin modificar'}`,
        `- **Confirmación requerida:** \`${summary.confirmationCode}\``,
        '',
        'La confirmación sólo habilita la subida. El MCP no elimina ni modifica ningún archivo de BeatStars.',
        ''
    ];
    summary.beats.forEach((beat) => lines.push(`- **${beat.name}** — ${Object.keys(beat.files).join(', ') || 'sin archivos'}`));
    return lines.join('\n');
}

function markdownExecution(result) {
    const lines = [
        '# Resultado de migración',
        '',
        `- **Migrados:** ${result.migrated.length}`,
        `- **Omitidos:** ${result.skipped.length}`,
        `- **Con error:** ${result.failed.length}`
    ];
    if (result.skipped.length) {
        lines.push('', '## Omitidos');
        result.skipped.forEach((item) => lines.push(`- ${item.name}: ${item.reason}`));
    }
    if (result.failed.length) {
        lines.push('', '## Errores');
        result.failed.forEach((item) => lines.push(`- ${item.name}: ${item.reason}`));
    }
    return lines.join('\n');
}

function toolResult(text, structuredContent) {
    return { content: [{ type: 'text', text }], structuredContent };
}

function toolError(error) {
    const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
    return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
}

server.registerTool(
    'beatss_migration_get_setup',
    {
        title: 'Ver requisitos de migración BeatStars',
        description: 'Explica los requisitos locales y de autorización para migrar una exportación propia de BeatStars. No lee archivos, no llama a servicios externos y no muestra secretos. Úsalo antes de analizar o ejecutar una migración.',
        inputSchema: { response_format: responseFormat },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ response_format: format }) => {
        const output = {
            requiredEnvironment: ['BEATSS_EXPORT_ROOT', 'BEATSS_MIGRATION_KEY (sólo al ejecutar)'],
            source: 'Carpeta local descargada por el productor desde BeatStars, con MP3, WAV, ZIP/RAR de stems y portadas.',
            metadata: 'CSV o JSON opcional dentro de BEATSS_EXPORT_ROOT. Campos reconocidos: name/title, bpm, key, genre, tags, description.',
            authorization: 'En BEATSS: Configuración → Integraciones → Migrar biblioteca de BeatStars → Crear clave temporal. La clave vence en 20 minutos.',
            safety: 'El servidor sólo lee rutas bajo BEATSS_EXPORT_ROOT. El plan detecta hashes duplicados; ejecutar requiere el código de confirmación. Nunca elimina ni modifica BeatStars.'
        };
        const markdown = [
            '# Preparación',
            '',
            '1. Descarga tu carpeta de archivos de BeatStars y, si lo tienes, un CSV/JSON con metadata.',
            '2. Define `BEATSS_EXPORT_ROOT` como la carpeta que contiene esa exportación.',
            '3. Analiza con `beatss_inventory_export` y revisa duplicados/archivos sin asignar.',
            '4. Crea un plan. Sólo entonces genera la clave temporal desde Configuración de BEATSS y guárdala como `BEATSS_MIGRATION_KEY` en la configuración local del MCP.',
            '5. Ejecuta con el código de confirmación exacto. No se borra ni modifica nada en BeatStars.'
        ].join('\n');
        return toolResult(format === 'json' ? JSON.stringify(output, null, 2) : markdown, output);
    }
);

server.registerTool(
    'beatss_inventory_export',
    {
        title: 'Inventariar exportación BeatStars',
        description: 'Examina exclusivamente una carpeta local autorizada por BEATSS_EXPORT_ROOT y un CSV o JSON opcional de metadatos. Clasifica MP3, WAV, stems y portada; calcula SHA-256 para detectar duplicados y devuelve un inventoryId paginado. No sube, modifica ni elimina archivos.',
        inputSchema: {
            source_dir: z.string().min(1).max(4096).describe('Carpeta de la exportación, obligatoriamente dentro de BEATSS_EXPORT_ROOT.'),
            metadata_file: z.string().max(4096).optional().default('').describe('CSV o JSON opcional dentro de BEATSS_EXPORT_ROOT con metadata de beats.'),
            ...pagination,
            response_format: responseFormat
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ source_dir: sourceDir, metadata_file: metadataFile, limit, offset, response_format: format }) => {
        try {
            const inventory = await inventoryBeatStarsExport({ sourceDir, metadataFile });
            const inventoryId = storeInventory(inventory);
            const output = inventorySummary(inventory, inventoryId, offset, limit);
            return toolResult(format === 'json' ? JSON.stringify(output, null, 2) : markdownInventory(output), output);
        } catch (error) {
            return toolError(error);
        }
    }
);

server.registerTool(
    'beatss_create_migration_plan',
    {
        title: 'Crear plan de migración BeatStars',
        description: 'Convierte un inventario analizado en un plan de subida y registro de catálogo. Genera un planId y un código de confirmación único, pero no inicia ninguna subida, no registra beats y no modifica archivos. Úsalo después de revisar el inventario.',
        inputSchema: {
            inventory_id: z.string().uuid().describe('ID devuelto por beatss_inventory_export en esta misma sesión del MCP.'),
            existing_policy: z.enum(['skip', 'update_assets']).default('skip').describe('skip deja intactos los beats que ya existen. update_assets sólo agrega los enlaces de los archivos recién subidos a Drive y conserva el resto de sus datos.'),
            ...pagination,
            response_format: responseFormat
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ inventory_id: inventoryId, existing_policy: existingPolicy, limit, offset, response_format: format }) => {
        try {
            const plan = createMigrationPlan(getInventory(inventoryId), { existingPolicy });
            const output = planSummary(plan, offset, limit);
            return toolResult(format === 'json' ? JSON.stringify(output, null, 2) : markdownPlan(output), output);
        } catch (error) {
            return toolError(error);
        }
    }
);

server.registerTool(
    'beatss_execute_migration_plan',
    {
        title: 'Ejecutar migración confirmada a Drive y catálogo',
        description: 'Sube los archivos indicados por un plan previamente revisado al Google Drive central de BEATSS y registra cada beat en el catálogo privado del productor. Requiere el código de confirmación del plan y BEATSS_MIGRATION_KEY en el entorno local. Por defecto omite beats existentes; un plan creado con update_assets sólo añade enlaces de Drive a los archivos seleccionados y conserva sus demás datos. Nunca borra ni modifica BeatStars.',
        inputSchema: {
            plan_id: z.string().uuid().describe('ID del plan creado por beatss_create_migration_plan en esta misma sesión.'),
            confirmation_code: z.string().min(20).max(100).describe('Código exacto mostrado al crear el plan; confirma el único paso que escribe datos.'),
            beatss_base_url: z.string().url().max(300).optional().default('https://beatss.app').describe('URL base de BEATSS. Usa la producción salvo que estés probando un entorno autorizado.'),
            response_format: responseFormat
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ plan_id: planId, confirmation_code: confirmationCode, beatss_base_url: baseUrl, response_format: format }) => {
        try {
            const result = await executeMigrationPlan({
                planId,
                confirmationCode,
                baseUrl,
                onProgress: (event) => console.error(`[beatss-migration] ${event.stage}: ${event.beat}`)
            });
            return toolResult(format === 'json' ? JSON.stringify(result, null, 2) : markdownExecution(result), result);
        } catch (error) {
            return toolError(error);
        }
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('BEATSS BeatStars migration MCP listening on stdio');
