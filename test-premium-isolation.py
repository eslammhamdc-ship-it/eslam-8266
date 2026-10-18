import asyncio,time,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox']);pages=[]
  async def new():
   page=await b.new_page();await page.goto('http://localhost:4200/');await page.get_by_role('button',name='حساب جديد',exact=True).click();await page.get_by_label('اسمك').fill('اختبار صلاحيات فقط');await page.get_by_label('البريد الإلكتروني',exact=True).fill(f'qa-premium-safety-{time.time_ns()}@example.com');await page.get_by_label('كلمة المرور').fill('Midway-test-2026!');await page.get_by_role('button',name='إنشاء حساب',exact=True).click();await page.get_by_role('heading',name='ماذا أفعل الآن؟').wait_for();return page
  async def rpc(page,namespace,method,args=None):
   return await page.evaluate('''async ({namespace,method,args})=>{const {client}=await import('/src/web/lib/api.ts');try{return {ok:true,data:await client[namespace][method](args)}}catch(e){return {ok:false,code:e.code}}}''',{'namespace':namespace,'method':method,'args':args})
  a=await new();c=(await rpc(a,'crm','save',{'kind':'company','data':{'name':'شركة اختبار صلاحيات','status':'عميل محتمل','priority':'A','stage':'عميل محتمل جديد'}}))['data'];r=await rpc(a,'planning','append',{'date':'2026-10-20','companyIds':[c['id']]});assert r['ok'];rows=(await rpc(a,'crm','list'))['data'];stop=next(r for r in rows if r['kind']=='stop');other=await new();assert (await rpc(other,'crm','list'))['data']==[]
  for namespace,method,args in [('planning','append',{'date':'2026-10-20','companyIds':[c['id']]}),('planning','reorder',{'ids':[stop['id']]}),('crm','save',{'id':c['id'],'kind':'company','data':c['data']})]:assert not (await rpc(other,namespace,method,args))['ok']
  backup=json.load(open('/tmp/premium-backup.json'));r=await rpc(other,'crm','restore',{'rows':backup['rows']});assert r['ok'];restored=(await rpc(other,'crm','list'))['data'];vs=[r for r in restored if r['kind']=='visit'];os=[r for r in restored if r['kind']=='opportunity'];assert all(any(v['id']==o['data']['visitId'] and v['companyId']==o['companyId'] for v in vs) for o in os);assert not (await rpc(other,'crm','restore',{'rows':backup['rows']}))['ok']
  for page in [a,other]:
   for row in (await rpc(page,'crm','list'))['data']:
    if row['kind']=='company':assert (await rpc(page,'crm','remove',{'id':row['id']}))['ok']
   assert (await rpc(page,'crm','list'))['data']==[]
  print('PASS authenticated foreign append/reorder/write denied; full backup restoration remaps visit-opportunity links; nonempty restore blocked; QA records cleared.');await b.close()
asyncio.run(main())
