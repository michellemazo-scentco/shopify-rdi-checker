export default async function handler(req, res) {
    try {
        const { address1, city, state, zip } = req.body;

        const epRes = await fetch('https://api.easypost.com/v2/addresses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.EASYPOST_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: { street1: address1, city, state, zip }
            })
        });

        const data = await epRes.json();
        res.status(200).json({
            residential: data.residential || false,
            verification: data.verifications?.delivery?.success || false
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
