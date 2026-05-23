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
            finalSubject = `Registration Approved - ChessBird`;
            htmlContent = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #22c55e; margin: 0; font-size: 28px;">Registration Approved! 🎉</h2>
                </div>
                
                <p style="color: #333; font-size: 16px;">Hi <b>${data.name}</b>,</p>
                <p style="color: #555; font-size: 16px; line-height: 1.5;">Your registration for the upcoming ChessBird tournament has been successfully verified and approved. We are thrilled to have you on board!</p>
                
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #22c55e;">
                    <h3 style="margin: 0 0 10px 0; color: #1e293b; font-size: 18px;">Download Your Tournament Pass</h3>
                    <p style="margin: 0 0 15px 0; color: #475569; font-size: 15px;">To get your unique Entry ID and official Tournament Pass, please visit our secure pass portal. You will need to enter your registered phone number to access it.</p>
                    <a href="https://chessbirdform.vercel.app/get-pass.html" style="background-color: #22c55e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 15px; box-shadow: 0 2px 5px rgba(34, 197, 94, 0.3);">Get Your Pass Now</a>
                </div>

                <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #fde68a;">
                    <h3 style="margin: 0 0 10px 0; color: #b45309; font-size: 18px;">⚠️ Mandatory Next Step</h3>
                    <p style="margin: 0 0 15px 0; color: #78350f; font-size: 15px; line-height: 1.5;">To ensure you don't miss any critical updates, <strong>you must join our official community groups</strong>. All tournament dates, pairings, rules, and official announcements will be shared exclusively there.</p>
                    <p style="margin: 0 0 15px 0; color: #78350f; font-size: 15px;"><strong>Please join at least one (joining both is highly recommended for the best experience):</strong></p>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <a href="https://whatsapp.com/channel/0029Vb7eY6i3wtbHyPSOiW2c" style="background-color: #25D366; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px;">Join WhatsApp</a>
                        <a href="https://t.me/chessbirdofficial" style="background-color: #24A1DE; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 14px;">Join Telegram</a>
                    </div>
                </div>

                <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #bfdbfe;">
                    <h3 style="margin: 0 0 10px 0; color: #1d4ed8; font-size: 18px;">🚀 Elevate Your Game</h3>
                    <p style="margin: 0 0 15px 0; color: #1e3a8a; font-size: 15px; line-height: 1.5;">While you wait for the tournament day, start preparing like a Grandmaster! You can review your past chess games and get AI-powered insights absolutely free.</p>
                    <a href="https://chessgamereview.vercel.app/" style="background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 15px;">Review Unlimited Games for Free</a>
                </div>

                <p style="color: #555; font-size: 15px;">Best regards,<br/><b>The ChessBird Team</b></p>
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
