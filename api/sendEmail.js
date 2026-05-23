const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

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
        if (decodedToken.email !== 'bhautikk264@gmail.com') {
            return res.status(403).json({ success: false, error: 'Forbidden: Only the admin can call this endpoint.' });
        }

        const origin = req.headers.origin || req.headers.referer;
        if (origin && !origin.includes('chessbirdform.vercel.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
            console.warn(`Blocked request from unauthorized origin: ${origin}`);
            return res.status(403).json({ success: false, error: 'Unauthorized Origin' });
        }

        const { subject, data, message, emailType, playerEmail } = req.body;

        const settingsSnap = await admin.firestore().collection('settings').doc('global').get();
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        const emails = settings.notificationEmails || [];
        const adminToList = emails.length > 0 ? (Array.isArray(emails) ? emails.join(', ') : emails) : process.env.SMTP_EMAIL;

        if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
            console.warn("SMTP_EMAIL or SMTP_PASSWORD is not set in Vercel environment variables. Email skipping.");
            return res.status(200).json({ success: true, message: 'Dev Mode: Simulated email send (Missing SMTP env vars)' });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_EMAIL,
                pass: process.env.SMTP_PASSWORD
            }
        });

        let htmlContent = '';
        let recipient = adminToList;
        let finalSubject = subject || 'New Notification from ChessBird';

        if (emailType === 'player_approval') {
            recipient = playerEmail;
            finalSubject = `Registration Approved - ChessBird (Entry ID: ${data.cardId})`;
            htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #ffffff;">
                <h2 style="color: #22c55e; text-align: center;">Registration Approved! 🎉</h2>
                <p>Hi <b>${data.name}</b>,</p>
                <p>Your registration for the upcoming ChessBird tournament has been successfully verified and approved.</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #22c55e;">
                    <p style="margin: 0; font-size: 16px;">Your Entry ID: <strong>${data.cardId}</strong></p>
                    <p style="margin: 5px 0 0 0; color: #555;">Chess.com Username: ${data.username}</p>
                </div>
                <p>Please keep this Entry ID handy. We will share the tournament link and further instructions in the WhatsApp/Telegram group shortly.</p>
                <br/>
                <p>Best regards,<br/><b>The ChessBird Team</b></p>
            </div>`;
        } else if (emailType === 'player_rejection') {
            recipient = playerEmail;
            finalSubject = `Registration Update - ChessBird`;
            htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #ffffff;">
                <h2 style="color: #ef4444; text-align: center;">Registration Update</h2>
                <p>Hi <b>${data.name}</b>,</p>
                <p>We regret to inform you that your registration could not be approved at this time. This usually happens if the payment verification failed or the details provided were incomplete/incorrect.</p>
                <p>If you believe this is a mistake or if you have already completed the payment, please contact our support team immediately.</p>
                <br/>
                <p>Best regards,<br/><b>The ChessBird Team</b></p>
            </div>`;
        } else {
            // Default: Admin Notification
            // Apply privacy masking for admin emails
            if (data) {
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

                if (data.phone) data.phone = maskStr(data.phone, 'phone');
                if (data.email) data.email = maskStr(data.email, 'email');
                if (data.username) data.username = maskStr(data.username, 'username');
            }

            if (message) {
                htmlContent = `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
                    <p>${message.replace(/\n/g, '<br>')}</p>
                </div>`;
            } else if (data) {
                htmlContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #ffffff;">
                    <h2 style="color: #333; border-bottom: 2px solid #eaeaea; padding-bottom: 15px; margin-top: 0; text-align: center;">${subject || 'New Notification'}</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">`;
                
                for (const [key, value] of Object.entries(data)) {
                    if (key.startsWith('_')) continue;
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
            } else {
                htmlContent = '<p>No data provided.</p>';
            }
        }

        const mailOptions = {
            from: `"ChessBird System" <${process.env.SMTP_EMAIL}>`,
            to: recipient,
            subject: finalSubject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully: ', info.messageId);
        
        return res.status(200).json({ success: true, message: 'Emails sent successfully' });

    } catch (error) {
        console.error('Email sending error:', error);
        return res.status(500).json({ success: false, error: 'Failed to send email: ' + error.message });
    }
}
