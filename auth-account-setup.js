const AUTH_TERMS_VERSION = '2026-08-14';

export async function recordRegistrationConsent(user, acceptedAt) {
    const { db, doc, setDoc } = await import('./firebase-data.js');
    await setDoc(doc(db, 'users', user.uid), {
        email: user.email || '',
        plan: 'inicial',
        registeredAt: user.metadata?.creationTime || acceptedAt,
        termsVersion: AUTH_TERMS_VERSION,
        termsAcceptedAt: acceptedAt,
        privacyAcceptedAt: acceptedAt,
        requiresEmailVerification: true,
        onboardingStatus: 'email_verification_pending'
    }, { merge: true });
}

export async function accountRequiresVerifiedEmail(user) {
    if (!user || user.emailVerified) return false;
    const usesPassword = (user.providerData || []).some((provider) => provider.providerId === 'password');
    if (!usesPassword) return false;
    try {
        const { db, doc, getDoc } = await import('./firebase-data.js');
        const snapshot = await getDoc(doc(db, 'users', user.uid));
        return snapshot.exists() && snapshot.data()?.requiresEmailVerification === true;
    } catch (error) {
        console.warn('No se pudo comprobar la verificación del correo:', error.message);
        return true;
    }
}
