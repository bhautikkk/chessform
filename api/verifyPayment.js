const Razorpay = require('razorpay');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Uses Environment Variables configured in Vercel
if (!admin.apps.length) {
    // Check if the required environment variables are present
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
        console.error("Missing Firebase Environment Variables.");
    } else {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Replace escaped newlines if any
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
    }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    if (!db) {
        return res.status(500).json({ success: false, error: 'Database configuration missing in Vercel.' });
    }

    const { 
        razorpay_payment_id, 
        razorpay_order_id, 
        razorpay_signature,
        
        // Registration details sent from frontend
        name,
        username,
        email,
        phone,
        rating,
        promoCode,
        discountApplied,
        amountPaid
    } = req.body;

    if (!razorpay_payment_id || !phone) {
        return res.status(400).json({ success: false, error: 'Missing payment or user details' });
    }

    try {
        let paymentAmount = amountPaid; // Default to what frontend claims

        // 1. Verify Payment OR Promo Code
        const isFreeReg = razorpay_payment_id.startsWith('FREE_');

        if (isFreeReg) {
            // Validate 100% Promo Code securely via Firestore
            if (!promoCode) {
                return res.status(400).json({ success: false, error: 'Promo code required for free registration' });
            }
            
            const promoDoc = await db.collection('promo_codes').doc(promoCode).get();
            if (!promoDoc.exists || promoDoc.data().active !== true || promoDoc.data().discount !== 100) {
                return res.status(400).json({ success: false, error: 'Invalid or inactive 100% free promo code' });
            }
            
            paymentAmount = 0; // Verified free
        } else {
            // Verify Razorpay Payment (100% Secure Backend Verification)
            const secret = process.env.RAZORPAY_KEY_SECRET;
            
            if (!secret) {
                return res.status(500).json({ success: false, error: 'Razorpay Secret Key missing in Vercel.' });
            }

            const razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_SdF2J3WDCQa5Ko',
                key_secret: secret,
            });

            const payment = await razorpay.payments.fetch(razorpay_payment_id);
            
            if (!payment) {
                return res.status(400).json({ success: false, error: 'Invalid Payment ID' });
            }
            
            if (payment.status !== 'captured' && payment.status !== 'authorized') {
                return res.status(400).json({ success: false, error: `Payment not captured. Status: ${payment.status}` });
            }
            
            paymentAmount = payment.amount; // Save the REAL amount from Razorpay
        }

        // 2. Save securely to Firestore bypassing client-side rules
        
        // Check if user already exists
        const userDoc = await db.collection('registrations').doc(phone).get();
        if (userDoc.exists) {
            return res.status(400).json({ success: false, error: 'User already registered.' });
        }

        // Public Data
        const publicData = {
            name: String(name || '').trim().substring(0, 100),
            username: String(username || '').trim().substring(0, 50),
            phone: String(phone || '').trim(),
            rating: rating === 'N/A' ? 'N/A' : (parseInt(rating, 10) || 'N/A'),
            cardId: 'Pending'
        };

        // Private Data
        const privateData = {
            email: String(email || '').trim().substring(0, 200),
            paymentId: razorpay_payment_id,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            promoCode: promoCode || null,
            discountApplied: discountApplied || 0,
            amountPaid: payment.amount // Save the REAL amount from Razorpay
        };

        const batch = db.batch();
        batch.set(db.collection('registrations').doc(phone), publicData);
        batch.set(db.collection('registrations_private').doc(phone), privateData);
        
        await batch.commit();

        return res.status(200).json({ success: true, message: 'Registration successful' });

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
}
