import asyncio,json,time
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
  c=await b.new_context(storage_state='qa-session.json');page=await c.new_page();await page.goto('http://localhost:4200/');await page.get_by_role('heading',name='صورة واضحة لشغلك').wait_for()
  async def rpc(method,args=None):
   return await page.evaluate('''async ({method,args})=>{const {client}=await import('/src/web/lib/api.ts');try{return {ok:true,data:await client.crm[method](args)}}catch(e){return {ok:false,code:e.code,message:e.message}}}''',{'method':method,'args':args})
  before=(await rpc('list'))['data'];co=next(r for r in before if r['kind']=='company')
  dup=await rpc('save',{'kind':'company','data':co['data']});assert dup['code']=='CONFLICT',dup
  r=await rpc('save',{'id':co['id'],'kind':'company','data':{**co['data'],'notes':'اختبار تعديل محفوظ'}});assert r['ok'],r
  r=await rpc('save',{'kind':'followup','companyId':co['id'],'data':{'action':'موعد غير صحيح','due':'not-date','status':'pending'}});assert not r['ok']
  follow=next(r for r in before if r['kind']=='followup')
  r=await rpc('save',{'id':follow['id'],'kind':'followup','companyId':co['id'],'data':{**follow['data'],'due':'2026-11-01T12:00:00Z','completionNotes':'تم إرسال العرض'}});assert r['ok'],r
  await page.locator('.sidebar nav button').filter(has_text='المتابعات').click()
  async with page.expect_download() as dl:await page.get_by_role('button',name='تصدير للتقويم').click()
  f=await dl.value;await f.save_as('qa-calendar.ics');assert 'BEGIN:VALARM' in open('qa-calendar.ics').read()
  await page.locator('.sidebar nav button').filter(has_text='التقارير والبيانات').click()
  await page.locator('input[accept=".csv"]').set_input_files({'name':'import.csv','mimeType':'text/csv','buffer':'name,phone,city\nشركة استيراد الاختبار,01099988877,الجيزة'.encode()})
  await page.locator('.toast').wait_for()
  data=(await rpc('list'))['data'];assert any(r['data'].get('name')=='شركة استيراد الاختبار' for r in data)
  await page.reload();await page.get_by_role('heading',name='صورة واضحة لشغلك').wait_for()
  data=(await rpc('list'))['data'];assert next(r for r in data if r['id']==co['id'])['data']['notes']=='اختبار تعديل محفوظ'
  assert next(r for r in data if r['id']==follow['id'])['data']['due']=='2026-11-01T12:00:00Z'
  c2=await b.new_context();p2=await c2.new_page();await p2.goto('http://localhost:4200/');await p2.get_by_role('button',name='حساب جديد',exact=True).click()
  await p2.get_by_label('اسمك').fill('اختبار استعادة معزول');await p2.get_by_label('البريد الإلكتروني',exact=True).fill(f'qa-restore-{time.time_ns()}@example.com');await p2.get_by_label('كلمة المرور').fill('Midway-test-2026!');await p2.get_by_role('button',name='إنشاء حساب',exact=True).click();await p2.get_by_role('heading',name='صورة واضحة لشغلك').wait_for()
  async def rpc2(method,args=None):
   return await p2.evaluate('''async ({method,args})=>{const {client}=await import('/src/web/lib/api.ts');try{return {ok:true,data:await client.crm[method](args)}}catch(e){return {ok:false,code:e.code}}}''',{'method':method,'args':args})
  assert (await rpc2('list'))['data']==[]
  denied=await rpc2('save',{'id':co['id'],'kind':'company','data':co['data']});assert denied['code']=='NOT_FOUND'
  backup=[{k:r[k] for k in ['id','kind','companyId','data','createdAt','updatedAt']} for r in data]
  restored=await rpc2('restore',{'rows':backup});assert restored['ok'],restored
  restoredrows=(await rpc2('list'))['data'];assert len(restoredrows)==len(data)
  newco=next(r for r in restoredrows if r['kind']=='company' and r['data']['name']==co['data']['name']);assert newco['id']!=co['id']
  assert all(r['companyId']==newco['id'] for r in restoredrows if r['kind']=='visit')
  double=await rpc2('restore',{'rows':backup});assert double['code']=='CONFLICT'
  # Test explicit confirmation and cascading deletion on disposable restored account.
  await p2.reload();await p2.get_by_role('heading',name='صورة واضحة لشغلك').wait_for();await p2.locator('.sidebar nav button').filter(has_text='الشركات والعملاء').click()
  await p2.get_by_role('button',name='حذف السجل',exact=True).first.click();await p2.get_by_role('button',name='إلغاء',exact=True).click();assert len((await rpc2('list'))['data'])==len(restoredrows)
  deleted=await rpc2('remove',{'id':newco['id']});assert deleted['ok']
  remaining=(await rpc2('list'))['data'];assert not any(r['id']==newco['id'] or r['companyId']==newco['id'] for r in remaining)
  # Clear only QA-created records in both disposable QA accounts.
  for r in remaining:
   if r['kind']=='company':await rpc2('remove',{'id':r['id']})
  for r in data:
   if r['kind']=='company':await rpc('remove',{'id':r['id']})
  assert (await rpc('list'))['data']==[]
  # Check iframe-safe email bearer by removing cookies after sign-in.
  await page.get_by_role('button',name='تسجيل الخروج').click();await page.get_by_label('البريد الإلكتروني',exact=True).fill('qa-midway-20261015@example.com');await page.get_by_label('كلمة المرور').fill('Midway-test-2026!');await page.get_by_role('button',name='تسجيل الدخول',exact=True).last.click();await page.get_by_role('heading',name='صورة واضحة لشغلك').wait_for();await c.clear_cookies();assert (await rpc('list'))['ok']
  await page.reload();await page.get_by_role('heading',name='صورة واضحة لشغلك').wait_for();await page.get_by_text('eslam b2b Sales attract',exact=True).wait_for()
  await page.screenshot(path='final-desktop.png',full_page=True);await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(400);assert (await page.locator('.sidebar').bounding_box())['x']>=390;await page.screenshot(path='final-mobile.png',full_page=True)
  assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
  print('PASS: duplicate prevention, edits and rescheduling persist, date validation, ICS, CSV import, per-account isolation, unauthorized writes blocked, backup restoration + remapped links, nonempty restore blocked, deletion confirmation and cascade, email bearer without cookies, app title, mobile layout. QA records cleared.')
  await b.close()
asyncio.run(main())
