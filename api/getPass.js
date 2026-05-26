const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        console.error("Missing Firebase Environment Variables.");
    } else {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
    }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!db) {
        return res.status(500).json({ success: false, error: 'Database not initialized' });
    }

    try {
        const { phone, name } = req.body;
        
        if (!phone || !name) {
            return res.status(400).json({ success: false, error: 'Missing phone or name' });
        }

        // --- SERVER-SIDE RATE LIMITING ---
        const MAX_ATTEMPTS = 5;
        const LOCKOUT_MS = 5 * 60 * 1000;
        const attemptRef = db.collection('pass_attempts').doc(phone);
        const attemptDoc = await attemptRef.get();
        let attemptData = attemptDoc.exists ? attemptDoc.data() : { count: 0, lockedUntil: 0 };

        if (attemptData.lockedUntil > Date.now()) {
            const remainingMs = attemptData.lockedUntil - Date.now();
            return res.status(429).json({ success: false, error: 'Locked', remainingMs: remainingMs });
        }

        const docSnap = await db.collection('registrations').doc(phone).get();
        
        if (!docSnap.exists) {
            return res.status(404).json({ success: false, error: 'No registration found for this phone number.' });
        }

        const userData = docSnap.data();
        
        // Strictly verify name
        if (userData.name && userData.name.toUpperCase().trim() === name.toUpperCase().trim()) {
            
            if (!userData.cardId || userData.cardId === 'Pending') {
                return res.status(403).json({ success: false, error: 'Your registration is under review. Approval usually takes up to 24 hours.' });
            }

            // Reset attempts on success
            if (attemptData.count > 0 || attemptData.lockedUntil > 0) {
                await attemptRef.set({ count: 0, lockedUntil: 0 });
            }

            // Return stripped data for pass
            return res.status(200).json({
                success: true,
                player: {
                    name: userData.name,
                    username: userData.username,
                    rating: userData.rating,
                    cardId: userData.cardId
                }
            });
            
        } else {
            attemptData.count += 1;
            let isLocked = false;
            if (attemptData.count >= MAX_ATTEMPTS) {
                attemptData.lockedUntil = Date.now() + LOCKOUT_MS;
                isLocked = true;
            }
            await attemptRef.set(attemptData);
            
            if (isLocked) {
                return res.status(429).json({ success: false, error: 'Locked', remainingMs: LOCKOUT_MS });
            } else {
                return res.status(401).json({ success: false, error: 'Incorrect name.', attemptsLeft: MAX_ATTEMPTS - attemptData.count });
            }
        }
        
    } catch (error) {
        console.error("GetPass API Error:", error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
}
