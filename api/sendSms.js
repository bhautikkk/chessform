const admin = require('firebase-admin');

export default async function handler(req, res) {
    // Enable CORS for frontend calls
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    try {
        // ── Auth Token Verification ──
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid authorization token.' });
        }
        const idToken = authHeader.split('Bearer ')[1];

        if (!admin.apps.length) {
            if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
                console.error("Missing Firebase Environment Variables in Vercel.");
                return res.status(500).json({ success: false, error: 'Database configuration missing in Vercel.' });
            }
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                })
            });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        // Add your admin email check if required, just like sendEmail.js
        if (decodedToken.email !== 'bhautikk264@gmail.com') {
            return res.status(403).json({ success: false, error: 'Forbidden: Only the admin can call this endpoint.' });
        }

        const { phone, name, cardId } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone number is required.' });
        }

        const apiKey = process.env.FAST2SMS_API_KEY;
        if (!apiKey) {
            console.warn("FAST2SMS_API_KEY is not set in Vercel. Simulating SMS send.");
            return res.status(200).json({ success: true, message: 'Dev Mode: Simulated SMS send (Missing API Key)', devMode: true });
        }

        // Clean phone number (extract just the 10 digits if it contains +91 or spaces)
        let cleanPhone = String(phone).replace(/\D/g, ''); // Remove all non-digits
        if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
            cleanPhone = cleanPhone.slice(-10); // Take the last 10 digits
        }

        if (cleanPhone.length !== 10) {
            return res.status(400).json({ success: false, error: 'Invalid phone number length for Fast2SMS (requires 10 digits).' });
        }

        const smsMessage = `Hi ${name || 'Player'}, your registration for ChessBird is approved! Your Entry ID is ${cardId}. Check your email for the official pass.`;

        // Send via Fast2SMS using Bulk V3 API
        const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: {
                'authorization': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                route: 'q',
                message: smsMessage,
                language: 'english',
                flash: 0,
                numbers: cleanPhone
            })
        });

        const data = await response.json();

        if (!response.ok || !data.return) {
            console.error('Fast2SMS Error:', data);
            return res.status(500).json({ success: false, error: 'Failed to send SMS via Fast2SMS', details: data });
        }

        console.log('SMS sent successfully via Fast2SMS:', data);
        return res.status(200).json({ success: true, message: 'SMS sent successfully', details: data });

    } catch (error) {
        console.error('SMS sending error:', error);
        return res.status(500).json({ success: false, error: 'Failed to send SMS: ' + error.message });
    }
}
