import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMotion, compileCSS } from '@pfxamd/css-motion-core';
import {
  PRESETS,makePreset,copyMotion,allProperties,updateTiming,updateFrame,
  removeProperty,insertFrame,deleteFrame,formatTime,serializeProject,projectFromJSON
} from '../src/motion-model.js';

test('all presets are valid motions and export CSS',()=>{
  assert.equal(PRESETS.length,4);
  for(const preset of PRESETS){
    const motion=makePreset(preset.id);
    assert.equal(validateMotion(motion).valid,true);
    assert.match(compileCSS(motion).css,/@keyframes /);
    assert.equal(motion.keyframes.length,2);
  }
});
test('preset creation always returns fresh objects',()=>{
  const a=makePreset('lift'),b=makePreset('lift');
  assert.notEqual(a,b);assert.notEqual(a.keyframes[0],b.keyframes[0]);
  a.keyframes[0].opacity=1;
  assert.equal(b.keyframes[0].opacity,0);
});
test('unknown preset safely returns default',()=>{
  assert.equal(makePreset('does-not-exist').name,'Lift & reveal');
});
test('copyMotion preserves content without sharing mutable objects',()=>{
  const a=makePreset(),b=copyMotion(a);
  assert.deepEqual(a,b);
  b.timing.duration=2;b.keyframes[1].opacity=.3;
  assert.notDeepEqual(a,b);
});
test('allProperties excludes reserved keyframe fields',()=>{
  const result=allProperties(makePreset());
  assert.deepEqual(result,['opacity','transform','filter']);
});
test('timing edits are immutable and bounded',()=>{
  const a=makePreset(),b=updateTiming(a,'duration',500);
  assert.equal(b.timing.duration,500);
  assert.equal(a.timing.duration,1200);
  assert.throws(()=>updateTiming(a,'duration',0),RangeError);
  assert.throws(()=>updateTiming(a,'duration',30001),RangeError);
  assert.throws(()=>updateTiming(a,'delay',-30001),RangeError);
  assert.throws(()=>updateTiming(a,'iterations',-1),RangeError);
  assert.throws(()=>updateTiming(a,'endDelay',20),TypeError);
  assert.throws(()=>updateTiming(a,'direction','invalid'),TypeError);
});
test('keyframe value editing preserves siblings and can compile',()=>{
  const a=makePreset();
  const b=updateFrame(a,0,'transform','translateX(25px)');
  assert.equal(b.keyframes[0].transform,'translateX(25px)');
  assert.notEqual(a.keyframes[0].transform,b.keyframes[0].transform);
  assert.match(compileCSS(b).css,/translateX\(25px\)/);
});
test('offset edit resorts frames deterministically',()=>{
  const a=makePreset();
  const inserted=insertFrame(a,.5).motion;
  const edited=updateFrame(inserted,1,'offset',.75);
  assert.deepEqual(edited.keyframes.map(x=>x.offset),[0,.75,1]);
});
test('insertFrame clones nearest frame and respects 24-keyframe cap',()=>{
  const a=makePreset();
  const next=insertFrame(a,.25);
  assert.equal(next.motion.keyframes.length,3);
  assert.deepEqual(next.motion.keyframes.map(x=>x.offset),[0,.25,1]);
  assert.equal(next.motion.keyframes[1].opacity,a.keyframes[0].opacity);
  assert.equal(a.keyframes.length,2);
  let value=next.motion;
  for(let i=0;i<21;i++)value=insertFrame(value,(i+1)/100).motion;
  assert.equal(value.keyframes.length,24);
  assert.throws(()=>insertFrame(value,.42),RangeError);
});
test('deleteFrame prevents removing required endpoints',()=>{
  const m=makePreset();
  assert.throws(()=>deleteFrame(m,0),RangeError);
  const a=insertFrame(m,.5).motion;
  const b=deleteFrame(a,1);
  assert.deepEqual(b.keyframes.map(x=>x.offset),[0,1]);
});
test('removeProperty changes one frame only',()=>{
  const a=makePreset(),b=removeProperty(a,0,'filter');
  assert.equal('filter' in b.keyframes[0],false);
  assert.equal('filter' in b.keyframes[1],true);
  assert.equal('filter' in a.keyframes[0],true);
});
test('reject CSS declaration injection and reserved properties',()=>{
  const a=makePreset();
  assert.throws(()=>updateFrame(a,0,'color','red; background: blue'),TypeError);
  assert.throws(()=>updateFrame(a,0,'animationDuration','100ms'),TypeError);
  assert.throws(()=>updateFrame(a,0,'color; bad','red'),TypeError);
  assert.throws(()=>updateFrame(a,4,'opacity','0'),RangeError);
});
test('project exports round-trip through schema validation',()=>{
  const original=makePreset('slide');
  const input=serializeProject(original);
  const loaded=projectFromJSON(input);
  assert.deepEqual(loaded,original);
  assert.equal(JSON.parse(input).formatVersion,1);
});
test('import rejects malformed, unsupported and non-exportable motion',()=>{
  const a=makePreset();
  assert.throws(()=>projectFromJSON('{'),SyntaxError);
  assert.throws(()=>projectFromJSON('{}'),TypeError);
  assert.throws(()=>projectFromJSON({motion:{...a,schemaVersion:2}}),TypeError);
  assert.throws(()=>projectFromJSON({motion:{...a,timing:{...a.timing,endDelay:20}}}),RangeError);
  assert.throws(()=>projectFromJSON({motion:{...a,timing:{...a.timing,duration:50000}}}),RangeError);
});
test('display time formatting stays stable at boundaries',()=>{
  assert.equal(formatTime(0),'00:00.00');
  assert.equal(formatTime(600),'00:00.60');
  assert.equal(formatTime(1200),'00:01.20');
  assert.equal(formatTime(61230),'01:01.23');
  assert.equal(formatTime(-100),'00:00.00');
});
