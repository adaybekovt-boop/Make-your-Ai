import asyncio,os,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
    out=Path(os.environ['RENDER_PROFILE_ROOT'])/'evidence'/'asset-compatibility';out.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            page=await browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1)
            await page.goto('http://127.0.0.1:8765/baseline/src/render/perf/asset-compare.html',wait_until='networkidle')
            await page.wait_for_function('!!globalThis.__assetScene')
            await page.screenshot(path=str(out/'current-placeholder.png'))
            info=await page.evaluate('__previewGLB()')
            await page.screenshot(path=str(out/'existing-glb-preview.png'))
            (out/'comparison.json').write_text(json.dumps(info,indent=2))
            print('ASSET_COMPATIBILITY',json.dumps(info),flush=True)
        finally:await browser.close()
asyncio.run(main())
