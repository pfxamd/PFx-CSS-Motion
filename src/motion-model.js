import { createMotion, validateMotion, compileCSS } from '@pfxamd/css-motion-core';

export const PRESETS = Object.freeze([
  {
    id: 'lift', label: 'Lift & reveal', caption: 'Soft entrance / spatial depth', curve: 'M 0 36 C 24 36, 26 6, 74 6',
    timing: { duration: 1200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    keyframes: [
      { offset: 0, opacity: 0, transform: 'translateY(48px) scale(0.92)', filter: 'blur(6px)' },
      { offset: 1, opacity: 1, transform: 'translateY(0px) scale(1)', filter: 'blur(0px)' }
    ]
  },
  {
    id: 'elastic', label: 'Soft overshoot', caption: 'Expressive / overshooting', curve: 'M 0 36 C 24 36, 38 -10, 50 8 S 68 6, 74 6',
    timing: { duration: 1000, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    keyframes: [
      { offset: 0, opacity: 0.2, transform: 'scale(0.68) rotate(-6deg)' },
      { offset: 1, opacity: 1, transform: 'scale(1) rotate(0deg)' }
    ]
  },
  {
    id: 'slide', label: 'Horizontal drift', caption: 'Directional / balanced', curve: 'M 0 36 C 19 34, 40 14, 74 6',
    timing: { duration: 900, easing: 'ease-in-out' },
    keyframes: [
      { offset: 0, opacity: 0, transform: 'translateX(-95px)' },
      { offset: 1, opacity: 1, transform: 'translateX(0px)' }
    ]
  },
  {
    id: 'turn', label: 'Turn & settle', caption: 'Rotation / considered', curve: 'M 0 36 C 30 34, 37 6, 74 6',
    timing: { duration: 1400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    keyframes: [
      { offset: 0, opacity: 0, transform: 'rotate(-24deg) scale(0.78)' },
      { offset: 1, opacity: 1, transform: 'rotate(0deg) scale(1)' }
    ]
  }
]);

export const TIMING_FIELDS = Object.freeze({
  duration: { min: 1, max: 30000, step: 10 },
  delay: { min: -30000, max: 30000, step: 10 },
  iterations: { min: 0, max: 1000, step: 0.5 }
});

export function makePreset(id='lift') {
  const preset=PRESETS.find(item=>item.id===id) ?? PRESETS[0];
  return createMotion({
    id: 'pfx-'+preset.id,
    name: preset.label,
    timing: { duration:preset.timing.duration, easing:preset.timing.easing, fill:'both' },
    keyframes: preset.keyframes.map(frame=>({...frame}))
  });
}

export function copyMotion(motion) {
  return createMotion({
    id:motion.id,name:motion.name,timing:{...motion.timing},
    keyframes:motion.keyframes.map(frame=>({...frame}))
  });
}

export function allProperties(motion) {
  return [...new Set(motion.keyframes.flatMap(frame=>
    Object.keys(frame).filter(key=>!['offset','easing','composite'].includes(key))
  ))];
}

export function updateTiming(motion,field,value) {
  if(!['duration','delay','iterations','direction','fill','easing'].includes(field))
    throw new TypeError('Unknown motion timing field');
  if(['duration','delay','iterations'].includes(field)) {
    value=Number(value);
    const spec=TIMING_FIELDS[field];
    if(!Number.isFinite(value)||value<spec.min||value>spec.max)
      throw new RangeError(field+' must be between '+spec.min+' and '+spec.max);
  }
  if(field==='direction' && !['normal','reverse','alternate','alternate-reverse'].includes(value))
    throw new TypeError('Invalid motion direction');
  if(field==='fill' && !['none','forwards','backwards','both'].includes(value))
    throw new TypeError('Invalid motion fill');
  if(field==='easing' && (typeof value!=='string'||value.trim().length===0))
    throw new TypeError('Easing must be a CSS easing value');
  return {...motion,timing:{...motion.timing,[field]:value}};
}

export function updateFrame(motion,index,field,value) {
  if(!Number.isInteger(index)||index<0||index>=motion.keyframes.length)
    throw new RangeError('Invalid keyframe index');
  const frames=motion.keyframes.map(frame=>({...frame}));
  if(field==='offset') {
    value=Number(value);
    if(!Number.isFinite(value)||value<0||value>1)
      throw new RangeError('Keyframe offset must be 0–1');
  } else if(field==='easing') {
    if(typeof value!=='string'||!value.trim())
      throw new TypeError('Keyframe easing must be nonempty');
  } else {
    if(!/^(?:--[a-zA-Z_][\w-]*|-?[a-zA-Z_][\w-]*)$/.test(field)||
       field==='composite'||field==='offset'||field==='easing'||
       /^animation(?:-|[A-Z])/.test(field))
      throw new TypeError('Invalid or reserved CSS property');
    if(typeof value!=='string' && !Number.isFinite(value))
      throw new TypeError('Invalid CSS value');
    if(String(value).trim()==='' || /[;{}\r\n\f]|\/\*|\*\//.test(String(value)))
      throw new TypeError('Invalid CSS declaration value');
  }
  frames[index][field]=value;
  if(field==='offset') {
    frames.sort((a,b)=>a.offset-b.offset);
  }
  return {...motion,keyframes:frames};
}

export function removeProperty(motion,index,property) {
  if(!Number.isInteger(index)||index<0||index>=motion.keyframes.length)
    throw new RangeError('Invalid keyframe index');
  if(['offset','easing','composite'].includes(property))
    throw new TypeError('Cannot remove reserved field');
  const frames=motion.keyframes.map(frame=>({...frame}));
  delete frames[index][property];
  return {...motion,keyframes:frames};
}

export function insertFrame(motion, offset) {
  const frames=motion.keyframes.map(frame=>({...frame}));
  if(frames.length>=24)throw new RangeError('Maximum 24 keyframes');
  offset=Number(offset);
  if(!Number.isFinite(offset)||offset<0||offset>1)throw new RangeError('Invalid keyframe time');
  const nearest=frames.reduce((best,frame)=>
    Math.abs(frame.offset-offset)<Math.abs(best.offset-offset)?frame:best,frames[0]);
  const next={...nearest,offset};
  frames.push(next);
  frames.sort((a,b)=>a.offset-b.offset);
  return {motion:{...motion,keyframes:frames},index:frames.indexOf(next)};
}

export function deleteFrame(motion,index) {
  if(motion.keyframes.length<=2)throw new RangeError('Keep at least 2 keyframes');
  if(!Number.isInteger(index)||index<0||index>=motion.keyframes.length)
    throw new RangeError('Invalid keyframe index');
  return {...motion,keyframes:motion.keyframes.filter((_,i)=>i!==index)};
}

export function formatTime(ms) {
  const value=Math.max(0,Number.isFinite(ms)?ms:0)/1000;
  const minutes=Math.floor(value/60);
  const seconds=Math.floor(value%60);
  const centiseconds=Math.floor((value%1)*100+1e-8);
  return String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')+'.'+String(centiseconds).padStart(2,'0');
}

export function projectFromJSON(json) {
  const parsed=typeof json==='string'?JSON.parse(json):json;
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    throw new TypeError('Invalid project');
  const m=parsed.motion??parsed;
  const result=validateMotion(m);
  if(!result.valid)throw new TypeError(result.errors.map(x=>x.path+': '+x.message).join('; '));
  if(m.keyframes.length<2||m.keyframes.length>24)
    throw new RangeError('Projects must contain between 2 and 24 keyframes');
  if(!Number.isFinite(m.timing.duration)||m.timing.duration<1||m.timing.duration>30000)
    throw new RangeError('Duration must be 1–30000 ms');
  // Preview and CSS export must agree. The UI does not expose endDelay.
  if(m.timing.endDelay!==0)
    throw new RangeError('The editor cannot export projects with endDelay');
  compileCSS(m);
  return copyMotion(m);
}

export function serializeProject(motion) {
  return JSON.stringify({application:'PFx CSS Motion',formatVersion:1,motion},null,2)+'\n';
}
