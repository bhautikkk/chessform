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
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&family=Inter:wght@400;500;600&display=swap');
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 20px 10px;">
                    <tr>
                        <td align="center">
                            <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.08);">
                                <!-- Header -->
                                <tr>
                                    <td style="background-color: #111113; padding: 30px 20px; text-align: center; border-bottom: 2px solid #eab308;">
                                        <img src="https://chessbirdform.vercel.app/header_logo.png" alt="ChessBird" style="height: 40px; margin-bottom: 15px;">
                                        <h1 style="margin: 0; font-family: 'Outfit', sans-serif; color: #ffffff; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">
                                            <span style="color: #22c55e;">Registration</span> Approved
                                        </h1>
                                        <p style="margin: 8px 0 0 0; color: #a1a1aa; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">Welcome to the Elite Arena</p>
                                    </td>
                                </tr>
                                
                                <!-- Body -->
                                <tr>
                                    <td style="padding: 30px 20px;">
                                        <p style="margin: 0 0 20px 0; color: #18181b; font-size: 16px; font-weight: 600;">Hi ${data.name},</p>
                                        <p style="margin: 0 0 25px 0; color: #52525b; font-size: 15px; line-height: 1.6;">Your registration for the upcoming ChessBird tournament has been successfully verified. You are now officially on the roster.</p>
                                        
                                        <!-- Pass Section -->
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #22c55e; margin-bottom: 25px;">
                                            <tr>
                                                <td style="padding: 20px;">
                                                    <h3 style="margin: 0 0 10px 0; color: #0f172a; font-family: 'Outfit', sans-serif; font-size: 17px;">🎫 Official Tournament Pass</h3>
                                                    <p style="margin: 0 0 15px 0; color: #475569; font-size: 14px; line-height: 1.5;">Your unique Entry ID and digital tournament pass are ready. You will need your registered phone number to access the secure portal.</p>
                                                    <a href="https://chessbirdform.vercel.app/get-pass.html" style="display: inline-block; background-color: #22c55e; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center;">Download Pass Now</a>
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- Community Section -->
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fffbeb; border-radius: 12px; border: 1px solid #fde68a; margin-bottom: 25px;">
                                            <tr>
                                                <td style="padding: 20px;">
                                                    <h3 style="margin: 0 0 10px 0; color: #92400e; font-family: 'Outfit', sans-serif; font-size: 17px;">⚠️ Mandatory Next Step</h3>
                                                    <p style="margin: 0 0 15px 0; color: #92400e; font-size: 14px; line-height: 1.5;">To ensure you receive critical updates, pairings, and official announcements, <strong>you must join our community groups</strong>.</p>
                                                    
                                                    <div style="text-align: left;">
                                                        <a href="https://whatsapp.com/channel/0029Vb7eY6i3wtbHyPSOiW2c" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px; margin-right: 5px;">Join WhatsApp</a>
                                                        <a href="https://t.me/chessbirdofficial" style="display: inline-block; background-color: #24A1DE; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px;">Join Telegram</a>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- Promo Section -->
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); border-radius: 12px; margin-bottom: 30px;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <h3 style="margin: 0 0 10px 0; color: #ffffff; font-family: 'Outfit', sans-serif; font-size: 18px;">🚀 Elevate Your Game</h3>
                                                    <p style="margin: 0 0 20px 0; color: #bfdbfe; font-size: 15px; line-height: 1.5;">Start preparing like a Grandmaster today. Review your past chess games and get AI-powered insights absolutely free.</p>
                                                    <a href="https://chessgamereview.vercel.app/" style="display: inline-block; background-color: #ffffff; color: #1e3a8a; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px;">Review Games for Free &rarr;</a>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin: 0; color: #71717a; font-size: 15px; line-height: 1.6;">See you on the board,<br><strong style="color: #18181b;">The ChessBird Team</strong></p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #fafafa; padding: 24px 30px; text-align: center; border-top: 1px solid #f4f4f5;">
                                        <p style="margin: 0; color: #a1a1aa; font-size: 12px;">© ${new Date().getFullYear()} ChessBird. All rights reserved.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>`;
        } else if (emailType === 'player_rejection') {
            recipient = playerEmail;
            finalSubject = `Registration Update - ChessBird`;
            htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&family=Inter:wght@400;500;600&display=swap');
                </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 20px 10px;">
                    <tr>
                        <td align="center">
                            <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.08);">
                                <!-- Header -->
                                <tr>
                                    <td style="background-color: #111113; padding: 30px 20px; text-align: center; border-bottom: 2px solid #ef4444;">
                                        <img src="https://chessbirdform.vercel.app/header_logo.png" alt="ChessBird" style="height: 40px; margin-bottom: 15px;">
                                        <h1 style="margin: 0; font-family: 'Outfit', sans-serif; color: #ffffff; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">
                                            <span style="color: #ef4444;">Action</span> Required
                                        </h1>
                                        <p style="margin: 8px 0 0 0; color: #a1a1aa; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;">Payment Verification Failed</p>
                                    </td>
                                </tr>
                                
                                <!-- Body -->
                                <tr>
                                    <td style="padding: 30px 20px;">
                                        <p style="margin: 0 0 20px 0; color: #18181b; font-size: 16px; font-weight: 600;">Hi ${data.name},</p>
                                        <p style="margin: 0 0 25px 0; color: #52525b; font-size: 15px; line-height: 1.6;">We could not verify the payment for your recent tournament registration. As a result, your entry has been declined and your data has been cleared.</p>
                                        
                                        <!-- Error Section -->
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border-radius: 12px; border-left: 4px solid #ef4444; margin-bottom: 25px;">
                                            <tr>
                                                <td style="padding: 20px;">
                                                    <h3 style="margin: 0 0 10px 0; color: #991b1b; font-family: 'Outfit', sans-serif; font-size: 17px;">❌ Why did this happen?</h3>
                                                    <p style="margin: 0 0 0 0; color: #991b1b; font-size: 14px; line-height: 1.5;">This usually happens if the 12-digit UTR/Transaction ID you entered was incorrect or mismatched with our bank records.</p>
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- Fix Section -->
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 25px;">
                                            <tr>
                                                <td style="padding: 20px;">
                                                    <h3 style="margin: 0 0 10px 0; color: #0f172a; font-family: 'Outfit', sans-serif; font-size: 17px;">🔄 How to fix this</h3>
                                                    <p style="margin: 0 0 15px 0; color: #475569; font-size: 14px; line-height: 1.5;">If you made a genuine mistake, you can simply register again with the correct 12-digit UTR number.</p>
                                                    <a href="https://chessbirdform.vercel.app/" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center;">Register Again</a>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin: 0; color: #71717a; font-size: 15px; line-height: 1.6;">If you need help, please contact our support team.<br><br><strong style="color: #18181b;">The ChessBird Team</strong></p>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #fafafa; padding: 24px 30px; text-align: center; border-top: 1px solid #f4f4f5;">
                                        <p style="margin: 0; color: #a1a1aa; font-size: 12px;">© ${new Date().getFullYear()} ChessBird. All rights reserved.</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>`;
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
