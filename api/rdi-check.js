export default async function handler(req, res) {
    console.log('🚀 RDI Checker Triggered at', new Date().toISOString());

    // 🔐 CORS Handling
    const origin = req.headers.origin;
    const allowed = [
        'https://scentco-fundraising.myshopify.com',
        'https://centcofundraising.com'
    ];

    res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        console.log('⚙️ Preflight request handled.');
        return res.status(200).end();
    }

    // 🧩 Parse body safely
    let body;
    try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString();
        body = JSON.parse(raw || '{}');
        console.log('📦 Parsed request body:', body);
    } catch (err) {
        console.error('💥 JSON parse failed:', err.message);
        await logErrorToWebhook('Invalid JSON Body', err, { rawBody: raw });
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { address1, city, state, zip } = body || {};

    if (!address1 || !city || !state || !zip) {
        console.error('⚠️ Missing one or more required fields:', body);
        await logErrorToWebhook('Missing required fields', null, { body });
        return res.status(400).json({ error: 'Missing address fields' });
    }

    try {
        // 🧠 Log EasyPost Request
        console.log('📬 Sending verification to EasyPost for:', `${address1}, ${city}, ${state} ${zip}`);

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

        // 🧾 Log everything from EasyPost
        console.log('📦 Raw EasyPost response:', JSON.stringify(data, null, 2));

        if (response.status >= 400) {
            console.error('❌ EasyPost API returned an error:', data);
            await logErrorToWebhook('EasyPost API Error', null, { responseStatus: response.status, data });
            return res.status(response.status).json({
                error: 'EasyPost API error',
                details: data
            });
        }

        // 🧮 Extract relevant verification data
        const verification = data?.verifications?.delivery;
        const isResidential =
            verification?.details?.residential ??
            data.residential ??
            /apt|unit|#|suite/i.test(address1);

        const result = {
            residential: !!isResidential,
            verification_success: !!verification?.success,
            message: isResidential
                ? '🏠 Residential address detected'
                : '🏢 Commercial address detected'
        };

        console.log('✅ Address classification result:', result);

        return res.status(200).json(result);
    } catch (err) {
        console.error('💥 Handler error:', err);
        await logErrorToWebhook('Unhandled Server Error', err, { body });
        return res.status(500).json({ error: err.message });
    }
}

/**
 * 🔔 Optional: Send real-time error alerts to Discord, Slack, or your webhook.
 * (Set WEBHOOK_URL in Vercel environment variables)
 */
async function logErrorToWebhook(message, err, context = {}) {
    try {
        if (!process.env.WEBHOOK_URL) return;
        await fetch(process.env.WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                message,
                error: err?.message || null,
                context
            })
        });
    } catch (webhookErr) {
        console.warn('⚠️ Failed to send error to webhook:', webhookErr.message);
    }
}
