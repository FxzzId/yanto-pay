export default async function handler(req, res) {
    // CORS biar bisa diakses dari frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { amount, phone } = req.query;
    
    if (!amount || !phone) {
        return res.status(400).json({ error: 'Parameter amount dan phone wajib diisi' });
    }
    
    try {
        // 1. Akses halaman hotelmurah.com
        const targetUrl = `https://hotelmurah.com/pulsa/top-up-dana?phone=${phone}&amount=${amount}`;
        
        // 2. Fetch halaman tersebut
        const response = await fetch(targetUrl);
        const html = await response.text();
        
        // 3. Cari QR code di dalam HTML
        //    Hotelmurah.com biasanya pakai API qrserver.com untuk generate QR
        const qrMatch = html.match(/https:\/\/api\.qrserver\.com\/v1\/create-qr-code\/\?size=\d+x\d+&data=[^"']+/);
        
        if (qrMatch && qrMatch[0]) {
            return res.json({ 
                success: true, 
                qrUrl: qrMatch[0],
                paymentUrl: targetUrl
            });
        }
        
        // 4. Fallback: jika tidak nemu QR, kembalikan URL-nya saja
        return res.json({ 
            success: true, 
            qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}`,
            paymentUrl: targetUrl
        });
        
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Gagal mengambil QRIS' });
    }
        }
