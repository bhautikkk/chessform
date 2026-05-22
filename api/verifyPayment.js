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
            <h2 style="color: #333; border-bottom: 2px solid #eaeaea; padding-bottom: 15px; margin-top: 0; text-align: center;">New Enrollment Received</h2>
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
        <p style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">This email was sent automatically from your ChessBird Academy backend.</p>
        </div>`;

        const mailOptions = {
            from: `"ChessBird Academy" <${process.env.SMTP_EMAIL}>`,
            to: process.env.SMTP_EMAIL,
            bcc: bccList,
            subject: "New Enrollment: " + (publicData.name || 'ChessBird'),
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
        razorpay_key_id, // Sent from frontend to dynamically identify key
        
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
        if (!settingsDoc.exists || settingsDoc.data().isRegistrationOpen !== true) {
            return res.status(403).json({ success: false, error: 'Enrollment is currently closed.' });
        }

        let paymentAmount = amountPaid; // Default to what frontend claims

        // 1. Verify Payment OR Promo Code
        const isFreeReg = razorpay_payment_id.startsWith('FREE_');

        if (isFreeReg) {
            // Validate 100% Promo Code securely via Firestore
            if (!promoCode) {
                return res.status(400).json({ success: false, error: 'Promo code required for free enrollment' });
            }
            
            const promoDoc = await db.collection('promo_codes').doc(promoCode).get();
            if (!promoDoc.exists || promoDoc.data().active !== true || promoDoc.data().discount !== 100) {
                return res.status(400).json({ success: false, error: 'Invalid or inactive 100% free promo code' });
            }
            
            paymentAmount = 0; // Verified free
        } else {
            // Verify Razorpay Payment (100% Secure Backend Verification)
            let activeKeyId = razorpay_key_id || process.env.RAZORPAY_KEY_ID || 'rzp_test_SdF2J3WDCQa5Ko';
            let activeSecret = process.env.RAZORPAY_KEY_SECRET;

            // Dynamically switch secret if a test key is used
            if (activeKeyId.startsWith('rzp_test_')) {
                activeSecret = process.env.RAZORPAY_TEST_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
            }

            if (!activeSecret) {
                return res.status(500).json({ 
                    success: false, 
                    error: `Razorpay Secret Key is missing in Vercel. (Key ID: ${activeKeyId}). Please set it in Vercel environment variables.` 
                });
            }

            const razorpay = new Razorpay({
                key_id: activeKeyId,
                key_secret: activeSecret,
            });

            let payment;
            try {
                payment = await razorpay.payments.fetch(razorpay_payment_id);
            } catch (fetchErr) {
                console.error("Razorpay Fetch Error:", fetchErr);
                let helpfulError = "Invalid Payment ID or Key mismatch.";
                if (fetchErr.statusCode === 401) {
                    helpfulError = "Unauthorized: The Secret Key (RAZORPAY_KEY_SECRET or RAZORPAY_TEST_KEY_SECRET) in Vercel environment variables is incorrect or does not match the Key ID used by the frontend (" + activeKeyId + ").";
                } else if (fetchErr.description) {
                    helpfulError = fetchErr.description;
                }
                return res.status(400).json({ 
                    success: false, 
                    error: `${helpfulError} (Backend Key ID: ${activeKeyId})` 
                });
            }
            
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
                return res.status(400).json({ success: false, error: `Security Error: Payment amount paid (₹${payment.amount/100}) is less than the required enrollment fee (₹${expectedAmountPaise/100}).` });
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

        // Send registration email and wait for it to complete before closing the Vercel function
        try {
            await sendRegistrationEmail(publicData, privateData);
        } catch (err) {
            console.error("Failed to send registration email:", err);
        }

        return res.status(200).json({ success: true, message: 'Enrollment successful' });

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
}
