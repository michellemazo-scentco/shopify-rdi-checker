// api/rdi-check.js
export default async function handler(req, res) {
    console.log("🚀 RDI checker triggered");

    // --- Allow requests from your Shopify domain ---
    const origin = req.headers.origin;
    const allowed = [
        'https://scentco-fundraising.myshopify.com',
        'https://centcofundraising.com'
    ];

    res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-page-context');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 🧠 Helper: send Slack logs
    async function sendSlackLog(payload) {
        const webhook = process.env.SLACK_WEBHOOK_URL;
        if (!webhook) {
            console.warn("⚠️ Slack webhook not set — skipping notification");
            return;
        }

        const emoji = payload.type === 'error'
            ? '🚨'
            : payload.type === 'warning'
                ? '🏠'
                : '✅';

        const text = `*${emoji} ${payload.title}*\n${payload.message}\n\`\`\`${JSON.stringify(payload.context, null, 2)}\`\`\``;

        await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
    }

    try {
        // --- Parse JSON body safely ---
        let body = {};
        try {
            const buffers = [];
            for await (const chunk of req) buffers.push(chunk);
            const data = Buffer.concat(buffers).toString();
            body = JSON.parse(data);
        } catch (parseErr) {
            console.error("❌ Failed to parse JSON:", parseErr);
            return res.status(400).json({ error: "Invalid JSON body" });
        }

        const { address1, city, state, zip } = body;

        // --- Detect page context for filtering Slack messages ---
        const referer = req.headers.referer || '';
        const pageContext = req.headers['x-page-context'] || body.source || 'unknown';
        console.log(`🧭 Triggered from: ${pageContext} (${referer})`);

        // --- Verify address via EasyPost ---
        const response = await fetch('https://api.easypost.com/v2/addresses?verify[]=delivery', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.EASYPOST_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: { street1: address1, city, state, zip }
            })
        });

        const data = await response.json();
        console.log("📦 EasyPost response:", JSON.stringify(data, null, 2));

        const residential = data.residential ?? data.verifications?.delivery?.details?.residential ?? false;
        const success = data.verifications?.delivery?.success ?? false;

        // --- Slack filtering logic ---
        const shouldNotifySlack =
            referer.includes('/pages/delivery-check') || pageContext === 'delivery-check';

        if (shouldNotifySlack) {
            await sendSlackLog({
                type: residential ? 'warning' : 'success',
                title: residential ? '🏠 Residential Address Detected' : '🏢 Commercial Address Verified',
                message: `Triggered from ${pageContext} (${referer})\nVerification: ${success ? '✅ Passed' : '⚠️ Failed'}`,
                context: { address1, city, state, zip, residential, success, time: new Date().toISOString() }
            });
        } else {
            console.log(`🔕 Slack notification skipped (triggered from ${referer || pageContext})`);
        }

        // --- Respond back to the frontend ---
        return res.status(200).json({
            residential,
            verification: success,
            message: success ? "RDI check complete" : "Address verification failed",
        });

    } catch (err) {
        console.error("🔥 Handler error:", err);

        // --- Always send critical errors to Slack ---
        await sendSlackLog({
            type: 'error',
            title: 'RDI Checker Error',
            message: err.message,
            context: { stack: err.stack, time: new Date().toISOString() }
        });

        return res.status(500).json({ error: err.message });
    }
}
