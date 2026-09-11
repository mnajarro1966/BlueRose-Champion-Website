const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const serve = require('./serve.cjs');

test('Parents workflow, upload retry, responsive preview, public album, and unconfigured fallback', { timeout: 90000 }, async () => {
  const server = serve(0);
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined }).catch(error => { server.close(); throw error; });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const albums = [], photos = []; let failUpload = true, uploadCalls = 0;
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'parent@example.test', aud: 'authenticated', role: 'authenticated' };
  const token = `${Buffer.from(JSON.stringify({ alg:'HS256',typ:'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub:user.id,exp:Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.test`;
  const tinyPng = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=600; canvas.height=400;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#2563eb'; ctx.fillRect(0,0,600,400);
    ctx.fillStyle='#fff'; ctx.font='40px Arial'; ctx.fillText('Blue’s Journey',40,200);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  try {
    await page.goto(origin + '/admin');
    await page.getByText('The parents’ panel is ready, but sign-in has not been activated yet.', { exact:false }).waitFor();
    assert.equal(await page.locator('#login').isVisible(), false);
    await context.route('**/journey-config.js', route => route.fulfill({ contentType:'text/javascript', body:"export const journeyConfig={supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'};" }));
    await context.route('https://test.supabase.co/**', async route => {
      const req = route.request(), url = new URL(req.url()), method = req.method();
      let body; try { body = req.postDataJSON(); } catch {}
      const json = (data, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(data) });
      if (method === 'OPTIONS') return route.fulfill({status:204});
      if (url.pathname.endsWith('/otp')) { assert.equal(body.create_user,false); return json({}); }
      if (url.pathname.endsWith('/verify')) return json({ access_token:token,refresh_token:'test',token_type:'bearer',expires_in:3600,user });
      if (url.pathname.endsWith('/user')) return json(user);
      if (url.pathname.endsWith('/logout')) return json({});
      if (url.pathname.endsWith('/rpc/is_journey_editor')) return json(true);
      if (url.pathname.endsWith('/rpc/set_journey_published')) { albums.find(a=>a.id===body.album).published=body.visible; return json(null); }
      if (url.pathname.includes('/storage/v1/object/sign/')) {
        if (method==='POST') return json(body.paths.map(path=>({path,signedURL:`/object/sign/journey-photos/${path}?token=test`,error:null})));
        return route.fulfill({contentType:'image/png',body:tinyPng});
      }
      if (url.pathname.includes('/storage/v1/object/journey-photos/')) {
        uploadCalls++;
        if (failUpload) { failUpload=false; return json({statusCode:'503',message:'Upload interrupted',error:'Temporary failure'},503); }
        return json({ Key:'journey-photos/test',Id:'test' });
      }
      if (url.pathname.endsWith('/journey_albums')) {
        if (method==='POST') { albums.push({...body,published:false}); return json(null,201); }
        if (method==='PATCH') { const a=albums.find(a=>'eq.'+a.id===url.searchParams.get('id')); Object.assign(a,body); return json(a); }
        let found=albums.filter(a=>!url.searchParams.get('id')||'eq.'+a.id===url.searchParams.get('id'));
        if(url.searchParams.get('published')==='eq.true') found=found.filter(a=>a.published);
        if(url.searchParams.get('select')?.includes('journey_photos')) found=found.map(a=>({...a,journey_photos:photos.filter(p=>p.album_id===a.id)}));
        return json(req.headers().accept?.includes('vnd.pgrst.object') ? found[0] : found);
      }
      if(url.pathname.endsWith('/journey_photos')) {
        if(method==='POST') { photos.push(body); return json(null,201); }
        if(method==='DELETE') { const i=photos.findIndex(p=>'eq.'+p.path===url.searchParams.get('path')); if(i>=0)photos.splice(i,1); return json(null); }
        return json(photos.filter(p=>!url.searchParams.get('album_id')||'eq.'+p.album_id===url.searchParams.get('album_id')));
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });
    await page.reload();
    await page.getByLabel('Email address').fill(user.email);
    await page.getByRole('button',{name:'Send sign-in code'}).click();
    await page.getByLabel('Code from your email').fill('123456');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.locator('#workspace').waitFor({state:'visible'});
    await page.getByLabel('Tournament name').fill('<img src=x onerror=alert(1)> Nationals');
    await page.getByLabel('Date',{exact:true}).fill('2026-09-11');
    await page.getByLabel('Location',{exact:true}).fill('Las Vegas');
    await page.getByLabel('Result',{exact:true}).fill('Gold');
    await page.locator('#photos').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:tinyPng},{name:'two.png',mimeType:'image/png',buffer:tinyPng}]);
    await page.getByText('2 photos ready.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.getByText('Could not finish.',{exact:false}).waitFor();
    assert.equal(albums.length,1); assert.equal(albums[0].published,false);
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.getByText('Draft saved privately.',{exact:false}).waitFor();
    assert.equal(albums.length,1); assert.equal(photos.length,2); assert.equal(uploadCalls,3);
    await page.reload();
    await page.locator('#workspace').waitFor({state:'visible'});
    await page.locator('#albums').selectOption(albums[0].id);
    await page.getByText('Draft opened.',{exact:false}).waitFor();
    assert.equal(await page.locator('.photo-tile').count(),2);
    assert.equal(await page.locator('#publish').isDisabled(),true);
    await page.getByRole('button',{name:'Preview album',exact:true}).click();
    await page.locator('#preview-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#preview-card h3 img').count(),0);
    await page.getByRole('button',{name:'VIEW ALBUM',exact:true}).click();
    await page.locator('.journey-dialog').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Next →',exact:true}).click();
    await page.getByText('2 / 2',{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#close-preview').click();
    await page.locator('#publish').click();
    await page.getByText('Published! Your album is now visible',{exact:false}).waitFor();
    assert.equal(albums[0].published,true);
    assert.equal(await page.locator('#title').isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.TEST_SCREENSHOTS) await page.screenshot({path:process.env.TEST_SCREENSHOTS+'/admin-mobile.png',fullPage:true});
    const publicPage=await context.newPage();
    await publicPage.goto(origin+'/');
    await publicPage.locator('#competition-albums h3').filter({hasText:'Nationals'}).last().waitFor();
    assert.equal(await publicPage.locator('#competition-albums .tournament-album').count(),3);
    assert.equal(await publicPage.locator('#competition-albums h3 img').count(),0);
    await page.locator('#unpublish').click();
    await page.getByText('Returned to private draft.',{exact:false}).waitFor();
    await publicPage.reload();
    await publicPage.waitForLoadState('networkidle');
    assert.equal(await publicPage.locator('#competition-albums .tournament-album').count(),2);
    await page.setViewportSize({width:1365,height:1000});
    if(process.env.TEST_SCREENSHOTS) await page.screenshot({path:process.env.TEST_SCREENSHOTS+'/admin-desktop.png',fullPage:true});
    await page.locator('#logout').click();
    await page.getByText('Signed out.',{exact:true}).waitFor();
    assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.deepEqual(errors,[]);
  } catch(error) {
    console.error('Page at failure:', await page.locator('body').innerText().catch(()=>''), errors);
    throw error;
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
