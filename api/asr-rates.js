import EasyPost from '@easypost/api';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

        console.log('🛰️ Incoming address to verify:', { address1, city, state, zip, country });

        // ✅ Create address
        const address = await api.Address.create({
            street1: address1,
            city,
            state,
            zip,
            country,
        });

        // ✅ Try verifying it
        let verified;
        try {
            verified = await address.verify();
            console.log('✅ EasyPost verification result:', JSON.stringify(verified, null, 2));
        } catch (verifyError) {
            console.warn('⚠️ EasyPost verification error:', verifyError.message);
            verified = null;
        }

        // ✅ Print the raw EasyPost object (only for debug)
        console.log('📦 Raw EasyPost Address object:', JSON.stringify(address, null, 2));

        // 🧠 Try to extract "residential" flag from all known paths
        const isResidential =
            verified?.verifications?.delivery?.details?.residential ??
            verified?.residential ??
            address?.residential ??
            /apt|unit|#|suite/i.test(address1);

        console.log(`🏠 Address classified as: ${isResidential ? 'Residential' : 'Commercial'}`);

        // 💵 Calculate rate
        const basePrice = 1000; // $10.00 base
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
        console.error('💥 ASR rate error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message || 'Unknown error',
        });
    }
}


