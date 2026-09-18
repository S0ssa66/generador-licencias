import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc
} from 'firebase/firestore';
import {
    deleteObject,
    getBytes,
    ref,
    uploadBytes
} from 'firebase/storage';

const projectId = 'demo-beatss-rules';
let environment;

before(async () => {
    environment = await initializeTestEnvironment({
        projectId,
        firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
        storage: { rules: fs.readFileSync('storage.rules', 'utf8') }
    });
});

after(async () => {
    await environment?.cleanup();
});

test('un visitante no puede crear pagos ni modificar configuración pública', async () => {
    const db = environment.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'payments/anonymous'), {
        producerId: 'producer-1',
        status: 'pending',
        amount: 1
    }));
    await assertFails(setDoc(doc(db, 'users/producer-1/config/producer'), { aka: 'Ataque' }));
});

test('un usuario solo puede registrar su comprobante de suscripción pendiente', async () => {
    const db = environment.authenticatedContext('buyer-1', { email: 'buyer@example.test' }).firestore();
    const valid = {
        type: 'subscription_payment',
        userId: 'buyer-1',
        userEmail: 'buyer@example.test',
        aka: 'Buyer',
        method: 'PayPhone',
        reference: 'SUB-123',
        status: 'pending',
        plan: 'pro',
        receiptUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/receipts%2Fsaas%2Fbuyer-1%2Freceipt.webp',
        timestamp: new Date().toISOString()
    };
    await assertSucceeds(setDoc(doc(db, 'payments/subscription-valid'), valid));
    await assertFails(setDoc(doc(db, 'payments/subscription-forged-user'), { ...valid, userId: 'buyer-2' }));
    await assertFails(setDoc(doc(db, 'payments/subscription-approved'), { ...valid, status: 'approved' }));
});

test('el productor solo puede cambiar el estado de su pago pendiente', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'payments/manual-payment'), {
            producerId: 'producer-1',
            buyerEmail: 'private@example.test',
            status: 'pending',
            amount: 25
        });
    });
    const ownerDb = environment.authenticatedContext('producer-1').firestore();
    const strangerDb = environment.authenticatedContext('producer-2').firestore();
    await assertSucceeds(getDoc(doc(ownerDb, 'payments/manual-payment')));
    await assertFails(getDoc(doc(strangerDb, 'payments/manual-payment')));
    await assertSucceeds(updateDoc(doc(ownerDb, 'payments/manual-payment'), { status: 'approved' }));
    await assertFails(updateDoc(doc(ownerDb, 'payments/manual-payment'), { amount: 0 }));
});

test('la configuración sensible permanece privada incluso para el dueño público', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users/producer-1/config/producer'), { aka: 'Producer' });
        await setDoc(doc(context.firestore(), 'users/producer-1/private_config/producer'), { secret: 'server-only' });
    });
    const ownerDb = environment.authenticatedContext('producer-1').firestore();
    const publicDb = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(publicDb, 'users/producer-1/config/producer')));
    await assertSucceeds(getDoc(doc(ownerDb, 'users/producer-1/config/producer')));
    await assertSucceeds(updateDoc(doc(ownerDb, 'users/producer-1/config/producer'), { aka: 'Updated' }));
    await assertFails(updateDoc(doc(ownerDb, 'users/producer-1/config/producer'), { paypalClientSecret: 'forged' }));
    await assertFails(updateDoc(doc(ownerDb, 'users/producer-1/config/producer'), { bankGuayaquilAcc: 'forged' }));
    await assertFails(updateDoc(doc(ownerDb, 'users/producer-1/config/producer'), { id: 'private-id' }));
    await assertFails(updateDoc(doc(ownerDb, 'users/producer-1/config/producer'), { sriRazonSocial: 'private-tax-name' }));
    await assertFails(getDoc(doc(publicDb, 'users/producer-1/private_config/producer')));
});

test('el dueño puede retirar un campo sensible heredado sin volver a publicarlo', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users/producer-legacy/config/producer'), {
            aka: 'Legacy',
            bankGuayaquilAcc: 'legacy-account'
        });
    });
    const ownerDb = environment.authenticatedContext('producer-legacy').firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'users/producer-legacy/config/producer'), { aka: 'Legacy' }));
    await assertFails(updateDoc(doc(ownerDb, 'users/producer-legacy/config/producer'), { bankGuayaquilAcc: 'restored' }));
});

test('los comprobantes de Storage quedan aislados por UID, MIME y operación', async () => {
    const ownerStorage = environment.authenticatedContext('buyer-1').storage();
    const strangerStorage = environment.authenticatedContext('buyer-2').storage();
    const ownReceipt = ref(ownerStorage, 'receipts/saas/buyer-1/receipt.webp');
    await assertSucceeds(uploadBytes(ownReceipt, new Uint8Array([82, 73, 70, 70]), { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(ownReceipt));
    await assertFails(getBytes(ref(strangerStorage, 'receipts/saas/buyer-1/receipt.webp')));
    await assertFails(uploadBytes(ref(ownerStorage, 'receipts/saas/buyer-2/cross.webp'), new Uint8Array([1]), { contentType: 'image/webp' }));
    await assertFails(uploadBytes(ref(ownerStorage, 'receipts/saas/buyer-1/receipt.txt'), new Uint8Array([1]), { contentType: 'text/plain' }));
    await assertFails(uploadBytes(ownReceipt, new Uint8Array([1, 2, 3]), { contentType: 'image/webp' }));
    await assertSucceeds(deleteObject(ownReceipt));
});

test('audio y contratos privados solo se escriben en la carpeta del productor', async () => {
    const ownerStorage = environment.authenticatedContext('producer-1').storage();
    const strangerStorage = environment.authenticatedContext('producer-2').storage();
    const audio = ref(ownerStorage, 'beats/producer-1/beat.mp3');
    const contract = ref(ownerStorage, 'licenses/producer-1/license.pdf');
    await assertSucceeds(uploadBytes(audio, new Uint8Array([73, 68, 51]), { contentType: 'audio/mpeg' }));
    await assertSucceeds(uploadBytes(contract, new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf' }));
    await assertFails(getBytes(ref(strangerStorage, 'beats/producer-1/beat.mp3')));
    await assertFails(uploadBytes(ref(ownerStorage, 'licenses/producer-1/not-a-pdf.txt'), new Uint8Array([1]), { contentType: 'text/plain' }));
});

test('las reglas administrativas requieren el claim admin', async () => {
    const userDb = environment.authenticatedContext('normal-user').firestore();
    const adminDb = environment.authenticatedContext('admin-user', { admin: true }).firestore();
    await assertFails(setDoc(doc(userDb, 'vip_codes/NOPE'), { active: true }));
    await assertSucceeds(setDoc(doc(adminDb, 'vip_codes/ADMIN'), { active: true }));
    assert.equal((await getDoc(doc(adminDb, 'vip_codes/ADMIN'))).exists(), true);
});
