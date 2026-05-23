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
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        const emails = settings.notificationEmails || [];
        // If admins defined emails, send to them directly. Else fallback to SMTP email.
        const toList = emails.length > 0 ? (Array.isArray(emails) ? emails.join(', ') : emails) : process.env.SMTP_EMAIL;

        const sendFullPhone = settings.sendFullPhone !== false;
        const sendFullEmail = settings.sendFullEmail !== false;
        const sendFullUsername = settings.sendFullUsername !== false;

        const maskStr = (str, type) => {
            if (!str) return '-';
            str = String(str);
            if (type === 'phone' && !sendFullPhone && str.length >= 4) {
                return str.substring(0, 2) + '*'.repeat(str.length - 4) + str.substring(str.length - 2);
            }
            if (type === 'email' && !sendFullEmail && str.includes('@')) {
                const parts = str.split('@');
                if (parts[0].length <= 2) return str;
                return parts[0].substring(0, 2) + '*'.repeat(parts[0].length - 2) + '@' + parts[1];
            }
            if (type === 'username' && !sendFullUsername && str.length > 2) {
                return str.substring(0, 2) + '*'.repeat(str.length - 2);
            }
            return str;
        };

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_EMAIL,
                pass: process.env.SMTP_PASSWORD
            }
        });

        const dataObj = {
            name: publicData.name,
            username: maskStr(publicData.username, 'username'),
            phone: maskStr(publicData.phone, 'phone'),
            rating: publicData.rating,
            email: maskStr(privateData.email, 'email'),
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
            from: `"ChessBird" <${process.env.SMTP_EMAIL}>`,
            to: toList,
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
    // Enable CORS for frontend calls
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const origin = req.headers.origin || req.headers.referer;
    if (origin && !origin.includes('chessbirdform.vercel.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        console.warn(`Blocked verifyPayment request from unauthorized origin: ${origin}`);
        return res.status(403).json({ success: false, error: 'Unauthorized Origin' });
    }

    if (!db) {
        return res.status(500).json({ success: false, error: 'Database configuration missing in Vercel.' });
    }

    const { 
        paymentId, 
        name,
        username,
        email,
        phone,
        rating,
        promoCode,
        discountApplied,
        amountPaid
    } = req.body;

    if (!paymentId || !phone) {
        return res.status(400).json({ success: false, error: 'Missing payment or user details' });
    }

    try {
        // --- SECURITY ENHANCEMENT: CHECK IF REGISTRATION IS OPEN ---
        const settingsDoc = await db.collection('settings').doc('global').get();
        if (!settingsDoc.exists || settingsDoc.data().isRegistrationOpen !== true) {
            return res.status(403).json({ success: false, error: 'Registration is currently closed.' });
        }

        let paymentAmount = 0;

        // 1. Verify Payment OR Promo Code
        const isFreeReg = paymentId.startsWith('FREE_');
        const isUpiReg = paymentId.startsWith('UPI_');

        if (!isFreeReg && !isUpiReg) {
            return res.status(400).json({ success: false, error: 'Invalid paymentId format.' });
        }

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
            // UPI Payment verification
            const utr = paymentId.substring(4); // remove "UPI_" prefix
            if (utr.length !== 12 || !/^\d{12}$/.test(utr)) {
                return res.status(400).json({ success: false, error: 'UTR must be exactly 12 digits.' });
            }

            // Check duplicate UTR in Firestore to prevent replay attacks
            const duplicateCheck = await db.collection('registrations_private').where('paymentId', '==', paymentId).get();
            if (!duplicateCheck.empty) {
                return res.status(400).json({ success: false, error: 'This UTR has already been submitted.' });
            }

            // Calculate correct expected fee amount based on settings configuration and applied promo code
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
            paymentAmount = Math.round((baseFeeRs * 100) * (1 - expectedDiscount / 100));
        }

        // Check if user already exists
        const userDoc = await db.collection('registrations').doc(phone).get();
        if (userDoc.exists) {
            return res.status(400).json({ success: false, error: 'User already registered with this phone number.' });
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
            paymentId: paymentId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            promoCode: promoCode || null,
            discountApplied: discountApplied || 0,
            amountPaid: paymentAmount // Store the expected payment in paise
        };

        const batch = db.batch();
        batch.set(db.collection('registrations').doc(phone), publicData);
        batch.set(db.collection('registrations_private').doc(phone), privateData);
        await batch.commit();

        // Send admin notification email for new registration
        sendRegistrationEmail(publicData, privateData).catch(e =>
            console.error('Registration notification email failed (non-blocking):', e)
        );

        return res.status(200).json({ success: true, message: 'Registration successful' });

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
}
