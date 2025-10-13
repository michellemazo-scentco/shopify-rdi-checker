// api/asr-rates.js
import EasyPost from '@easypost/api';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 🧩 Log the incoming request for debugging
    console.log('Incoming ASR request body:', JSON.stringify(req.body, null, 2));

    // 🧩 Ensure the API key exists
    if (!process.env.EASYPOST_API_KEY) {
        console.error('Missing EasyPost API key');
        return res.status(500).json({ error: 'Missing EasyPost API key' });
    }

    const api = new EasyPost(process.env.EASYPOST_API_KEY);

    try {
        // 🧩 Support both "to" and "to_address" keys (ASR uses either)
        const to = req.body.to_address || req.body.to;
        if (!to) {
            console.error('Missing "to_address" or "to" in request');
            return res.status(400).json({ error: 'Missing address in request body' });
        }

        const { address1, city, state, zip, country = 'US' } = to;

        // 🧩 Validate all fields are present
        if (!address1 || !city || !state || !zip) {
            return res.status(400).json({ error: 'Incomplete address data' });
        }

        console.log('Verifying address with EasyPost:', { address1, city, state, zip, country });

        // 🧩 Verify address
        const verified = await api.Address.create_and_verify({
            street1: address1,
            city,
            state,
            zip,
            country
        });

        // 🧩 Handle if EasyPost fails to verify
        if (!verified || !verified.verifications?.delivery?.success) {
            console.warn('EasyPost verification failed, defaulting to commercial.');
            return res.status(200).json([
                {
                    service_name: 'Standard Shipping (Unverified Address)',
                    service_code: 'STD_UNVERIFIED',
                    total_price: 1000,
                    description: 'Address could not be verified — no fee applied',
                    currency: 'USD'
                }
            ]);
        }

        const isResidential = verified.residential ?? false;

        // 🧩 Example pricing: base = $10, +$10 if residential
        const basePrice = 1000;
        const totalPrice = isResidential ? basePrice + 1000 : basePrice;

        // 🧩 Return ASR-compatible array
        const rate = {
            service_name: isResidential
                ? 'Standard (Residential Fee Applied)'
                : 'Standard Shipping',
            service_code: isResidential ? 'RES_STD' : 'STD',
            total_price: totalPrice,
            description: isResidential
                ? 'Includes $10 residential delivery fee'
                : 'Commercial address — no fee',
            currency: 'USD'
        };

        console.log('Returning rate:', rate);
        return res.status(200).json([rate]);

    } catch (error) {
        console.error('ASR rate error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message || 'Unknown error'
        });
    }
}
