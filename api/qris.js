import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { amount } = req.query;
    
    // NOMOR DANA WAJIB FIXED
    const DANA_NUMBER = "089676041776";
    
    if (!amount) {
        return res.status(400).json({ error: 'Parameter amount wajib diisi' });
    }
    
    const nominal = parseInt(amount);
    
    // VALIDASI NOMINAL - HARUS SESUAI DENGAN YANG ADA DI WEB
    const validAmounts = [1000, 2000, 3000, 4000, 5000, 10000, 20000, 25000, 50000, 75000, 100000];
    
    if (!validAmounts.includes(nominal)) {
        return res.status(400).json({ 
            error: 'Nominal tidak tersedia',
            validAmounts: validAmounts
        });
    }
    
    let browser = null;
    
    try {
        const executablePath = await chromium.executablePath();
        
        browser = await puppeteer.launch({
            executablePath: executablePath,
            headless: chromium.headless,
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1280,900'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Buka website hotelmurah
        await page.goto('https://hotelmurah.com/pulsa/top-up-dana', { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        await page.waitForTimeout(3000);
        
        // === STEP 1: ISI NOMOR DANA (FIXED) ===
        console.log(`Mengisi nomor DANA: ${DANA_NUMBER}...`);
        
        const inputSelectors = [
            'input[type="tel"]',
            'input[placeholder*="HP"]',
            'input[placeholder*="nomor"]',
            'input[name*="phone"]',
            'input[name*="nohp"]',
            'input[id*="phone"]'
        ];
        
        let inputFound = false;
        for (let selector of inputSelectors) {
            try {
                const input = await page.$(selector);
                if (input) {
                    await input.click({ clickCount: 3 });
                    await input.type(DANA_NUMBER);
                    inputFound = true;
                    console.log(`Nomor DANA ${DANA_NUMBER} berhasil diisi`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!inputFound) {
            await page.evaluate((phoneNum) => {
                const inputs = document.querySelectorAll('input');
                for (let input of inputs) {
                    if (input.type === 'text' || input.type === 'tel') {
                        input.value = phoneNum;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            }, DANA_NUMBER);
        }
        
        await page.waitForTimeout(1500);
        
        // === STEP 2: PILIH NOMINAL ===
        console.log(`Memilih nominal Rp ${nominal.toLocaleString()}...`);
        
        const nominalClicked = await page.evaluate((nom) => {
            const clickables = document.querySelectorAll('button, a, .btn, [role="button"], div[onclick], span[onclick]');
            
            for (let el of clickables) {
                const text = (el.textContent || el.innerText || '').replace(/[^0-9]/g, '');
                if (text === nom.toString()) {
                    el.click();
                    return true;
                }
            }
            
            for (let el of clickables) {
                const text = (el.textContent || el.innerText || '');
                if (text.includes(nom.toString())) {
                    el.click();
                    return true;
                }
            }
            
            return false;
        }, nominal);
        
        if (!nominalClicked) {
            throw new Error(`Gagal memilih nominal Rp ${nominal.toLocaleString()}`);
        }
        
        await page.waitForTimeout(2000);
        
        // === STEP 3: PILIH METODE QRIS ===
        console.log('Memilih metode QRIS...');
        
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button, a, div, [role="button"], label');
            for (let el of elements) {
                const text = (el.textContent || '').toLowerCase();
                if (text.includes('qris')) {
                    el.click();
                    break;
                }
            }
        });
        
        // Tunggu QRIS muncul dan stabil
        await page.waitForTimeout(6000);
        
        // === STEP 4: SCREENSHOT AREA QRIS + INFO ===
        console.log('Mengambil screenshot QRIS dengan informasi...');
        
        // Cari container QRIS yang lengkap dengan info nominal
        const qrisContainer = await page.evaluateHandle(() => {
            // Cari gambar QR
            const qrImg = document.querySelector('img[src*="qrserver"], img[src*="qris"], img[src*="qr"]');
            if (qrImg) {
                let container = qrImg.closest('div');
                let counter = 0;
                while (container && counter < 6) {
                    const hasInfo = container.innerText.includes('Rp') || 
                                   container.innerText.includes('admin') ||
                                   container.innerText.includes('total');
                    if ((container.offsetWidth > 200 && container.offsetHeight > 200) || hasInfo) {
                        return container;
                    }
                    container = container.parentElement;
                    counter++;
                }
                return qrImg;
            }
            return null;
        });
        
        let screenshotBase64;
        
        if (qrisContainer) {
            const clip = await page.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }, qrisContainer);
            
            screenshotBase64 = await page.screenshot({ 
                clip, 
                encoding: 'base64',
                type: 'png'
            });
        } else {
            // Fallback: screenshot full page viewport
            screenshotBase64 = await page.screenshot({ 
                encoding: 'base64',
                type: 'png'
            });
        }
        
        // === STEP 5: AMBIL INFORMASI DARI HALAMAN ===
        const pageInfo = await page.evaluate(() => {
            const allText = document.body.innerText;
            
            // Cari biaya admin
            let adminFee = null;
            const adminPatterns = [
                /admin\s*[:;]\s*Rp\s*([0-9,.]+)/i,
                /biaya\s*admin\s*[:;]\s*Rp\s*([0-9,.]+)/i,
                /fee\s*[:;]\s*Rp\s*([0-9,.]+)/i
            ];
            
            for (let pattern of adminPatterns) {
                const match = allText.match(pattern);
                if (match) {
                    adminFee = match[1].replace(/[,.]/g, '');
                    break;
                }
            }
            
            // Cari total yang harus dibayar
            let totalAmount = null;
            const totalPatterns = [
                /total\s*[:;]\s*Rp\s*([0-9,.]+)/i,
                /jumlah\s*[:;]\s*Rp\s*([0-9,.]+)/i,
                /bayar\s*[:;]\s*Rp\s*([0-9,.]+)/i
            ];
            
            for (let pattern of totalPatterns) {
                const match = allText.match(pattern);
                if (match) {
                    totalAmount = match[1].replace(/[,.]/g, '');
                    break;
                }
            }
            
            return {
                adminFee: adminFee,
                totalAmount: totalAmount,
                pageTitle: document.title
            };
        });
        
        // Hitung biaya admin (default 2% jika tidak terdeteksi)
        const fee = pageInfo.adminFee ? parseInt(pageInfo.adminFee) : Math.ceil(nominal * 0.02);
        const totalFromPage = pageInfo.totalAmount ? parseInt(pageInfo.totalAmount) : nominal + fee;
        const trxId = 'YTO' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        console.log('✅ QRIS berhasil digenerate!');
        
        return res.status(200).json({
            success: true,
            screenshot: screenshotBase64,
            trxId: trxId,
            nominal: nominal,
            fee: fee,
            total: totalFromPage,
            phone: DANA_NUMBER,
            timestamp: new Date().toISOString(),
            message: `QRIS untuk top up Rp ${nominal.toLocaleString()} ke DANA ${DANA_NUMBER}`
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message
        });
    } finally {
        if (browser) await browser.close();
    }
                }
