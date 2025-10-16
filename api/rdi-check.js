/**
 * RDI Checker API — Slack Logging for Every Address
 * Logs all address checks (success or error) directly to Slack.
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

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- PARSE JSON BODY ---
    let body;
    try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        body = JSON.parse(Buffer.concat(buffers).toString());
    } catch (parseErr) {
        console.error('❌ Failed to parse JSON:', parseErr);
        await sendSlackLog({
            type: 'error',
            title: 'Invalid JSON in RDI Request',
            message: parseErr.message,
            context: {}
        });
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { address1, city, state, zip } = body || {};
    if (!address1 || !city || !state || !zip) {
        await sendSlackLog({
            type: 'error',
            title: 'Missing Required Address Fields',
            message: 'One or more required fields missing',
            context: { address1, city, state, zip }
        });
        return res.status(400).json({ error: 'Missing required address fields' });
    }

    // --- EASyPOST VERIFY ---
    try {
        const response = await fetch('https://api.easypost.com/v2/addresses?verify[]=delivery', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.EASYPOST_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: { street1: address1, city, state, zip, country: 'US' }
            })
        });

        const data = await response.json();
        console.log('📬 EasyPost Raw Response:', JSON.stringify(data, null, 2));

        const verified = data.verifications?.delivery?.success || false;
        const residential =
            data.verifications?.delivery?.details?.residential === true ||
            data.residential === true;

        // 🟢 Log Success to Slack
        await sendSlackLog({
            type: 'success',
            title: '✅ RDI Address Check Successful',
            message: verified
                ? residential
                    ? '🏠 Residential address detected'
                    : '🏢 Commercial address detected'
                : '⚠️ Address verification incomplete',
            context: {
                address: `${address1}, ${city}, ${state} ${zip}`,
                verified,
                residential
            }
        });

        return res.status(200).json({
            verified,
            residential,
            message: verified
                ? (residential ? '🏠 Residential address detected' : '🏢 Commercial address detected')
                : '❌ Unable to verify address'
        });
    } catch (err) {
        console.error('💥 EasyPost API Error:', err);

        await sendSlackLog({
            type: 'error',
            title: '💥 EasyPost API Error',
            message: err.message,
            context: {
                address: `${address1}, ${city}, ${state} ${zip}`,
                timestamp: new Date().toISOString()
            }
        });

        return res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
}

/* ----------------------------------------------------
   SLACK LOGGER — Send message to Slack every time
---------------------------------------------------- */
async function sendSlackLog({ type = 'info', title, message, context = {} }) {
    try {
        if (!process.env.WEBHOOK_URL) {
            console.warn('⚠️ Missing WEBHOOK_URL in environment.');
            return;
        }

        const color = type === 'error' ? '#e01e5a' : type === 'success' ? '#2eb67d' : '#439fe0';

        const payload = {
            attachments: [
                {
                    color,
                    title,
                    text: message,
                    fields: Object.entries(context).map(([k, v]) => ({
                        title: k,
                        value: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v),
                        short: false
                    })),
                    footer: `RDI Checker • ${new Date().toLocaleString()}`
                }
            ]
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
