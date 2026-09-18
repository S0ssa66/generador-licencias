import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("el rediseño de portada incluye la plataforma integral y preserva las acciones públicas", () => {
    const relay = read("relay-home.js");
    const css = read("sonic-ledger.css");

    // Conservación de contratos requeridos por el bootstrap y tests
    assert.match(relay, /const goToSossaStore = \(\) => window\.location\.assign\('\/tienda\/sossa'\);/);
    assert.match(relay, /withAuth/);
    assert.match(relay, /data-ledger-action="catalog"/);
    assert.match(relay, /data-ledger-action="studio"/);
    assert.match(relay, /data-ledger-scroll/);

    // Nuevas secciones generalizadas de plataforma (Operating Stack, Métricas, Bento, Comparativa)
    assert.match(relay, /ledger-stack-showcase/);
    assert.match(relay, /card-contract/);
    assert.match(relay, /card-settlement/);
    assert.match(relay, /card-vault/);
    assert.match(relay, /ledger-metrics-strip/);
    assert.match(relay, /ledger-bento-grid/);
    assert.match(relay, /ledger-compare-section/);
    assert.match(relay, /ledger-cta-banner/);

    // Estilos correspondientes en sonic-ledger.css
    assert.match(css, /\.ledger-stack-showcase/);
    assert.match(css, /\.ledger-metrics-strip/);
    assert.match(css, /\.ledger-bento-grid/);
    assert.match(css, /\.ledger-compare-grid/);
    assert.match(css, /\.ledger-cta-banner/);
});

test("el respaldo exacto relay-home.v1-backup.js existe y conserva el diseño V1 intacto", () => {
    assert.ok(existsSync(new URL("../relay-home.v1-backup.js", import.meta.url)));
    const backup = read("relay-home.v1-backup.js");
    assert.match(backup, /OOUUHH/);
    assert.match(backup, /Dancehall/);
    assert.match(backup, /ledger-operation-card/);
    assert.match(backup, /ledger-route-grid/);
    assert.match(backup, /ledger-utility/);
});
