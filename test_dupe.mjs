const fs = require('fs');

async function testDupe() {
  const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  };

  const testUrl = 'https://www.instagram.com/reel/DTtie9YktlH/';
  const resp = await fetch(testUrl, { headers: BROWSER_HEADERS, redirect: 'follow' });
  const html = await resp.text();

  const vvMatch = html.match(/"video_versions"\s*:\s*\[([\s\S]*?)\]/);
  if (vvMatch) {
    const block = vvMatch[0];
    console.log("Raw block:", block.substring(0, 500) + "...\n");
    
    const urlRegex = /"url"\s*:\s*"([^"]+\.mp4[^"]*)"/g;
    let urlMatch;
    let i = 1;
    while ((urlMatch = urlRegex.exec(block)) !== null) {
      console.log(`URL ${i}:`, urlMatch[1].substring(0, 150));
      i++;
    }
    
    const widthRegex = /"width"\s*:\s*(\d+)/g;
    let wMatch;
    i = 1;
    while ((wMatch = widthRegex.exec(block)) !== null) {
      console.log(`Width ${i}:`, wMatch[1]);
      i++;
    }
  }
}

testDupe().catch(console.error);
