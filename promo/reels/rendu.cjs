// node rendu.cjs <url> <dossier> : capture 15 s à 30 images/s
const { chromium } = require('playwright');
(async () => { const [,,url,dir]=process.argv;
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1080,height:1920}});
  await p.goto(url); await p.evaluate(()=>document.fonts.ready);
  for (let i=0;i<450;i++){ await p.evaluate(t=>render(t),i/30);
    await p.screenshot({path:`${dir}/${String(i).padStart(4,'0')}.jpg`,type:'jpeg',quality:92}); }
  await b.close(); })();
