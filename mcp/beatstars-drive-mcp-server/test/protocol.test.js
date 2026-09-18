import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('expone sus herramientas MCP por stdio sin requerir una clave de migración', async () => {
    const exportRoot = await mkdtemp(path.join(os.tmpdir(), 'beatss-mcp-protocol-'));
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ['src/index.js'],
        cwd: process.cwd(),
        env: { BEATSS_EXPORT_ROOT: exportRoot },
        stderr: 'pipe'
    });
    const client = new Client({ name: 'beatss-mcp-test-client', version: '1.0.0' }, { capabilities: {} });

    try {
        await client.connect(transport);
        const listed = await client.listTools();
        assert.deepEqual(
            listed.tools.map((tool) => tool.name).sort(),
            [
                'beatss_create_migration_plan',
                'beatss_execute_migration_plan',
                'beatss_inventory_export',
                'beatss_migration_get_setup'
            ]
        );

        const setup = await client.callTool({
            name: 'beatss_migration_get_setup',
            arguments: { response_format: 'json' }
        });
        assert.equal(setup.isError, undefined);
        assert.match(setup.content[0].text, /BEATSS_EXPORT_ROOT/);
        assert.equal(setup.structuredContent.authorization.includes('clave temporal'), true);
    } finally {
        await client.close();
    }
});
