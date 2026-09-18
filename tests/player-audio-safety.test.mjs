import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el reproductor público conserva una única ruta de preview con protección de picos', () => {
    const player = read('player.js');

    assert.match(player, /const STORE_PREVIEW_MASTER_HEADROOM = 0\.78;/);
    assert.match(player, /audioCtx\.createDynamicsCompressor\(\)/);
    assert.match(player, /sourceNode\.connect\(masterGain\);/);
    assert.match(player, /masterGain\.connect\(peakLimiter\);/);
    assert.match(player, /peakLimiter\.connect\(audioCtx\.destination\);/);
    assert.doesNotMatch(player, /sourceNode\.connect\(lowpassFilter\)/);
    assert.doesNotMatch(player, /sourceNode\.connect\(bandpassFilter\)/);
    assert.doesNotMatch(player, /sourceNode\.connect\(highpassFilter\)/);
    assert.doesNotMatch(player, /masterGain\.connect\(convolverNode\)/);
    assert.doesNotMatch(player, /masterGain\.connect\(delayNode\)/);
});

test('la interfaz de la tienda no presenta un preview estéreo como stems y comienza a volumen seguro', () => {
    const index = read('index.html');
    const player = read('player.js');
    const storeRouter = read('public-store-router.js');
    const storePlayerCss = read('store-player.css');

    assert.match(index, /id="player-volume"[\s\S]*value="0\.7"/);
    assert.doesNotMatch(index, /Mezclador de Stems/);
    assert.doesNotMatch(index, /id="store-mixer-panel"/);
    assert.doesNotMatch(player, /toggleMixerPanel|setMixerGain|setMixerEffect|toggleMixerEffect/);
    assert.doesNotMatch(player, /mixer-fader-/);
    assert.match(index, /class="store-player__layout"/);
    assert.match(index, /aria-label="Reproductor de vista previa"/);
    assert.match(player, /export const DEFAULT_STORE_PREVIEW_VOLUME = 0\.7;/);
    assert.match(player, /window\.currentStoreAudio\.volume = getSafeStorePreviewVolume\(volumeSlider\?\.value\);/);
    assert.match(player, /progressContainer\.addEventListener\('keydown'/);
    assert.match(storeRouter, /import ['"]\.\/store-player\.css['"]/);
    assert.match(storePlayerCss, /background: #ffffff !important;/);
    assert.match(storePlayerCss, /body\[data-beatss-view="store"\] #store-audio-player\.store-player/);
});
