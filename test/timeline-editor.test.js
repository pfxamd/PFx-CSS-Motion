import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCSS } from '@pfxamd/css-motion-core';
import { makePreset } from '../src/motion-model.js';
import {
  shiftKeyframes, insertSampledFrame, parseCubicCurve,
  toCubicCurveString, moveCurveHandle
} from '../src/timeline-editor.js';

test('moving one keyframe changes its offset without mutating the source',()=>{
  const source=makePreset();
  const result=shiftKeyframes(source,[1],-.25);
  assert.deepEqual(result.motion.keyframes.map(f=>f.offset),[0,.75]);
  assert.deepEqual(source.keyframes.map(f=>f.offset),[0,1]);
  assert.deepEqual(result.selection,[1]);
  compileCSS(result.motion);
});
test('moving a selected group preserves distances and clamps to timeline bounds',()=>{
  let source=makePreset('slide');
  source={...source,keyframes:[{...source.keyframes[0]},{offset:.25,opacity:.2},{offset:.55,opacity:.8},{...source.keyframes[1]}]};
  const result=shiftKeyframes(source,[1,2],1);
  assert.deepEqual(result.motion.keyframes.map(f=>f.offset),[0,.7,1,1]);
  assert.equal(result.delta,.45);
  assert.deepEqual(result.selection,[1,2]);
});
test('group crossing another keyframe retains stable identities after sorting',()=>{
  const original=makePreset();
  const source={...original,keyframes:[
    {offset:0,opacity:0},
    {offset:.2,opacity:.2},
    {offset:.6,opacity:.6},
    {offset:1,opacity:1}
  ]};
  const result=shiftKeyframes(source,[1],.6);
  assert.deepEqual(result.motion.keyframes.map(f=>f.offset),[0,.6,.8,1]);
  assert.deepEqual(result.selection,[2]);
  assert.deepEqual(result.originalIndexes,[0,2,1,3]);
  assert.equal(result.motion.keyframes[2].opacity,.2);
});
test('snap values are rounded and floating-point drift is bounded',()=>{
  const source=makePreset();
  const result=shiftKeyframes(source,[0],.12345678);
  assert.equal(result.motion.keyframes[0].offset,.1235);
});
test('moving every keyframe clamps group as a whole',()=>{
  const result=shiftKeyframes(makePreset(),[0,1],.4);
  assert.equal(result.delta,0);
  assert.deepEqual(result.motion.keyframes.map(x=>x.offset),[0,1]);
});
test('reject invalid group selections and nonfinite deltas',()=>{
  const a=makePreset();
  for(const selected of [[],[3],[-1],[0.25]]) assert.throws(()=>shiftKeyframes(a,selected,0),RangeError);
  assert.throws(()=>shiftKeyframes(a,[1],NaN),RangeError);
});
test('sampled keyframe uses computed property values instead of nearest frame copy',()=>{
  const a=makePreset('slide');
  const sampled=insertSampledFrame(a,.4,{opacity:'0.314',transform:'matrix(1, 0, 0, 1, -35.8, 0)'});
  assert.equal(sampled.index,1);
  assert.equal(sampled.motion.keyframes[1].opacity,'0.314');
  assert.match(sampled.motion.keyframes[1].transform,/matrix/);
  assert.equal(a.keyframes.length,2);
  assert.match(compileCSS(sampled.motion).css,/0.314/);
});
test('sampling handles all declared animated properties',()=>{
  const a=makePreset();
  const result=insertSampledFrame(a,.5,{opacity:'0.5',transform:'matrix(1, 0, 0, 1, 0, 25)',filter:'blur(2px)'});
  assert.deepEqual(Object.keys(result.motion.keyframes[1]),['offset','opacity','transform','filter']);
});
test('sampled insert rejects duplicate, endpoint and unsafe values',()=>{
  const a=makePreset('slide');
  const values={opacity:'0.5',transform:'translateX(20px)'};
  for(const p of [-1,0,1,Infinity])assert.throws(()=>insertSampledFrame(a,p,values),RangeError);
  assert.throws(()=>insertSampledFrame(a,.4,{opacity:'0.5'}),TypeError);
  assert.throws(()=>insertSampledFrame(a,.4,{...values,opacity:'0; color:red'}));
  assert.throws(()=>insertSampledFrame(a,.4,null),TypeError);
});
test('parse CSS Bézier presets including linear and overshoot',()=>{
  assert.deepEqual(parseCubicCurve('linear'),[0,0,1,1]);
  assert.deepEqual(parseCubicCurve('ease-in'),[.42,0,1,1]);
  assert.deepEqual(parseCubicCurve('cubic-bezier(0.34, 1.56, 0.64, 1)'),[.34,1.56,.64,1]);
  assert.equal(parseCubicCurve('steps(4, end)'),null);
  assert.equal(parseCubicCurve('cubic-bezier(4, 0, 1, 1)'),null);
});
test('curve handle respects CSS x restrictions, permits visible overshoot',()=>{
  const source=[.25,.1,.25,1];
  const moved=moveCurveHandle(source,0,1.2,1.4);
  assert.deepEqual(moved,[1,1.4,.25,1]);
  assert.deepEqual(source,[.25,.1,.25,1]);
  assert.deepEqual(moveCurveHandle(source,1,-.5,-1),[.25,.1,0,-.5]);
});
test('curve encoding remains stable and is natively valid',()=>{
  const output=toCubicCurveString([.312345,.894567,.7,1.4]);
  assert.equal(output,'cubic-bezier(0.3123, 0.8946, 0.7, 1.4)');
  compileCSS({...makePreset(),timing:{...makePreset().timing,easing:output}});
  assert.throws(()=>toCubicCurveString([2,0,1,1]),RangeError);
  assert.throws(()=>toCubicCurveString([0,0,1,Infinity]),TypeError);
  assert.throws(()=>moveCurveHandle([0,0,1,1],3,0,0),RangeError);
});
