import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildInlineContentDisposition,
    buildPurchasedAudioFilename
} from '../server-handlers/audio-download-filename.js';

test('nombra el MP3 comprado con beat, productor y formato', () => {
    assert.equal(buildPurchasedAudioFilename({
        beatName: 'Wow',
        producerName: 'Sossa',
        fileType: 'mp3',
        contentType: 'audio/mpeg'
    }), 'Wow - Sossa - MP3.mp3');
});

test('nombra WAV y stems sin confundir sus extensiones', () => {
    assert.equal(buildPurchasedAudioFilename({
        beatName: 'Magic',
        producerName: 'Sossa',
        fileType: 'wav',
        contentType: 'audio/wav'
    }), 'Magic - Sossa - WAV.wav');
    assert.equal(buildPurchasedAudioFilename({
        beatName: 'Magic',
        producerName: 'Sossa',
        fileType: 'stems',
        contentType: 'application/x-rar-compressed',
        upstreamDisposition: 'attachment; filename="stems.rar"'
    }), 'Magic - Sossa - Stems.rar');
});

test('sanea separadores y evita inyección en Content-Disposition', () => {
    const filename = buildPurchasedAudioFilename({
        beatName: 'Canción / Demo\r\nMaliciosa',
        producerName: 'Sossa: Music',
        fileType: 'mp3',
        contentType: 'audio/mpeg'
    });
    const disposition = buildInlineContentDisposition(filename);

    assert.equal(filename, 'Canción - Demo Maliciosa - Sossa- Music - MP3.mp3');
    assert.match(disposition, /^inline; filename="Cancion - Demo Maliciosa - Sossa- Music - MP3\.mp3";/);
    assert.match(disposition, /filename\*=UTF-8''Canci%C3%B3n%20-%20Demo%20Maliciosa/);
    assert.doesNotMatch(disposition, /\r|\n/);
});

test('una firma antigua no permite que el query invente el tipo del archivo', () => {
    assert.equal(buildPurchasedAudioFilename({
        beatName: 'Wow',
        producerName: 'Sossa',
        fileType: '',
        contentType: 'audio/mpeg'
    }), 'Wow - Sossa - Audio.mp3');
});
