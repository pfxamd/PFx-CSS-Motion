import { compileCSS } from '@pfxamd/css-motion-core';

const RESERVED = new Set(['offset', 'easing', 'composite']);
const EPSILON = 0.000001;
const round = value => Math.round(value * 10000) / 10000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function shiftKeyframes(motion, indexes, delta) {
  if (!motion || !Array.isArray(motion.keyframes)) throw new TypeError('Invalid motion');
  if (!Array.isArray(indexes) || !indexes.length) throw new RangeError('Select at least one keyframe');
  if (!Number.isFinite(delta)) throw new RangeError('Movement must be finite');
  const selected = [...new Set(indexes)];
  if (selected.some(i => !Number.isInteger(i) || i < 0 || i >= motion.keyframes.length)) {
    throw new RangeError('Invalid selected keyframe');
  }
  const offsets = selected.map(index => motion.keyframes[index].offset);
  const movement = round(clamp(delta, -Math.min(...offsets), 1 - Math.max(...offsets)));
  const lookup = new Set(selected);
  const entries = motion.keyframes.map((frame, original) => ({
    frame: {...frame, offset: lookup.has(original) ? round(clamp(frame.offset + movement, 0, 1)) : frame.offset},
    original
  }));
  entries.sort((a, b) => a.frame.offset - b.frame.offset || a.original - b.original);
  const selection = entries.map((entry, index) => lookup.has(entry.original) ? index : -1).filter(index => index >= 0);
  const originalIndexes = entries.map(entry => entry.original);
  const result = {...motion, keyframes: entries.map(entry => entry.frame)};
  return { motion: result, selection, originalIndexes, delta: movement };
}

export function insertSampledFrame(motion, offset, computedValues) {
  if (!motion || !Array.isArray(motion.keyframes)) throw new TypeError('Invalid motion');
  if (!(Number.isFinite(offset) && offset > 0 && offset < 1)) {
    throw new RangeError('Sample position must be inside the timeline');
  }
  if (motion.keyframes.length >= 24) throw new RangeError('Maximum 24 keyframes');
  if (motion.keyframes.some(frame => Math.abs(frame.offset - offset) < EPSILON)) {
    throw new RangeError('A keyframe already exists at this position');
  }
  if (!computedValues || typeof computedValues !== 'object' || Array.isArray(computedValues)) {
    throw new TypeError('Computed properties are required');
  }
  const properties = [...new Set(motion.keyframes.flatMap(frame => Object.keys(frame).filter(key => !RESERVED.has(key))))];
  if (properties.length === 0) throw new TypeError('No animated properties to sample');
  const frame = {offset: round(offset)};
  for (const property of properties) {
    const value = computedValues[property];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new TypeError('Cannot sample animated property: ' + property);
    }
    frame[property] = value.trim();
  }
  const list = [...motion.keyframes.map(frame => ({...frame})), frame];
  list.sort((a, b) => a.offset - b.offset);
  const next = {...motion, keyframes: list};
  compileCSS(next);
  return {motion: next, index: list.indexOf(frame)};
}

export function parseCubicCurve(easing) {
  const named = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1]
  };
  if (Object.hasOwn(named, easing)) return [...named[easing]];
  const match = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,)]+)\s*\)$/i.exec(easing);
  if (!match) return null;
  const points = match.slice(1).map(Number);
  if (!points.every(Number.isFinite) || points[0] < 0 || points[0] > 1 ||
    points[2] < 0 || points[2] > 1) return null;
  return points;
}

export function toCubicCurveString(points) {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(Number.isFinite)) {
    throw new TypeError('Expected four finite Bézier coordinates');
  }
  if (points[0] < 0 || points[0] > 1 || points[2] < 0 || points[2] > 1 ||
      points[1] < -2 || points[1] > 2 || points[3] < -2 || points[3] > 2) {
    throw new RangeError('Bézier coordinates outside editable bounds');
  }
  return 'cubic-bezier(' + points.map(round).join(', ') + ')';
}

export function moveCurveHandle(points, index, x, y) {
  if (![0, 1].includes(index)) throw new RangeError('Invalid Bézier handle');
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Curve coordinates must be finite');
  const result = [...points];
  result[index * 2] = round(clamp(x, 0, 1));
  result[index * 2 + 1] = round(clamp(y, -0.5, 1.6));
  return result;
}
