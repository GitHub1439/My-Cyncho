const RESEND_API_URL = 'https://api.resend.com/emails';
const TO_EMAIL = 'Adafeng@Cyncho.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Cyncho Website <noreply@cyncho.com>';
const SUBJECT = 'New Inquiry from Cyncho Website';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getBody(req) {
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (error) {
            return {};
        }
    }
    return req.body || {};
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Email service is not configured' });
    }

    const body = getBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const companyName = String(body.company_name || '').trim();
    const content = String(body.content || '').trim();
    const website = String(body.website || '').trim();

    if (website) {
        return res.status(200).json({ ok: true });
    }

    if (!name || !email || !phone || !companyName || !content || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid inquiry information' });
    }

    const html = `
        <h2>New Inquiry from Cyncho Website</h2>
        <table style="border-collapse:collapse;width:100%;max-width:720px;font-family:Arial,sans-serif;">
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Name</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(name)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Email</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(email)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Phone / WhatsApp</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(phone)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Company</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(companyName)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Message</td>
                <td style="border:1px solid #ddd;padding:10px;white-space:pre-line;">${escapeHtml(content)}</td>
            </tr>
        </table>
    `;

    const text = [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone / WhatsApp: ${phone}`,
        `Company: ${companyName}`,
        '',
        'Message:',
        content
    ].join('\n');

    const resendResponse = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: FROM_EMAIL,
            to: [TO_EMAIL],
            reply_to: email,
            subject: SUBJECT,
            html,
            text
        })
    });

    if (!resendResponse.ok) {
        const detail = await resendResponse.text();
        console.error('Resend send failed:', detail);
        return res.status(502).json({ error: 'Email could not be sent' });
    }

    return res.status(200).json({ ok: true });
};
