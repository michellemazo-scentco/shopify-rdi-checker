import EasyPost from '@easypost/api';

export default async function handler(req, res) {
    const apiKey = process.env.EASYPOST_API_KEY;
    const api = new EasyPost(apiKey);

    try {
        // Basic Auth (optional, remove if not using it)
        const auth = req.headers.authorization || '';
        if (process.env.ASR_USER && process.env.ASR_PASS) {
            const [type, encoded] = auth.split(' ');
            if (type !== 'Basic') throw new Error('Missing auth header');
            const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
            if (user !== process.env.ASR_USER || pass !== process.env.ASR_PASS) {
                throw new Error('Invalid credentials');
            }
        }

        const to = req.body.to_address || req.body.to;
        if (!to) throw new Error('Missing to_address');

        const { address1, city, state, zip, country = 'US' } = to;

        // 🚀 Force verification
        const address = await api.Address.create({
            street1: address1,
            city,
            state,
            zip,
            country,
            verify: ['delivery'],
        });

        const verified = address.verifications?.delivery;
        const isResidential =
            verified?.details?.residential ??
            address.residential ??
            /apt|unit|#|suite/i.test(address1);

        console.log(`🏠 Address classified as: ${isResidential ? 'Residential' : 'Commercial'}`);

        const rate = {
            service_name: isResidential
                ? 'Standard (Residential Fee Applied)'
                : 'Standard Shipping',
            service_code: isResidential ? 'RES_STD' : 'STD',
            total_price: isResidential ? 2000 : 1000, // 10.00 vs 20.00
            description: isResidential
                ? 'Includes $10 residential delivery fee'
                : 'Commercial address — no fee',
            currency: 'USD',
        };

        // ✅ ASR requires an array, so always wrap in []
        return res.status(200).json([rate]);
    } catch (error) {
        console.error('💥 ASR error:', error.message);

        // ✅ Always return a valid array even on error
        return res.status(200).json([
            {
                service_name: 'Standard Shipping (Fallback)',
                service_code: 'FALLBACK',
                total_price: 1000,
                description: `Error: ${error.message}`,
                currency: 'USD',
            },
        ]);
    }
}



