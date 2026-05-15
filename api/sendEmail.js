const nodemailer = require('nodemailer');

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
        const { emails, subject, data, message } = req.body;

        if (!emails || emails.length === 0) {
            return res.status(400).json({ success: false, error: 'No recipients provided' });
        }

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
        if (message) {
            // Direct message (e.g. Activation Email)
            htmlContent = `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
                <p>${message.replace(/\n/g, '<br>')}</p>
            </div>`;
        } else if (data) {
            // Form Data (e.g. Registration)
            htmlContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px; background-color: #ffffff;">
                <h2 style="color: #333; border-bottom: 2px solid #eaeaea; padding-bottom: 15px; margin-top: 0; text-align: center;">New Registration Received</h2>
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">`;
            
            for (const [key, value] of Object.entries(data)) {
                // Skip hidden FormSubmit fields
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

        const mailOptions = {
            from: `"ChessBird System" <${process.env.SMTP_EMAIL}>`,
            to: process.env.SMTP_EMAIL, // Primary recipient is the sender account itself to avoid spam filters
            bcc: Array.isArray(emails) ? emails.join(', ') : emails, // Blind Carbon Copy to all admins
            subject: subject || 'New Notification from ChessBird',
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
