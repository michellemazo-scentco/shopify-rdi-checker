// api/asr-rates.js
import EasyPost from '@easypost/api';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('Incoming ASR request body:', JSON.stringify(req.body, null, 2));

    const apiKey = process.env.EASYPOST_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Missing EasyPost API key' });
    }

    const api = new EasyPost(apiKey);

    try {
        const to = req.body.to_address || req.body.to;
        if (!to) {
            return res.status(400).json({ error: 'Missing address in request body' });
        }

        const { address1, city, state, zip, country = 'US' } = to;

        if (!address1 || !city || !state || !zip) {
            return res.status(400).json({ error: 'Incomplete address data' });
        }

        console.log('Verifying address with EasyPost...');

        // ✅ Use EasyPost.Address.create() + verify() instead of create_and_verify()
        const address = await new api.Address({
            street1: address1,
            city,
            state,
            zip,
            country,
        }).save();

        const verified = await address.verify();

        console.log('Verification result:', verified);

        // Determine residential/commercial
        const isResidential = verified?.residential ?? false;

        const basePrice = 1000;
        const totalPrice = isResidential ? basePrice + 1000 : basePrice;

        const rate = {
            service_name: isResidential
                ? 'Standard (Residential Fee Applied)'
                : 'Standard Shipping',
            service_code: isResidential ? 'RES_STD' : 'STD',
            total_price: totalPrice,
            description: isResidential
                ? 'Includes $10 residential delivery fee'
                : 'Commercial address — no fee',
            currency: 'USD',
        };

        return res.status(200).json([rate]);
    } catch (error) {
        console.error('ASR rate error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message || 'Unknown error',
        });
    }
}

