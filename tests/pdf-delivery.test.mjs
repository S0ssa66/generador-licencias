import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);

test('la entrega acepta el data URI PDF que genera html2pdf y mantiene su firma', async () => {
    const previous = process.env.DOWNLOAD_SIGNING_KEY;
    process.env.DOWNLOAD_SIGNING_KEY = 'test-only-signing-key-that-is-not-a-secret';
    try {
        const { validatePdf } = await import('../api/confirm-purchase.js?pdf-delivery-test');
        const source = Buffer.from('%PDF-1.4\nsynthetic-test-document');
        const dataUri = `data:application/pdf;filename=Licencia_TEST.pdf;base64,${source.toString('base64')}`;
        assert.deepEqual(validatePdf(dataUri), source);
        assert.throws(() => validatePdf(`data:application/pdf;filename=x.pdf;base64,${Buffer.from('NOT-PDF').toString('base64')}`));
    } finally {
        if (previous === undefined) delete process.env.DOWNLOAD_SIGNING_KEY;
        else process.env.DOWNLOAD_SIGNING_KEY = previous;
    }
});

test('el portal persiste el PDF autorizado antes de descargarlo', async () => {
    const checkout = await readFile(new URL('checkout.js', root), 'utf8');
    assert.match(checkout, /const deliveryToken = data\.deliveryToken \|\| '';/);
    assert.match(checkout, /action=upload-license-pdf/);
    assert.match(checkout, /body: JSON\.stringify\(\{ paymentId, deliveryToken, contractReference, pdfBase64 \}\)/);
    assert.match(checkout, /URL\.createObjectURL\(pdfBlob\)/);
});
