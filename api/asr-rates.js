// api/asr-rates.js
import EasyPost from '@easypost/api';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const api = new EasyPost(process.env.EASYPOST_API_KEY);

    try {
        const { to_address } = req.body;
        if (!to_address) {
            return res.status(400).json({ error: 'Missing to_address in request body' });
        }

        const { address1, city, state, zip, country = 'US' } = to_address;

        // ✅ Verify address via EasyPost
        const verified = await api.Address.create_and_verify({
            street1: address1,
            city,
            state,
            zip,
            country
        });

        const isResidential = verified?.residential ?? false;

        // Example: base shipping cost $10, residential adds $10 more
        const basePrice = 1000; // in cents
        const totalPrice = isResidential ? basePrice + 1000 : basePrice;

        // ✅ Return ASR-compatible JSON array
        return res.status(200).json([
            {
                service_name: isResidential
                    ? 'Standard (Residential Address Fee Applied)'
                    : 'Standard Shipping',
                service_code: isResidential ? 'RES_STD' : 'STD',
                total_price: totalPrice,
                description: isResidential
                    ? 'Includes $10 residential delivery fee'
                    : 'Commercial address — no fee',
                currency: 'USD'
            }
        ]);
    } catch (error) {
        console.error('ASR Rate API Error:', error);
        return res.status(500).json({ error: 'Failed to get shipping rates', details: error.message });
    }
}

