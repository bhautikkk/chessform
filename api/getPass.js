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
            return res.status(401).json({ success: false, error: 'Incorrect name.' });
        }
        
    } catch (error) {
        console.error("GetPass API Error:", error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
}
