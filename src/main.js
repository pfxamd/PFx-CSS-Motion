import './style.css';
import {
  shiftKeyframes, insertSampledFrame, parseCubicCurve,
  toCubicCurveString, moveCurveHandle
} from './timeline-editor.js';
import { createBrowserAnimation, compileCSS, parseEasing } from '@pfxamd/css-motion-core';
import {
  PRESETS, makePreset, copyMotion, allProperties, updateTiming, updateFrame,
  removeProperty, insertFrame, deleteFrame, formatTime, projectFromJSON, serializeProject
} from './motion-model.js';

const byId = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const cleanFileName = name => String(name).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'pfx-motion';

const state = {
  motion: makePreset('lift'),
  preset: 'lift',
  object: 'card',
  panel: 'motion',
  selectedFrame: 1,
  selectedFrames: [1],
  time: 600,
  looping: false,
  undo: [],
  redo: [],
  playing: false,
  playbackSpeed: 1
};
let controller=null;
let frameRequest=0;
let noticeTimeout=null;

function toast(message,error=false) {
  const node=byId('toast');
  node.textContent=message;
  node.classList.toggle('is-error',error);
  clearTimeout(noticeTimeout);
  noticeTimeout=setTimeout(()=>{node.textContent='';node.classList.remove('is-error')},3200);
}

function download(name,text,type) {
  const blob=new Blob([text],{type});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const duration=()=>state.motion.timing.duration;
const previewMotion=()=>state.looping
  ? {...state.motion,timing:{...state.motion.timing,iterations:Infinity}}
  : state.motion;
const clampedTime=value=>Math.min(duration(),Math.max(0,Number(value)||0));
const animationTime=value=>value+state.motion.timing.delay;
const cycleTime=value=>{
  const delta=value-state.motion.timing.delay;
  if(state.looping || state.motion.timing.iterations>1) {
    return ((delta%duration())+duration())%duration();
  }
  return clampedTime(delta);
};

function cancelFrame() {
  if(frameRequest)cancelAnimationFrame(frameRequest);
  frameRequest=0;
}
function compiled() { return compileCSS(state.motion); }

function updateHistoryButtons() {
  byId('undoButton').disabled = state.undo.length === 0;
  byId('redoButton').disabled = state.redo.length === 0;
}

function updateStageDimensions() {
  const rect = byId('canvas').getBoundingClientRect();
  const label = Math.round(rect.width) + ' × ' + Math.round(rect.height) + ' px';
  byId('canvasDimensions').textContent = label;
  byId('canvasMeta').textContent = 'CANVAS / ' + label;
}

function setPlaybackSpeed(value) {
  const speed = Number(value);
  if (![0.25, 0.5, 0.75, 1, 1.5, 2].includes(speed))
    throw new RangeError('Unsupported playback speed');
  state.playbackSpeed = speed;
  controller?.setRate(speed);
  byId('playbackSpeed').value = String(speed);
}

function renderPresetLibrary() {
  byId('presetList').innerHTML=PRESETS.map((preset,index)=>`
    <button type="button" data-preset="${preset.id}" class="preset-card ${state.preset===preset.id?'preset-active':''}" aria-pressed="${state.preset===preset.id}">
      <span class="preset-card-top"><span class="preset-number">${String(index+1).padStart(2,'0')}</span>
        <svg class="preset-curve" viewBox="0 0 80 45" fill="none" aria-hidden="true"><path d="M 0 36 H 74" class="curve-axis"/><path d="${preset.curve}" class="curve-line"/></svg></span>
      <strong>${escapeHtml(preset.label)}</strong><span class="preset-caption">${escapeHtml(preset.caption)}</span>
    </button>`).join('');
  document.querySelectorAll('[data-object]').forEach(button=>{
    const selected=button.dataset.object===state.object;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
}

function renderSubject() {
  const node=byId('previewTarget');
  const specs={
    card: {
      cls:'preview-card',
      markup:`<div class="specimen-bar"><span class="specimen-bar-brand">pfx / 01</span><span class="specimen-mini-dots"><i></i><i></i><i></i></span></div>
      <div class="specimen-content"><span class="specimen-overline">IN MOTION</span><strong>Form follows<br><em>feeling.</em></strong><span class="specimen-bottom">A BETTER KIND OF MOVEMENT <span>↗</span></span></div>`
    },
    type: {
      cls:'preview-type',
      markup:`<span class="type-serial">TYPE EXPERIMENT / 02</span><strong>Motion<br><em>matters.</em></strong><span class="type-under">NOT JUST WHAT YOU SEE. HOW IT FEELS.</span>`
    },
    shape: {
      cls:'preview-shape',
      markup:`<span class="shape-dot"></span><span class="shape-number">03</span><span class="shape-label">OBJECT IN MOTION</span>`
    }
  };
  const selection=specs[state.object]||specs.card;
  node.className='preview-target '+selection.cls;
  node.innerHTML=selection.markup;
}

function initAnimation() {
  cancelFrame();
  state.playing=false;
  if(controller) {controller.dispose();controller=null;}
  controller=createBrowserAnimation(byId('previewTarget'),previewMotion());
  controller.setRate(state.playbackSpeed);
  controller.seek(animationTime(clampedTime(state.time)));
  updateTimeUI();
}
function renderAll({subject=false}={}) {
  if(subject)renderSubject();
  renderPresetLibrary();
  byId('motionName').value=state.motion.name;
  renderInspector();
  renderTimeline();
  initAnimation();
  updateHistoryButtons();
}

function updateTimeUI() {
  const ms=clampedTime(state.time);
  const progress=duration()>0?ms/duration()*100:0;
  byId('scrub').max=String(duration());
  byId('scrub').value=String(ms);
  byId('scrub').style.setProperty('--progress',progress+'%');
  byId('transportTime').innerHTML=`${formatTime(ms)} <b>/</b> ${formatTime(duration())}`;
  byId('canvasTimestamp').textContent=formatTime(ms);
  document.querySelectorAll('.keyframe-track').forEach(track=>track.style.setProperty('--playhead',progress+'%'));
  byId('playButton').textContent=state.playing?'Ⅱ':'▶';
  byId('playButton').setAttribute('aria-label',state.playing?'Pause':'Play');
  byId('playButton').title=state.playing?'Pause (Space)':'Play (Space)';
  byId('repeatButton').setAttribute('aria-pressed',String(state.looping));
  byId('repeatButton').classList.toggle('repeat-active',state.looping);
}

function tick() {
  if(!state.playing||!controller) return;
  const animation=controller.animation;
  const current=Number(animation.currentTime??0);
  if(Number.isFinite(current)) {
    state.time=cycleTime(current);
    updateTimeUI();
  }
  if(animation.playState==='finished' && !state.looping) {
    state.playing=false;
    updateTimeUI();
    return;
  }
  frameRequest=requestAnimationFrame(tick);
}

function togglePlay() {
  if(!controller)return;
  if(state.playing) {
    controller.pause();
    state.playing=false;
    cancelFrame();
  } else {
    if(!state.looping && clampedTime(state.time)>=duration()) {
      state.time=0;controller.seek(animationTime(0));
    }
    controller.play();
    state.playing=true;
    cancelFrame();
    frameRequest=requestAnimationFrame(tick);
  }
  updateTimeUI();
}

function seek(time, {pause=true}={}) {
  if(!controller)return;
  if(pause && state.playing) {
    controller.pause();
    state.playing=false;
    cancelFrame();
  }
  state.time=clampedTime(time);
  controller.seek(animationTime(state.time));
  updateTimeUI();
}
function setLoop(enabled) {
  if(state.looping===enabled)return;
  state.looping=enabled;
  cancelFrame();
  const at=clampedTime(state.time),wasPlaying=state.playing;
  if(controller)controller.dispose();
  const base=state.motion;
  const motion={...base,timing:{...base.timing,iterations:enabled?Infinity:base.timing.iterations}};
  controller=createBrowserAnimation(byId('previewTarget'),motion);
  controller.setRate(state.playbackSpeed);
  controller.seek(animationTime(at));
  state.playing=false;
  if(wasPlaying)togglePlay();
  updateTimeUI();
}

function updateMotion(next,{index=state.selectedFrame,preset=null,selection=null}={}) {
  const previous=copyMotion(state.motion);
  const oldTime=state.time;
  const oldPreset=state.preset;
  const oldSelected=[...state.selectedFrames];
  try {
    compiledMotion(next);
    state.motion=next;
    state.selectedFrame=Math.max(0,Math.min(next.keyframes.length-1,index));
    state.selectedFrames=selection?.length ? [...selection] : [state.selectedFrame];
    state.time=clampedTime(oldTime);
    state.preset=preset;
    renderAll();
    state.undo.push({motion:previous,time:oldTime,preset:oldPreset});
    if(state.undo.length>60)state.undo.shift();
    state.redo.length=0;
    updateHistoryButtons();
    return true;
  } catch(error) {
    state.motion=previous;state.preset=oldPreset;state.time=oldTime;state.selectedFrames=oldSelected;
    try{renderAll();}catch{}
    toast(error.message,true);
    return false;
  }
}
function compiledMotion(motion) {
  parseEasing(motion.timing.easing);
  for(const frame of motion.keyframes) {
    if(frame.easing!==undefined)parseEasing(frame.easing);
  }
  return compileCSS(motion);
}

function history(direction) {
  const source=direction==='undo'?state.undo:state.redo;
  const target=direction==='undo'?state.redo:state.undo;
  const snapshot=source.pop();
  if(!snapshot) {toast('Nothing to '+direction);return;}
  target.push({motion:copyMotion(state.motion),time:state.time,preset:state.preset});
  state.motion=copyMotion(snapshot.motion);
  state.time=snapshot.time;
  state.preset=snapshot.preset;
  state.selectedFrame=Math.min(state.selectedFrame,state.motion.keyframes.length-1);
  state.selectedFrames=[state.selectedFrame];
  state.looping=false;
  renderAll();
  toast(direction==='undo'?'Change undone':'Change restored');
}

function optionList(values,selected) {
  return values.map(([value,label])=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');
}
const control = (label,field,value,opts={}) => `
  <label class="field"><span class="field-heading">${escapeHtml(label)}${opts.suffix?`<small>${opts.suffix}</small>`:''}</span>
  <input ${opts.number?'type="number"':'type="text"'} data-timing="${field}" value="${escapeHtml(value)}" ${opts.number?'step="'+(opts.step??1)+'"':''} ${opts.min!==undefined?'min="'+opts.min+'"':''} ${opts.max!==undefined?'max="'+opts.max+'"':''} spellcheck="false"></label>`;

const CURVE_PLOT={width:300,height:280,left:40,right:260,zero:210,scale:130};
function curvePoint(x,y) {
  return {x: CURVE_PLOT.left+(CURVE_PLOT.right-CURVE_PLOT.left)*x,
    y: CURVE_PLOT.zero-CURVE_PLOT.scale*y};
}
function curveDrawing(points) {
  const a=curvePoint(points[0],points[1]);
  const b=curvePoint(points[2],points[3]);
  const start=curvePoint(0,0),end=curvePoint(1,1);
  return {
    a,b,start,end,
    path:'M '+start.x+' '+start.y+' C '+a.x+' '+a.y+', '+b.x+' '+b.y+', '+end.x+' '+end.y
  };
}
function renderCurveEditor(easing) {
  const parsed=parseCubicCurve(easing);
  if(!parsed) {
    return '<div class="curve-editor"><div class="curve-editor-heading"><strong>VISUAL EASING</strong><span>Curve editor</span></div>'+
    '<p class="curve-hint">Step easing cannot be edited with Bézier handles.</p>'+
    '<button type="button" class="button button-muted" id="convertCurve">Use cubic Bézier</button></div>';
  }
  const curve=curveDrawing(parsed);
  return `<div class="curve-editor">
    <div class="curve-editor-heading"><strong>VISUAL EASING</strong><span>Drag the handles</span></div>
    <svg id="curveGraph" viewBox="0 0 300 280" aria-label="Interactive Bézier easing graph" role="img">
      <rect x="40" y="10" width="220" height="265" fill="transparent"/>
      <path d="M 40 210 H 260 M 40 80 H 260 M 40 10 V 275 M 260 10 V 275" class="curve-gridline"/>
      <path d="M 40 210 L 260 80" class="curve-diagonal"/>
      <line id="curveLine0" x1="40" y1="210" x2="${curve.a.x}" y2="${curve.a.y}" class="curve-tangent"/>
      <line id="curveLine1" x1="${curve.b.x}" y1="${curve.b.y}" x2="260" y2="80" class="curve-tangent"/>
      <path id="curvePath" d="${curve.path}" class="curve-path"/>
      <circle cx="40" cy="210" r="4" class="curve-anchor"/>
      <circle cx="260" cy="80" r="4" class="curve-anchor"/>
      <circle data-curve-handle="0" cx="${curve.a.x}" cy="${curve.a.y}" r="11" class="curve-handle"
        role="slider" tabindex="0" aria-label="First Bézier control point" aria-valuetext="${parsed[0]}, ${parsed[1]}"/>
      <circle data-curve-handle="1" cx="${curve.b.x}" cy="${curve.b.y}" r="11" class="curve-handle"
        role="slider" tabindex="0" aria-label="Second Bézier control point" aria-valuetext="${parsed[2]}, ${parsed[3]}"/>
    </svg>
    <div class="curve-values" id="curveValues">
      <span>P1 <strong>${parsed[0].toFixed(2)}, ${parsed[1].toFixed(2)}</strong></span>
      <span>P2 <strong>${parsed[2].toFixed(2)}, ${parsed[3].toFixed(2)}</strong></span>
    </div><p class="curve-hint">Shift the handles to reshape acceleration. Arrow keys adjust the focused handle.</p>
  </div>`;
}
function paintCurve(points) {
  const svg=byId('curveGraph');
  if(!svg) return;
  const {a,b,path}=curveDrawing(points);
  svg.querySelector('#curvePath').setAttribute('d',path);
  svg.querySelector('#curveLine0').setAttribute('x2',String(a.x));
  svg.querySelector('#curveLine0').setAttribute('y2',String(a.y));
  svg.querySelector('#curveLine1').setAttribute('x1',String(b.x));
  svg.querySelector('#curveLine1').setAttribute('y1',String(b.y));
  for (const [i,point] of [[0,a],[1,b]]) {
    const node=svg.querySelector('[data-curve-handle="'+i+'"]');
    node.setAttribute('cx',String(point.x));
    node.setAttribute('cy',String(point.y));
    node.setAttribute('aria-valuetext',points[i*2]+', '+points[i*2+1]);
  }
  byId('curveValues').innerHTML='<span>P1 <strong>'+points[0].toFixed(2)+', '+points[1].toFixed(2)+'</strong></span>'+
   '<span>P2 <strong>'+points[2].toFixed(2)+', '+points[3].toFixed(2)+'</strong></span>';
}

function renderInspector() {
  document.querySelectorAll('[data-panel]').forEach(button=>{
    const selected=button.dataset.panel===state.panel;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-selected',String(selected));
  });
  const target=byId('inspectorContent');
  const t=state.motion.timing;
  if(state.panel==='motion') {
    target.innerHTML=`
      <div class="inspector-section"><div class="section-title"><span>01</span><strong>Timing</strong></div>
        <div class="field-grid">
          ${control('Duration','duration',t.duration,{number:true,min:1,max:30000,step:10,suffix:'ms'})}
          ${control('Delay','delay',t.delay,{number:true,min:-30000,max:30000,step:10,suffix:'ms'})}
        </div>
        <label class="field"><span class="field-heading">Easing <small>curve</small></span>
          <select data-timing="easing">${optionList([
          ['linear','Linear'],['ease','Ease'],['ease-in','Ease in'],['ease-out','Ease out'],['ease-in-out','Ease in-out'],
          ['cubic-bezier(0.22, 1, 0.36, 1)','Smooth / fast-out'],
          ['cubic-bezier(0.34, 1.56, 0.64, 1)','Overshoot'],
          ['cubic-bezier(0.16, 1, 0.3, 1)','Soft deceleration'],
          ['steps(4, end)','Steps / 4']
        ],t.easing)}${!['linear','ease','ease-in','ease-out','ease-in-out','cubic-bezier(0.22, 1, 0.36, 1)','cubic-bezier(0.34, 1.56, 0.64, 1)','cubic-bezier(0.16, 1, 0.3, 1)','steps(4, end)'].includes(t.easing)?`<option value="${escapeHtml(t.easing)}" selected>Custom · ${escapeHtml(t.easing)}</option>`:''}</select>
        </label>
        ${control('Custom easing','easing',t.easing,{suffix:'CSS'})}
        ${renderCurveEditor(t.easing)}
      </div>
      <div class="inspector-section"><div class="section-title"><span>02</span><strong>Playback</strong></div>
        <label class="field"><span class="field-heading">Iterations <small>repeat count</small></span><input data-timing="iterations" type="number" min="0" max="1000" step="0.5" value="${t.iterations}"></label>
        <label class="field"><span class="field-heading">Direction</span><select data-timing="direction">${optionList([['normal','Normal'],['reverse','Reverse'],['alternate','Alternate'],['alternate-reverse','Alternate reverse']],t.direction)}</select></label>
        <label class="field"><span class="field-heading">Fill mode</span><select data-timing="fill">${optionList([['both','Both'],['forwards','Forwards'],['backwards','Backwards'],['none','None']],t.fill)}</select></label>
      </div>
      <div class="inspector-tip"><span class="tip-icon">↗</span><p><strong>Tip</strong> Select a diamond on the timeline to edit its individual frame values.</p></div>`;
  } else if(state.panel==='keyframe') {
    const frame=state.motion.keyframes[state.selectedFrame];
    const props=Object.entries(frame).filter(([name])=>!['offset','easing','composite'].includes(name));
    target.innerHTML=`
      <div class="inspector-section"><div class="section-title"><span>${String(state.selectedFrame+1).padStart(2,'0')}</span><strong>Keyframe details</strong></div>
        <label class="field"><span class="field-heading">Position <small>% of duration</small></span>
          <div class="position-field"><input id="keyframePosition" type="range" min="0" max="100" step="1" value="${Math.round(frame.offset*100)}"><strong>${Math.round(frame.offset*100)}%</strong></div></label>
      </div>
      <div class="inspector-section"><div class="section-title"><span>↳</span><strong>CSS properties</strong></div>
        <div class="property-editor">${props.map(([name,value])=>`
          <div class="property-item"><div class="property-name"><span>${escapeHtml(name)}</span><button type="button" data-delete-property="${escapeHtml(name)}" title="Remove property" aria-label="Remove ${escapeHtml(name)}">×</button></div>
          <input data-frame-property="${escapeHtml(name)}" type="text" value="${escapeHtml(value)}" spellcheck="false" aria-label="${escapeHtml(name)} value"></div>`).join('')}</div>
        <form id="addPropertyForm" class="add-property-form"><strong>+ Add CSS property</strong>
          <input name="property" placeholder="e.g. borderRadius" aria-label="CSS property name" required>
          <input name="value" placeholder="e.g. 24px" aria-label="CSS property value" required>
          <button type="submit" class="button button-muted">Add property</button></form>
      </div>
      <div class="inspector-section"><div class="section-title"><span>03</span><strong>Keyframe actions</strong></div>
        <button id="removeFrameButton" type="button" class="button delete-button" ${state.motion.keyframes.length<=2?'disabled':''}>Remove selected keyframe</button>
      </div>`;
    const position=byId('keyframePosition');
    position.addEventListener('input',()=>{position.nextElementSibling.textContent=position.value+'%'});
  } else {
    const output=compiled();
    target.innerHTML=`<div class="inspector-section"><div class="section-title"><span>01</span><strong>Generated CSS</strong></div><p class="code-helper">Original CSS, built directly from your keyframes and timing.</p>
    <div class="compact-code"><pre id="inlineCode"></pre></div>
    <button id="inspectorCopy" class="button button-primary full-width" type="button">Copy CSS ↗</button>
    </div><div class="inspector-tip"><span class="tip-icon">⌘</span><p>No extra library is needed for the exported animation.</p></div>`;
    byId('inlineCode').textContent=output.css;
  }
}

function renderTimeline() {
  const motion=state.motion;
  byId('frameCount').textContent=motion.keyframes.length+' frames';
  byId('selectedCount').textContent=state.selectedFrames.length+' selected';
  byId('rulerMarks').innerHTML=Array.from({length:6},(_,index)=>`<span>${(duration()/1000*index/5).toFixed(2)}</span>`).join('');
  const properties=allProperties(motion);
  byId('propertyTracks').innerHTML=properties.map((name,row)=>`
    <div class="property-track"><div class="track-label"><span class="track-label-icon">${['◇','≈','✳','◌'][row%4]}</span><span title="${escapeHtml(name)}">${escapeHtml(name)}</span></div>
    <div class="keyframe-track" style="--playhead:${clampedTime(state.time)/duration()*100}%">
      ${motion.keyframes.map((frame,index)=>name in frame?`<button type="button" data-frame-index="${index}" class="keyframe-marker ${state.selectedFrames.includes(index)?'marker-selected':''}" style="left:${frame.offset*100}%" title="${escapeHtml(name)} at ${Math.round(frame.offset*100)}%" aria-label="Edit keyframe ${index+1} ${escapeHtml(name)}"><span></span></button>`:'').join('')}
    </div></div>`).join('');
  if(!properties.length)byId('propertyTracks').innerHTML='<p class="no-properties">Select a keyframe and add a property.</p>';
  updateTimeUI();
}
function selectFrame(index,{additive=false,range=false}={}) {
  const max=state.motion.keyframes.length-1;
  index=Math.max(0,Math.min(max,index));
  if(range) {
    const from=Math.min(state.selectedFrame,index),to=Math.max(state.selectedFrame,index);
    state.selectedFrames=Array.from({length:to-from+1},(_,i)=>from+i);
  } else if(additive) {
    const set=new Set(state.selectedFrames);
    if(set.has(index) && set.size>1)set.delete(index);
    else set.add(index);
    state.selectedFrames=[...set].sort((a,b)=>a-b);
  } else {
    state.selectedFrames=[index];
  }
  state.selectedFrame=index;
  state.panel='keyframe';
  seek(state.motion.keyframes[index].offset*duration());
  renderTimeline();
  renderInspector();
}

function openExport() {
  try {
    const output=compiled();
    byId('generatedClass').textContent='.'+output.className;
    byId('exportCode').textContent=output.css;
    byId('exportDialog').showModal();
  }catch(error){toast(error.message,true)}
}
async function copyCSS() {
  try{await navigator.clipboard.writeText(compiled().css);toast('CSS copied to clipboard')}catch{toast('Clipboard unavailable. Use Download .css instead.',true)}
}

function sampleKeyframe() {
  try {
    if(state.playing)seek(state.time);
    const offset=state.time/duration();
    const computed=getComputedStyle(byId('previewTarget'));
    const sampled={};
    for(const property of allProperties(state.motion)) {
      const cssProperty=property.startsWith('--')?property:
        property.replace(/[A-Z]/g,character=>'-'+character.toLowerCase());
      sampled[property]=computed.getPropertyValue(cssProperty).trim();
    }
    const result=insertSampledFrame(state.motion,offset,sampled);
    if(updateMotion(result.motion,{index:result.index})) {
      state.panel='keyframe';
      renderInspector();
      toast('Keyframe sampled from live preview');
    }
  }catch(error){toast(error.message,true);}
}

let pointerSession=null;
function cancelPendingPointer() {
  if(pointerSession?.raf)cancelAnimationFrame(pointerSession.raf);
  if(pointerSession)pointerSession.raf=0;
}
function frameMove(session,delta) {
  const result=shiftKeyframes(session.originalMotion,session.selected,delta);
  const primaryIndex=result.originalIndexes.indexOf(session.primary);
  state.motion=result.motion;
  state.selectedFrames=result.selection;
  state.selectedFrame=primaryIndex;
  state.time=state.motion.keyframes[primaryIndex].offset*duration();
  renderTimeline();
  renderInspector();
  initAnimation();
  return result.delta;
}
function curveMove(session,clientX,clientY) {
  const bounds=session.bounds;
  const x=(clientX-bounds.left)/bounds.width*CURVE_PLOT.width;
  const y=(clientY-bounds.top)/bounds.height*CURVE_PLOT.height;
  const values=moveCurveHandle(session.values,session.handle,
    (x-CURVE_PLOT.left)/(CURVE_PLOT.right-CURVE_PLOT.left),
    (CURVE_PLOT.zero-y)/CURVE_PLOT.scale);
  session.current=values;
  paintCurve(values);
  controller?.animation.effect.updateTiming({easing:toCubicCurveString(values)});
}
function beginPointerSession(event) {
  if(event.button!==0 || pointerSession)return;
  const curve=event.target.closest('[data-curve-handle]');
  if(curve) {
    const values=parseCubicCurve(state.motion.timing.easing);
    if(!values)return;
    event.preventDefault();
    const svg=byId('curveGraph');
    pointerSession={
      kind:'curve',pointerId:event.pointerId,
      values,current:values,handle:Number(curve.dataset.curveHandle),
      bounds:svg.getBoundingClientRect(),moved:false,
      originalTime:state.time
    };
    curve.focus({preventScroll:true});
    return;
  }
  const marker=event.target.closest('.keyframe-marker');
  if(!marker)return;
  event.preventDefault();
  const index=Number(marker.dataset.frameIndex);
  const track=marker.closest('.keyframe-track');
  const bounds=track.getBoundingClientRect();
  selectFrame(index,{additive:event.ctrlKey||event.metaKey,range:event.shiftKey});
  pointerSession={
    kind:'frame',pointerId:event.pointerId,originalMotion:copyMotion(state.motion),
    originalTime:state.time,originalPreset:state.preset,
    selected:[...state.selectedFrames],primary:index,
    initialX:event.clientX,pendingDelta:0,
    width:bounds.width,moved:false,raf:0
  };
}
function updatePointerSession(event) {
  const session=pointerSession;
  if(!session || event.pointerId!==session.pointerId)return;
  if(session.kind==='curve') {
    event.preventDefault();
    session.moved=true;
    try{curveMove(session,event.clientX,event.clientY)}catch(error){toast(error.message,true);}
    return;
  }
  if(Math.abs(event.clientX-session.initialX)<3 && !session.moved)return;
  session.moved=true;
  event.preventDefault();
  session.pendingDelta=(event.clientX-session.initialX)/Math.max(1,session.width);
  if(session.raf)return;
  session.raf=requestAnimationFrame(()=>{
    session.raf=0;
    if(pointerSession!==session)return;
    frameMove(session,session.pendingDelta);
  });
}
function completePointerSession(event,cancel=false) {
  const session=pointerSession;
  if(!session || event.pointerId!==session.pointerId)return;
  pointerSession=null;
  if(session.kind==='curve') {
    if(cancel || !session.moved) {
      controller?.animation.effect.updateTiming({easing:state.motion.timing.easing});
      if(!cancel)return;
    } else {
      const next=toCubicCurveString(session.current);
      if(next!==state.motion.timing.easing)updateMotion(updateTiming(state.motion,'easing',next));
      return;
    }
    renderInspector();
    return;
  }
  cancelPendingPointer();
  if(session.raf)cancelAnimationFrame(session.raf);
  const changed=session.moved &&
    Math.abs(session.pendingDelta)>0.00001;
  if(!changed && !cancel)return;
  if(!cancel && changed)frameMove(session,session.pendingDelta);
  const finalMotion=state.motion;
  const finalSelection=[...state.selectedFrames];
  const finalIndex=state.selectedFrame;
  const finalTime=state.time;
  state.motion=session.originalMotion;
  state.time=session.originalTime;
  state.preset=session.originalPreset;
  if(cancel) {
    state.selectedFrames=[...session.selected];
    state.selectedFrame=session.primary;
    renderAll();
    return;
  }
  if(JSON.stringify(finalMotion.keyframes)===JSON.stringify(session.originalMotion.keyframes)) {
    state.selectedFrames=finalSelection;
    state.selectedFrame=finalIndex;
    renderAll();
    return;
  }
  if(updateMotion(finalMotion,{index:finalIndex,selection:finalSelection}))
    seek(finalTime);
}
document.addEventListener('pointerdown',beginPointerSession);
window.addEventListener('pointermove',updatePointerSession,{passive:false});
window.addEventListener('pointerup',event=>completePointerSession(event));
window.addEventListener('pointercancel',event=>completePointerSession(event,true));

document.addEventListener('click',event=>{
  const preset=event.target.closest('[data-preset]');
  if(preset){const id=preset.dataset.preset;updateMotion(makePreset(id),{index:1,preset:id});seek(duration()/2);return}
  const object=event.target.closest('[data-object]');
  if(object){
    state.object=object.dataset.object;
    state.time=duration()/2;
    renderAll({subject:true});
    return;
  }
  const panel=event.target.closest('[data-panel]');
  if(panel){state.panel=panel.dataset.panel;renderInspector();return}
  const marker=event.target.closest('[data-frame-index]');
  if(marker){selectFrame(Number(marker.dataset.frameIndex));return}
  const deletion=event.target.closest('[data-delete-property]');
  if(deletion){
    const property=deletion.dataset.deleteProperty;
    if(updateMotion(removeProperty(state.motion,state.selectedFrame,property)))toast(property+' removed');
    return;
  }
  switch(event.target.closest('button')?.id) {
    case 'playButton':togglePlay();break;
    case 'undoButton':history('undo');break;
    case 'redoButton':history('redo');break;
    case 'toStart':seek(0);break;
    case 'toEnd':seek(duration());break;
    case 'repeatButton':setLoop(!state.looping);break;
    case 'addFrameButton':{
      const result=insertFrame(state.motion,clampedTime(state.time)/duration());
      if(updateMotion(result.motion,{index:result.index}))state.panel='keyframe',renderInspector();
      break;
    }
    case 'removeFrameButton':
      if(updateMotion(deleteFrame(state.motion,state.selectedFrame),{index:Math.max(0,state.selectedFrame-1)}))toast('Keyframe removed');
      break;
    case 'exportButton':openExport();break;
    case 'closeDialog':byId('exportDialog').close();break;
    case 'copyCSS':case 'inspectorCopy':copyCSS();break;
    case 'downloadCSS':
      download(cleanFileName(state.motion.name)+'.css',compiled().css,'text/css;charset=utf-8');toast('CSS downloaded');break;
    case 'saveButton':
      download(cleanFileName(state.motion.name)+'.json',serializeProject(state.motion),'application/json;charset=utf-8');toast('Project saved');break;
    case 'importButton':byId('fileInput').click();break;
  }
});
byId('scrub').addEventListener('input',event=>seek(Number(event.target.value)));
byId('playbackSpeed').addEventListener('change',event=>setPlaybackSpeed(event.target.value));
byId('inspectorContent').addEventListener('change',event=>{
  const item=event.target;
  if(item.dataset.timing) {
    const field=item.dataset.timing;
    try{updateMotion(updateTiming(state.motion,field,item.value));}
    catch(error){toast(error.message,true);renderInspector()}
  } else if(item.dataset.frameProperty){
    const field=item.dataset.frameProperty;
    try{updateMotion(updateFrame(state.motion,state.selectedFrame,field,item.value));}
    catch(error){toast(error.message,true);renderInspector()}
  } else if(item.id==='keyframePosition'){
    const targetOffset=Number(item.value)/100;
    try {
      const updated=updateFrame(state.motion,state.selectedFrame,'offset',targetOffset);
      const selected=updated.keyframes.findIndex(frame=>frame.offset===targetOffset);
      if(updateMotion(updated,{index:selected}))seek(targetOffset*duration());
    } catch(error){toast(error.message,true);renderInspector()}
  }
});
byId('inspectorContent').addEventListener('submit',event=>{
  if(event.target.id!=='addPropertyForm')return;
  event.preventDefault();
  const input=new FormData(event.target);
  const property=String(input.get('property')||'').trim();
  const value=String(input.get('value')||'').trim();
  try {
    if(updateMotion(updateFrame(state.motion,state.selectedFrame,property,value)))toast(property+' added');
  }catch(error){toast(error.message,true)}
});
byId('motionName').addEventListener('change',event=>{
  const name=event.target.value.trim();
  if(!name){event.target.value=state.motion.name;return}
  const slug=cleanFileName(name);
  updateMotion({...state.motion,name,id:'pfx-'+slug});
});
byId('fileInput').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>250000)throw new RangeError('Project file too large');
    const imported=projectFromJSON(await file.text());
    if(updateMotion(imported,{index:imported.keyframes.length-1}))toast('Project loaded');
  } catch(error){toast('Could not import: '+error.message,true)}
  event.target.value='';
});
document.addEventListener('keydown',event=>{
  const tag=event.target?.tagName;
  if(event.ctrlKey||event.metaKey){
    if(event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo')}
    else if(event.key.toLowerCase()==='y'){event.preventDefault();history('redo')}
    return;
  }
  if(event.key===' ' && !['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)
     && !byId('exportDialog').open){event.preventDefault();togglePlay()}
});
window.addEventListener('pagehide',()=>{cancelFrame();controller?.dispose()});

renderAll({subject:true});
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(updateStageDimensions).observe(byId('canvas'));
} else {
  window.addEventListener('resize', updateStageDimensions, { passive: true });
  updateStageDimensions();
}
toast('Your motion studio is ready');
