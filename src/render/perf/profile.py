"""CDP Performance traces. Synthetic render fixtures, never a human playtest."""
import asyncio, json, sys, statistics, time, gzip, base64, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get('RENDER_PROFILE_ROOT','artifacts/render-profile')).resolve()
STAGE=sys.argv[1] if len(sys.argv)>1 else 'baseline'
REPEATS=int(sys.argv[2]) if len(sys.argv)>2 else 3
OUT=ROOT/'evidence'/STAGE
OUT.mkdir(parents=True,exist_ok=True)
URL='http://127.0.0.1:8765/'+STAGE+'/'
async def metrics(cdp):
    return {x['name']:x['value'] for x in (await cdp.send('Performance.getMetrics'))['metrics']}
def pct(a,q):
    if not a:return None
    a=sorted(a);return a[min(len(a)-1,int((len(a)-1)*q))]
async def start(cdp,page):
    await cdp.send('HeapProfiler.collectGarbage');m=await metrics(cdp)
    await cdp.send('Tracing.start',{'categories':'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline.stack,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler','options':'sampling-frequency=1000','transferMode':'ReturnAsStream'})
    await page.evaluate("__renderProbe.reset();__renderProbe.recording=true;performance.mark('MEASURE_START')")
    return m
async def end(cdp,page,m,name):
    await page.evaluate("performance.mark('MEASURE_END');__renderProbe.recording=false")
    snap=await page.evaluate('__renderProbe.snapshot()');after=await metrics(cdp)
    future=asyncio.get_running_loop().create_future()
    cdp.once('Tracing.tracingComplete',lambda e:future.set_result(e))
    await cdp.send('Tracing.end');complete=await future;chunks=[]
    while True:
        x=await cdp.send('IO.read',{'handle':complete['stream'],'size':1024*1024})
        chunks.append(base64.b64decode(x['data']) if x.get('base64Encoded') else x['data'].encode())
        if x.get('eof'):break
    await cdp.send('IO.close',{'handle':complete['stream']})
    with gzip.open(OUT/(name+'.trace.json.gz'),'wb') as f:f.write(b''.join(chunks))
    await cdp.send('HeapProfiler.collectGarbage');gc=await metrics(cdp)
    fr=snap['frames'];raf=snap['raf']
    summary={'name':name,'durationMs':snap['elapsed'],'drawCallsMedian':statistics.median([r['calls'] for r in fr]) if fr else 0,'drawCallsMax':max([r['calls'] for r in fr],default=0),'trianglesMedian':statistics.median([r['triangles'] for r in fr]) if fr else 0,'renderCount':len(fr),'rendererSubmitMsP50':pct([r['ms'] for r in fr],.5),'rendererSubmitMsP95':pct([r['ms'] for r in fr],.95),'rafIntervalMsP50':pct(raf,.5),'rafIntervalMsP95':pct(raf,.95),'rafIntervalMsMax':max(raf,default=0),'rafOver33ms':sum(x>33.34 for x in raf),'rafSamples':len(raf),'jsHeapBeforeMiB':m.get('JSHeapUsedSize',0)/2**20,'jsHeapAfterMiB':after.get('JSHeapUsedSize',0)/2**20,'jsHeapAfterGcMiB':gc.get('JSHeapUsedSize',0)/2**20,'mainThreadTaskMs':1000*(after.get('TaskDuration',0)-m.get('TaskDuration',0)),'scriptMs':1000*(after.get('ScriptDuration',0)-m.get('ScriptDuration',0)),'layoutMs':1000*(after.get('LayoutDuration',0)-m.get('LayoutDuration',0)),'traceDataLoss':complete.get('dataLossOccurred',False),'rendererStates':snap['renderers'],'qualitySet':list({(r['width'],r['height'],r['pixelRatio']) for r in fr})}
    (OUT/(name+'.samples.json')).write_text(json.dumps(snap,indent=2))
    (OUT/(name+'.summary.json')).write_text(json.dumps(summary,indent=2))
    return summary
async def setup(browser,scenario):
    context=await browser.new_context(viewport={'width':1280,'height':800},device_scale_factor=1,reduced_motion='no-preference')
    page=await context.new_page();page.set_default_timeout(60000);errors=[];requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url) if '.glb' in r.url else None)
    await page.goto(URL,wait_until='networkidle')
    await page.wait_for_function('globalThis.__perfStore?.getState().ready && !!document.querySelector(".map-host[data-city]")',timeout=60000)
    await page.evaluate('''() => {
      const store=__perfStore;const g=structuredClone(store.getState().game);
      g.model.personality='friendly';g.paused=false;g.elapsedGameHours=0;
      g.cash=10000000;g.users=0;g.pendingNotices=[];
      g.locations=g.locations.map(l=>l.id==='campus'?{...l,owned:true,servers:64,racks:[],gridSize:{rows:8,cols:8},serverSeq:64,installedServers:Array.from({length:64},(_,i)=>({id:'server-'+(i+1),chip:'consumer-gpu',chassis:['rack-basic','rack-cooled','rack-enterprise'][i%3],overclock:1,gridPosition:{row:Math.floor(i/8),col:i%8}}))}:l);
      store.setState({game:g,notice:null,storageEnabled:false});
    }''')
    if scenario=='campus':
        await page.get_by_role('button',name='Мой технопарк',exact=True).click()
        await page.get_by_role('button',name='Открыть здание «Кампус»',exact=True).click()
        await page.get_by_test_id('cell-0-0').wait_for(state='visible');await page.wait_for_timeout(700)
    else:
        await page.get_by_role('button',name='Весь город',exact=True).click();await page.wait_for_timeout(1200)
    cdp=await context.new_cdp_session(page)
    await cdp.send('Performance.enable');await cdp.send('HeapProfiler.enable')
    return context,page,cdp,errors,requests
async def main():
    allresults=[]
    async with async_playwright() as pw:
        kwargs={'headless':True,'args':['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling']}
        if os.environ.get('CHROMIUM_PATH'):kwargs['executable_path']=os.environ['CHROMIUM_PATH']
        browser=await pw.chromium.launch(**kwargs)
        try:
            bc=await browser.new_browser_cdp_session();gpu=await bc.send('SystemInfo.getInfo')
            (OUT/'environment.json').write_text(json.dumps({'stage':STAGE,'browser':browser.version,'gpu':gpu,'viewport':[1280,800],'pixelRatio':1,'productionBuild':True,'measurementProbe':'src/render/perf/probe.js','repetitions':REPEATS,'trace':'CDP tracing; importable into Chrome DevTools Performance','humanPlaytest':False},indent=2))
            for run in range(REPEATS):
                for scenario in ['map','campus','transitions']:
                    context,page,cdp,errors,requests=await setup(browser,scenario)
                    name=f'{scenario}-{run+1}';before_requests=len(requests);m=await start(cdp,page);reopen=[]
                    if scenario=='map':await page.wait_for_timeout(6000)
                    elif scenario=='campus':
                        await page.wait_for_timeout(1500)
                        for i in range(12):
                            await page.get_by_test_id(f'cell-{i%8}-{i%3}').click();await page.wait_for_timeout(250)
                        await page.keyboard.press('Escape');await page.wait_for_timeout(1000)
                    else:
                        for i in range(3):
                            await page.get_by_test_id('open-training').click()
                            await page.get_by_role('button',name='К карте',exact=True).wait_for(state='visible');await page.wait_for_timeout(600)
                            t=time.perf_counter();await page.get_by_role('button',name='К карте',exact=True).click()
                            await page.wait_for_function('!!document.querySelector(".map-host[data-city]")')
                            await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                            reopen.append((time.perf_counter()-t)*1000);await page.wait_for_timeout(1000)
                    result=await end(cdp,page,m,name)
                    result.update({'runtimeErrors':errors,'glbRequestsDuring':len(requests)-before_requests,'reopenMs':reopen,'glbRequestsTotal':len(requests)})
                    (OUT/(name+'.summary.json')).write_text(json.dumps(result,indent=2))
                    if run==0:await page.screenshot(path=str(OUT/(scenario+'.png')))
                    allresults.append(result)
                    print(json.dumps({k:result[k] for k in ['name','drawCallsMedian','drawCallsMax','renderCount','rafIntervalMsP95','mainThreadTaskMs','jsHeapAfterGcMiB','reopenMs','runtimeErrors']}),flush=True)
                    await context.close()
            (OUT/'results.json').write_text(json.dumps(allresults,indent=2))
        finally:await browser.close()
asyncio.run(main())
