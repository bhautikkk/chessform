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
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ success: false, error: 'Missing phone' });
        }

        const docSnap = await db.collection('registrations').doc(phone).get();
        
        if (!docSnap.exists) {
            return res.status(200).json({ success: true, status: 'Rejected' });
        }

        const userData = docSnap.data();
        const isApproved = userData.cardId && userData.cardId !== 'Pending';
        
        // Return ONLY the status. Do not return cardId or other data.
        return res.status(200).json({
            success: true,
            status: isApproved ? 'Approved' : 'Pending'
        });
        
    } catch (error) {
        console.error("CheckStatus API Error:", error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
}
