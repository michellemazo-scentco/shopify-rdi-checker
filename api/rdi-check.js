export default async function handler(req, res) {
    console.log("RDI checker triggered");

    const origin = req.headers.origin;
    const allowed = [
        'https://scentco-fundraising.myshopify.com',
        'https://centcofundraising.com s'
    ];

    // choose either the store domain or * for testing
    res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        // Pre-flight always ends here
        return res.status(200).end();
    }
    try {
        // Parse JSON body manually
        let body = {};
        try {
            const buffers = [];
            for await (const chunk of req) {
                buffers.push(chunk);
            }
            const data = Buffer.concat(buffers).toString();
            body = JSON.parse(data);
        } catch (parseErr) {
            console.error("Failed to parse JSON:", parseErr);
            return res.status(400).json({ error: "Invalid JSON body" });
        }

        const { address1, city, state, zip } = body;

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
        console.log("EasyPost response:", data);

        return res.status(200).json({
            residential: data.residential || false,
            verification: data.verifications?.delivery?.success || false,
            message: "RDI check complete"
        });
    } catch (err) {
        console.error("Handler error:", err);
        return res.status(500).json({ error: err.message });
    }
}

