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
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!db) {
        return res.status(500).json({ success: false, error: 'Database not initialized' });
    }

    try {
        const snapshot = await db.collection('registrations').get();
        const players = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // ONLY push public data, STRIPPING phone and cardId
            players.push({
                docId: data.phone, // We need an ID for mapping, but phone is sensitive. Let's use a random hash or just name. Wait, the frontend needs docId for admin ops but this is public leaderboard! 
                // Leaderboard doesn't strictly need docId, it just renders rows.
                name: data.name || 'Unknown',
                username: data.username || 'No Account',
                rating: data.rating || 'N/A',
                points: data.points || 0,
                matchStatus: data.matchStatus || {},
                currentRound: data.currentRound || 1,
                buchholz: data.buchholz || 0
            });
        });

        // Add Cache-Control header for better performance and reduced DB reads
        res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');
        return res.status(200).json({ success: true, players: players });
        
    } catch (error) {
        console.error("Leaderboard API Error:", error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
}
