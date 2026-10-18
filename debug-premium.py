import asyncio
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);page=await b.new_page();await page.goto('http://localhost:4200/');await page.get_by_label('البريد الإلكتروني',exact=True).fill('qa-midway-20261015@example.com');await page.get_by_label('كلمة المرور').fill('Midway-test-2026!');await page.get_by_role('button',name='تسجيل الدخول',exact=True).last.click();await page.get_by_role('heading',name='ماذا أفعل الآن؟').wait_for();await page.get_by_role('button',name='تسجيل زيارة سريعة',exact=True).click();print(await page.locator('dialog').inner_text());await page.screenshot(path='debug-premium.png',full_page=True);print(await page.evaluate('getComputedStyle(document.querySelector(".primary")).backgroundColor'));await b.close()
asyncio.run(main())
