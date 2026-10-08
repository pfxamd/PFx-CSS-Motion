import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';

const engineName=process.argv[2]||'chromium';
const engines={chromium,firefox,webkit};
if(!Object.hasOwn(engines,engineName))throw new Error('Unknown browser '+engineName);
const base='http://127.0.0.1:4173/PFx-CSS-Motion/';
const vite=fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url));
const server=spawn(process.execPath,[vite,'preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';
server.stdout.on('data',chunk=>output+=chunk);
server.stderr.on('data',chunk=>output+=chunk);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function scrubTo(page,value) {
  await page.locator('#scrub').evaluate((element,next)=>{
    element.value=String(next);
    element.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
}
let browser;
try {
  let started=false;
  for(let i=0;i<75;i++) {
    if(server.exitCode!==null)throw new Error('Vite preview exited: '+output);
    try{const response=await fetch(base,{signal:AbortSignal.timeout(5000)});
      if(response.ok){started=true;break}}catch{}
    await sleep(200);
  }
  if(!started)throw new Error('Preview server did not start: '+output);
  browser=await engines[engineName].launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  const response=await page.goto(base);
  assert.equal(response.status(),200);
  await page.locator('.preset-card').first().waitFor();
  const brandLogo=page.locator('.brand-logo');
  assert.equal(await brandLogo.count(),1,"The canonical PFx logo must appear once in navbar");
  const logo=await brandLogo.evaluate(async element=>{
    await element.decode();
    return {src:element.currentSrc,width:element.naturalWidth,height:element.naturalHeight};
  });
  assert(logo.src.includes('/PFx-CSS-Motion/brand/logo.svg'),"Logo must be served from the project's own assets");
  assert(logo.width>0 && logo.height>0,"Original PFx SVG did not render");
  const iconHref=await page.locator('link[rel="icon"]').getAttribute('href');
  assert(iconHref.includes('brand/logo.svg'),"Browser favicon should use the original logo");
  assert.equal(await page.locator('.preset-card').count(),4);
  assert.equal(await page.locator('.preview-card').count(),1);
  assert.equal(await page.locator('.keyframe-marker').count(),6);
  assert.equal(await page.locator('#undoButton').isDisabled(),true);
  assert.equal(await page.locator('#redoButton').isDisabled(),true);
  await page.locator('#playbackSpeed').selectOption('1.5');
  assert.equal(await page.locator('#previewTarget').evaluate(el=>el.getAnimations()[0].playbackRate),1.5);
  // Native Web Animations actually applies our model to the stage.
  const native=await page.evaluate(()=>{
    const element=document.getElementById('previewTarget');
    return {count:element.getAnimations().length,playState:element.getAnimations()[0]?.playState};
  });
  assert.equal(native.count,1);
  assert.equal(native.playState,'paused');
  await scrubTo(page,1200);
  let opacity=await page.locator('#previewTarget').evaluate(el=>getComputedStyle(el).opacity);
  assert.equal(Number(opacity),1);
  await scrubTo(page,0);
  opacity=await page.locator('#previewTarget').evaluate(el=>getComputedStyle(el).opacity);
  assert.equal(Number(opacity),0);
  await page.locator('[data-preset="elastic"]').click();
  assert.equal(await page.locator('#motionName').inputValue(),'Soft overshoot');
  assert.equal(await page.locator('#undoButton').isEnabled(),true);
  assert.equal(await page.locator('#previewTarget').evaluate(el=>el.getAnimations()[0].playbackRate),1.5);
  await page.locator('[data-object="shape"]').click();
  assert.equal(await page.locator('.preview-shape').count(),1);
  await page.locator('[data-panel="motion"]').click();
  const field=page.locator('[data-timing="duration"]');
  await field.fill('1600');await field.press('Tab');
  assert.equal(await page.locator('#scrub').getAttribute('max'),'1600');
  await page.locator('#undoButton').click();
  assert.equal(await page.locator('#scrub').getAttribute('max'),'1000');
  assert.equal(await page.locator('#redoButton').isEnabled(),true);
  await page.locator('#redoButton').click();
  assert.equal(await page.locator('#scrub').getAttribute('max'),'1600');
  assert.equal(await page.locator('#previewTarget').evaluate(el=>el.getAnimations()[0].playbackRate),1.5);
  // Add and modify a real keyframe.
  await scrubTo(page,800);
  await page.locator('#addFrameButton').click();
  assert.match(await page.locator('#frameCount').textContent(),/3 frames/);
  assert.equal(await page.locator('#keyframePosition').inputValue(),'50');
  await page.locator('[data-frame-property="opacity"]').fill('0.65');
  await page.locator('[data-frame-property="opacity"]').press('Tab');
  assert.equal(await page.locator('[data-frame-property="opacity"]').inputValue(),'0.65');
  // Export uses core compiler, not a generated illustration.
  await page.locator('#exportButton').click();
  const exported=await page.locator('#exportCode').textContent();
  assert.match(exported,/@keyframes/);
  assert.match(exported,/opacity: 0.65;/);
  assert.match(exported,/animation-duration: 1600ms;/);
  await page.locator('#closeDialog').click();
  await page.locator('#playButton').click();
  await sleep(130);
  const played=await page.locator('#scrub').inputValue();
  assert(Number(played)>0);
  await page.locator('#playButton').click();
  // Local project download really contains a valid schema.
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#saveButton').click();
  const artifact=await downloadPromise;
  assert(artifact.suggestedFilename().endsWith('.json'));
  const filePath=await artifact.path();
  const {readFile}=await import('node:fs/promises');
  const project=JSON.parse(await readFile(filePath,'utf8'));
  assert.equal(project.motion.schemaVersion,1);
  assert.equal(project.motion.timing.duration,1600);
  // Import the downloaded project back into the editor.
  await page.locator('#fileInput').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  assert.equal(await page.locator('#scrub').getAttribute('max'),'1600');
  // Responsive integrity and touch-size viewport: mobile must stay operable.
  await page.setViewportSize({width:390,height:844});
  const mobile=await page.evaluate(()=>({
    viewport:window.innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    canvasWidth:document.getElementById('canvas').getBoundingClientRect().width,
    inspectorWidth:document.getElementById('inspectorContent').getBoundingClientRect().width
  }));
  assert(mobile.documentWidth<=mobile.viewport+1,
    'Mobile horizontal overflow: '+JSON.stringify(mobile));
  assert(mobile.canvasWidth>250);
  assert(mobile.inspectorWidth>280);
  assert.equal(await page.locator('#playbackSpeed').isVisible(),true);
  assert(await page.locator('#exportButton').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PFx_STUDIO_BROWSER_PASS',JSON.stringify({engine:engineName,checks:26,errors,coreNativeAnimation:true,download:artifact.suggestedFilename()}));
} finally {
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
