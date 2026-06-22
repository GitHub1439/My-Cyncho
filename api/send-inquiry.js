const { ratelimit } = require('../lib/ratelimit');

const RESEND_API_URL = 'https://api.resend.com/emails';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
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

function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }

    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
        return cfConnectingIp.trim();
    }

    const socketIp = req.socket && req.socket.remoteAddress;
    if (typeof socketIp === 'string' && socketIp.trim()) {
        return socketIp.trim();
    }

    return '';
}

function getTurnstileToken(body) {
    return String(
        body.turnstileToken ||
        body.cfTurnstileToken ||
        body['cf-turnstile-response'] ||
        ''
    ).trim();
}

async function verifyTurnstileToken(token, req) {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;

    if (!secretKey) {
        return { ok: false, status: 500, error: 'Verification service is not configured' };
    }

    if (!token) {
        return { ok: false, status: 400, error: 'Please complete the security verification' };
    }

    const params = new URLSearchParams();
    params.append('secret', secretKey);
    params.append('response', token);

    const clientIp = getClientIp(req);
    if (clientIp) {
        params.append('remoteip', clientIp);
    }

    try {
        const response = await fetch(TURNSTILE_VERIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            return { ok: false, status: 403, error: 'Security verification failed' };
        }

        const result = await response.json();
        if (!result.success) {
            console.warn('Turnstile verification failed:', result['error-codes'] || []);
            return { ok: false, status: 403, error: 'Security verification failed' };
        }

        return { ok: true };
    } catch (error) {
        console.error('Turnstile verification error:', error);
        return { ok: false, status: 403, error: 'Security verification failed' };
    }
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

    const ip = getClientIp(req) || 'unknown';
    if (!ratelimit) {
        return res.status(500).json({ error: 'Rate limit service is not configured' });
    }

    try {
        const { success } = await ratelimit.limit(ip);
        if (!success) {
            return res.status(429).json({
                error: 'Too many requests. Please try again later.'
            });
        }
    } catch (error) {
        console.error('Rate limit check failed:', error);
        return res.status(429).json({
            error: 'Too many requests. Please try again later.'
        });
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
    const country = String(body.country || '').trim();
    const productCategory = String(body.product_category || '').trim();
    const estimatedQuantity = String(body.estimated_quantity || '').trim();
    const timeline = String(body.timeline || '').trim();
    const content = String(body.content || '').trim();
    const website = String(body.website || '').trim();

    if (website) {
        return res.status(200).json({ ok: true, redirect: '/thank-you.html' });
    }

    const turnstileResult = await verifyTurnstileToken(getTurnstileToken(body), req);
    if (!turnstileResult.ok) {
        return res.status(turnstileResult.status).json({ error: turnstileResult.error });
    }

    if (
        !name ||
        !email ||
        !phone ||
        !companyName ||
        !country ||
        !productCategory ||
        !estimatedQuantity ||
        !content ||
        !isValidEmail(email)
    ) {
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
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Brand / Company</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(companyName)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Country</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(country)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Product Category</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(productCategory)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Estimated Quantity</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(estimatedQuantity)}</td>
            </tr>
            <tr>
                <td style="border:1px solid #ddd;padding:10px;font-weight:bold;">Timeline</td>
                <td style="border:1px solid #ddd;padding:10px;">${escapeHtml(timeline || 'Not provided')}</td>
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
        `Brand / Company: ${companyName}`,
        `Country: ${country}`,
        `Product Category: ${productCategory}`,
        `Estimated Quantity: ${estimatedQuantity}`,
        `Timeline: ${timeline || 'Not provided'}`,
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

    return res.status(200).json({ ok: true, redirect: '/thank-you.html' });
};
