import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const { action, game, itemId, phone } = req.query;
    
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
        
        // ACTION: GET GAMES LIST
        if (action === 'getGames') {
            await page.goto('https://www.itemku.com/topup-game', { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            await page.waitForTimeout(3000);
            
            const games = await page.evaluate(() => {
                const gameItems = document.querySelectorAll('.game-item, .topup-game-item, [class*="game"]');
                const gameList = [];
                
                for (let item of gameItems) {
                    const name = item.querySelector('h3, .game-name, [class*="title"]')?.innerText;
                    const img = item.querySelector('img')?.src;
                    const link = item.querySelector('a')?.href;
                    
                    if (name && name.length > 0 && name.length < 50) {
                        gameList.push({
                            name: name.trim(),
                            image: img || null,
                            url: link || null,
                            slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-')
                        });
                    }
                }
                
                return gameList.slice(0, 20);
            });
            
            return res.status(200).json({
                success: true,
                games: games
            });
        }
        
        // ACTION: GET ITEMS BY GAME
        if (action === 'getItems') {
            if (!game) {
                return res.status(400).json({ error: 'Parameter game wajib diisi' });
            }
            
            const searchQuery = encodeURIComponent(game);
            await page.goto(`https://www.itemku.com/topup-game?q=${searchQuery}`, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            await page.waitForTimeout(4000);
            
            const items = await page.evaluate(() => {
                const products = document.querySelectorAll('.product-item, .item-product, [class*="product"]');
                const itemList = [];
                
                for (let product of products) {
                    const name = product.querySelector('.product-name, [class*="name"]')?.innerText;
                    const price = product.querySelector('.price, [class*="price"]')?.innerText;
                    const img = product.querySelector('img')?.src;
                    const link = product.querySelector('a')?.href;
                    
                    if (name && price) {
                        const priceNum = parseInt(price.replace(/[^0-9]/g, ''));
                        itemList.push({
                            name: name.trim(),
                            price: priceNum,
                            priceText: price,
                            image: img || null,
                            url: link || null
                        });
                    }
                }
                
                return itemList.slice(0, 15);
            });
            
            return res.status(200).json({
                success: true,
                game: game,
                items: items
            });
        }
        
        // ACTION: GENERATE QRIS FOR ITEMKU
        if (action === 'generateQRIS') {
            if (!itemId && !phone) {
                return res.status(400).json({ error: 'Parameter itemId dan phone wajib diisi' });
            }
            
            // Buka halaman item
            await page.goto(`https://www.itemku.com/item/${itemId}`, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });
            
            await page.waitForTimeout(3000);
            
            // Isi nomor HP/User ID
            await page.evaluate((phoneNum) => {
                const inputs = document.querySelectorAll('input');
                for (let input of inputs) {
                    if (input.type === 'text' || input.type === 'tel' || input.placeholder?.includes('ID') || input.placeholder?.includes('nomor')) {
                        input.value = phoneNum;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            }, phone);
            
            await page.waitForTimeout(1500);
            
            // Klik tombol beli/checkout
            await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a');
                for (let btn of buttons) {
                    const text = (btn.textContent || '').toLowerCase();
                    if (text.includes('beli') || text.includes('checkout') || text.includes('bayar')) {
                        btn.click();
                        break;
                    }
                }
            });
            
            await page.waitForTimeout(3000);
            
            // Pilih metode QRIS
            await page.evaluate(() => {
                const elements = document.querySelectorAll('button, a, div, label');
                for (let el of elements) {
                    const text = (el.textContent || '').toLowerCase();
                    if (text.includes('qris')) {
                        el.click();
                        break;
                    }
                }
            });
            
            await page.waitForTimeout(5000);
            
            // Screenshot QRIS
            const qrElement = await page.evaluateHandle(() => {
                const qrImg = document.querySelector('img[src*="qr"], img[src*="qris"]');
                if (qrImg) {
                    let container = qrImg.closest('div');
                    let counter = 0;
                    while (container && counter < 5) {
                        if (container.offsetWidth > 200) return container;
                        container = container.parentElement;
                        counter++;
                    }
                    return qrImg;
                }
                return null;
            });
            
            let screenshotBase64;
            
            if (qrElement) {
                const clip = await page.evaluate((el) => {
                    const rect = el.getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }, qrElement);
                screenshotBase64 = await page.screenshot({ clip, encoding: 'base64', type: 'png' });
            } else {
                screenshotBase64 = await page.screenshot({ encoding: 'base64', type: 'png' });
            }
            
            // Ambil info item
            const itemInfo = await page.evaluate(() => {
                const title = document.querySelector('h1, .product-title')?.innerText || '';
                const price = document.querySelector('.price, [class*="price"]')?.innerText || '';
                
                return {
                    title: title,
                    price: price
                };
            });
            
            const trxId = 'ITM' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
            
            return res.status(200).json({
                success: true,
                screenshot: screenshotBase64,
                trxId: trxId,
                item: itemInfo,
                phone: phone,
                timestamp: new Date().toISOString()
            });
        }
        
        return res.status(400).json({ error: 'Action tidak dikenal' });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
    }
