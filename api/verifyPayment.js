const Razorpay = require('razorpay');
const crypto = require('crypto');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

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

async function sendRegistrationEmail(publicData, privateData) {
    if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
        console.warn("SMTP_EMAIL or SMTP_PASSWORD is not set in environment. Email skipping.");
        return;
    }

    try {
        const settingsSnap = await admin.firestore().collection('settings').doc('global').get();
        const emails = settingsSnap.exists ? (settingsSnap.data().notificationEmails || []) : [];
        const bccList = emails.length > 0 ? (Array.isArray(emails) ? emails.join(', ') : emails) : '';

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_EMAIL,
                pass: process.env.SMTP_PASSWORD
            }
        });

        const dataObj = {
            name: publicData.name,
            username: publicData.username,
            phone: publicData.phone,
            rating: publicData.rating,
            email: privateData.email,
            paymentId: privateData.paymentId,
            promoCode: privateData.promoCode || 'None',
            discountApplied: `${privateData.discountApplied || 0}%`,
            amountPaid: `₹${(privateData.amountPaid || 0) / 100}`
        };

        let htmlContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #ffffff;">
            <h2 style="color: #333; border-bottom: 2px solid #eaeaea; padding-bottom: 15px; margin-top: 0; text-align: center;">New Registration Received</h2>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">`;
        
        for (const [key, value] of Object.entries(dataObj)) {
            htmlContent += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #eaeaea; background-color: #fcfcfc; font-weight: bold; width: 35%; color: #555; text-transform: capitalize;">${key}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eaeaea; color: #333;">${value || '-'}</td>
                </tr>
            `;
        }
        htmlContent += `</table>
        <p style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">This email was sent automatically from your ChessBird backend.</p>
        </div>`;

        const mailOptions = {
            from: `"ChessBird System" <${process.env.SMTP_EMAIL}>`,
            to: process.env.SMTP_EMAIL,
            bcc: bccList,
            subject: "New Registration: " + (publicData.name || 'ChessBird'),
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Registration notification email sent: ', info.messageId);
    } catch (err) {
        console.error('Error sending registration notification email:', err);
    }
}

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
        // --- SECURITY ENHANCEMENT: CHECK IF REGISTRATION IS OPEN ---
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (settingsDoc.exists && settingsDoc.data().registrationOpen === false) {
            return res.status(403).json({ success: false, error: 'Registration is currently closed.' });
        }

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

            // --- SECURITY ENHANCEMENT: VERIFY PRICE ---
            let baseFeeRs = 29; // default fallback
            if (settingsDoc.exists && settingsDoc.data().registrationFee) {
                baseFeeRs = parseInt(settingsDoc.data().registrationFee, 10) || 29;
            }
            
            let expectedDiscount = 0;
            if (promoCode) {
                const promoDoc = await db.collection('promo_codes').doc(promoCode).get();
                if (promoDoc.exists && promoDoc.data().active === true) {
                    expectedDiscount = Number(promoDoc.data().discount) || 0;
                }
            }
            
            const expectedAmountPaise = Math.round((baseFeeRs * 100) * (1 - expectedDiscount / 100));

            if (payment.amount < expectedAmountPaise) {
                console.error(`PRICE TAMPERING DETECTED: Expected ${expectedAmountPaise} paise, but received ${payment.amount} paise.`);
                return res.status(400).json({ success: false, error: `Security Error: Payment amount paid (₹${payment.amount/100}) is less than the required tournament fee (₹${expectedAmountPaise/100}).` });
            }
            // ------------------------------------------
            
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
            amountPaid: paymentAmount // Save the REAL amount
        };

        const batch = db.batch();
        batch.set(db.collection('registrations').doc(phone), publicData);
        batch.set(db.collection('registrations_private').doc(phone), privateData);
        
        await batch.commit();

        // Send registration email in background
        sendRegistrationEmail(publicData, privateData).catch(err => {
            console.error("Async email error:", err);
        });

        return res.status(200).json({ success: true, message: 'Registration successful' });

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
}
