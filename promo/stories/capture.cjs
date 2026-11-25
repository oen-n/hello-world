// node promo/stories/capture.cjs <url> <sortie.jpg>
const { chromium } = require('playwright');
(async () => { const [,,url,out]=process.argv; const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1080,height:1920}}); await p.goto(url); await p.evaluate(()=>document.fonts.ready);
  await p.waitForTimeout(300); await p.screenshot({path:out,type:'jpeg',quality:92}); await b.close(); })();
