export default async function handler(req, res) {
    // Set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { amount, phone } = req.query;
    
    if (!amount || !phone) {
        return res.status(400).json({ error: 'Parameter amount dan phone wajib diisi' });
    }
    
    try {
        // 1. Akses halaman hotelmurah dengan parameter nomor dan nominal
        const targetUrl = `https://hotelmurah.com/pulsa/top-up-dana?phone=${phone}&amount=${amount}`;
        
        // 2. Fetch halaman tersebut
        const response = await fetch(targetUrl);
        const html = await response.text();
        
        // 3. Cari QR code yang muncul di halaman hotelmurah (QR pembayaran asli)
        //    Hotelmurah.com menampilkan QR via API qrserver.com
        const qrMatch = html.match(/https:\/\/api\.qrserver\.com\/v1\/create-qr-code\/\?size=\d+x\d+&data=[^"']+/);
        
        if (qrMatch && qrMatch[0]) {
            // Kirim QR asli dari hotelmurah
            return res.json({ 
                success: true, 
                qrUrl: qrMatch[0]
            });
        }
        
        // Fallback: jika gagal ambil QR, generate QR dari URL hotelmurah
        return res.json({ 
            success: true, 
            qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}`
        });
        
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Gagal mengambil QRIS dari hotelmurah' });
    }
}
