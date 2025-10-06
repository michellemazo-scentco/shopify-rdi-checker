export default async function handler(req, res) {
    console.log("RDI checker triggered");

    try {
        const body = await req.json();
        const { address1, city, state, zip } = body;

        const response = await fetch('https://api.easypost.com/v2/addresses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.EASYPOST_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: {
                    street1: address1,
                    city,
                    state,
                    zip
                }
            })
        });

        const data = await response.json();
        console.log("EasyPost response:", data);

        return res.status(200).json({
            residential: data.residential || false,
            verification: data.verifications?.delivery?.success || false,
            message: "RDI check complete (EasyPost test mode may not show real residential results)"
        });
    } catch (err) {
        console.error("Handler error:", err);
        return res.status(500).json({ error: err.message });
    }
}

