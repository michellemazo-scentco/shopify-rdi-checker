/**
 * RDI Checker API — with Slack Error Alerts
 * Version: 2025.10
 * Author: Code GPT
 */

export default async function handler(req, res) {
    console.log('🚀 RDI Checker Triggered:', new Date().toISOString());

    // --- CORS SETUP ---
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://scentco-fundraising.myshopify.com',
        'https://centcofundraising.com',
        'https://www.centcofundraising.com'
    ];

    res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        console.log('⚙️ Preflight handled');
        return res.status(200).end();
    }

    // --- BODY PARSING ---
    let body;
    try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        body = JSON.parse(Buffer.concat(buffers).toString());
    } catch (parseErr) {
        console.error('❌ Failed to parse JSON:', parseErr);
        await logErrorToWebhook('Invalid JSON body received', parseErr);
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { address1, city, state, zip } = body || {};
    if (!address1 || !city || !state || !zip) {
        console.warn('⚠️ Missing required address fields');
        await logErrorToWebhook('Missing required address fields', null, { body });
        return res.status(400).json({ error: 'Missing required address fields' });
    }

    // --- EASypost VERIFY ---
    try {
        console.log('📦 Sending address to EasyPost:', body);

        const response = await fetch('https://api.easypost.com/v2/addresses?verify[]=delivery', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.EASYPOST_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: {
                    street1: address1,
                    city,
                    state,
                    zip,
                    country: 'US'
                }
            })
        });

        const data = await response.json();
        console.log('📬 EasyPost Raw Response:', JSON.stringify(data, null, 2));

        // Detect residential type (EasyPost often returns it nested)
        const verified = data.verifications?.delivery?.success || false;
        const residential = data.verifications?.delivery?.details?.residential === true
            || data.residential === true;

        // --- Return to Shopify frontend ---
        return res.status(200).json({
            verified,
            residential,
            message: verified
                ? (residential ? '🏠 Residential address detected' : '🏢 Commercial address detected')
                : '❌ Unable to verify address'
        });
    } catch (err) {
        console.error('💥 EasyPost API Error:', err);
        await logErrorToWebhook('EasyPost API Error', err, { body });
        return res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
}

/* ----------------------------------------------------
   SLACK LOGGER — Send alerts to your Slack channel
---------------------------------------------------- */
async function logErrorToWebhook(message, err, context = {}) {
    try {
        if (!process.env.WEBHOOK_URL) {
            console.warn('⚠️ Missing WEBHOOK_URL in environment.');
            return;
        }

        const payload = {
            text: `🚨 *RDI Checker Alert*\n> *Message:* ${message}\n> *Error:* ${err?.message || 'None'
                }\n> *Context:* \`${JSON.stringify(context, null, 2)}\`\n> *Timestamp:* ${new Date().toISOString()}`
        };

        const response = await fetch(process.env.WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log('📡 Slack Response Status:', response.status);
        if (!response.ok) {
            const text = await response.text();
            console.error('⚠️ Slack Error Response:', text);
        }
    } catch (webhookErr) {
        console.error('❌ Failed to send Slack alert:', webhookErr);
    }
}
