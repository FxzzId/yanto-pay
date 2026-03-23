import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { amount, phone } = req.query;
    
    if (!amount || !phone) {
        return res.status(400).json({ error: 'Parameter amount dan phone wajib diisi' });
    }
    
    const nominal = parseInt(amount);
    let browser = null;
    
    try {
        const chromePath = process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium';
        
        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto('https://hotelmurah.com/pulsa/top-up-dana', { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Isi nomor HP
        await page.waitForSelector('input[type="tel"], input[placeholder*="HP"], input[placeholder*="nomor"]', { timeout: 10000 });
        await page.evaluate((phoneNum) => {
            const inputs = document.querySelectorAll('input');
            for (let input of inputs) {
                if (input.type === 'tel' || input.placeholder?.includes('HP') || input.placeholder?.includes('nomor')) {
                    input.value = phoneNum;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    break;
                }
            }
        }, phone);
        
        // Pilih nominal
        await page.evaluate((nom) => {
            const elements = document.querySelectorAll('button, a, div');
            for (let el of elements) {
                if (el.textContent && el.textContent.includes(nom.toString())) {
                    el.click();
                    break;
                }
            }
        }, nominal);
        
        await page.waitForTimeout(1500);
        
        // Pilih metode QRIS
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button, a, div');
            for (let el of elements) {
                if (el.textContent && el.textContent.toLowerCase().includes('qris')) {
                    el.click();
                    break;
                }
            }
        });
        
        await page.waitForTimeout(3000);
        
        // Cari QR code
        const qrSrc = await page.evaluate(() => {
            const img = document.querySelector('img[src*="qrserver"], img[src*="qris"]');
            return img ? img.src : null;
        });
        
        if (qrSrc) {
            return res.json({
                success: true,
                qrUrl: qrSrc,
                trxId: 'YTO' + Date.now().toString(36).toUpperCase(),
                fee: Math.ceil(nominal * 0.02),
                total: nominal,
                nominal: nominal
            });
        }
        
        throw new Error('QR tidak ditemukan');
        
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
            }
