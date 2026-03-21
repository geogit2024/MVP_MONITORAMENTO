import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('BROWSER ERROR:', msg.text());
    }
  });
  page.on('pageerror', error => {
    console.error('PAGE ERROR:', error.message);
  });
  console.log("Iniciando navegação para http://localhost:5173");
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 10000 });
  console.log("Navegação concluída.");
  await browser.close();
})();
