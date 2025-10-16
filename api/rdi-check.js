export default async function handler(req, res) {
    console.log("🚀 RDI checker triggered");

    const origin = req.headers.origin;
    const allowed = [
        'https://scentco-fundraising.myshopify.com',
        'https://centcofundraising.com'
    ];

    // Set up CORS
    res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Slack webhook
    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

    // Function to send Slack messages
    async function sendSlackMessage(title, text, context = {}) {
        if (!SLACK_WEBHOOK_URL) {
            console.warn("⚠️ Slack webhook not configured — skipping Slack notification");
            return;
        }

        const message = {
            text: `*${title}*\n${text}\n\`\`\`${JSON.stringify(context, null, 2)}\`\`\``
        };

        try {
            await fetch(SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });
            console.log("📤 Slack message sent");
        } catch (err) {
            console.error("❌ Error sending Slack message:", err);
        }
    }

    try {
        // Parse body safely
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
        const referer = req.headers.referer || "";

        console.log("🔍 Referrer:", referer);

        // Verify address with EasyPost
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

        const residential = data.residential ||
            data.verifications?.delivery?.details?.residential ||
            false;

        const success = data.verifications?.delivery?.success || false;

        // --- Only send Slack message if this came from the delivery-check page ---
        if (referer.includes("/pages/delivery-check")) {
            console.log("✅ Slack notification triggered for delivery-check page");

            await sendSlackMessage(
                residential ? "🏠 Residential Address Detected" : "🏢 Commercial Address Verified",
                `Verification ${success ? "✅ Passed" : "⚠️ Failed"} from delivery-check page`,
                { address1, city, state, zip, residential, success, timestamp: new Date().toISOString() }
            );
        } else {
            console.log("🚫 Slack notification skipped (not from delivery-check page)");
        }

        return res.status(200).json({
            residential,
            verification: success,
            message: "RDI check complete"
        });

    } catch (err) {
        console.error("🔥 Handler error:", err);

        await sendSlackMessage(
            "🚨 RDI Checker Error",
            err.message,
            { stack: err.stack, timestamp: new Date().toISOString() }
        );

        return res.status(500).json({ error: err.message });
    }
}
