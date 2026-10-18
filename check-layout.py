import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
  c=await b.new_context(storage_state='qa-session.json',viewport={'width':390,'height':844})
  page=await c.new_page();await page.goto('http://localhost:4200/');await page.get_by_role('heading',name='صورة واضحة لشغلك').wait_for()
  print(await page.locator('.sidebar').evaluate('(e)=>({rect:e.getBoundingClientRect().toJSON(),css:getComputedStyle(e).cssText,position:getComputedStyle(e).position,top:getComputedStyle(e).top,transform:getComputedStyle(e).transform,translate:getComputedStyle(e).translate,style:e.outerHTML.slice(0,100),parent:getComputedStyle(e.parentElement).transform})'))
  print(await page.evaluate('({body:getComputedStyle(document.body).transform,html:getComputedStyle(document.documentElement).transform})'))
  await page.screenshot(path='qa-mobile-viewport.png')
  await b.close()
asyncio.run(main())
