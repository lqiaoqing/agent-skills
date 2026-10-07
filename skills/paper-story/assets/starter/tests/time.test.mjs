import test from 'node:test';import assert from 'node:assert/strict';
import {makeWarp} from '../src/core/time.js';
test('retimed cues map and round-trip between real and story time',()=>{const w=makeWarp({start:0,middle:12,end:30},{start:0,middle:10,end:20},20);assert.equal(w.toDefault(12),10);assert.equal(w.duration,30);for(const t of [0,3,12,24,30,35])assert.ok(Math.abs(w.toReal(w.toDefault(t))-t)<1e-8);});
test('reject inverted, duplicate and missing anchors',()=>{assert.throws(()=>makeWarp({a:5,b:5},{a:0,b:10},10));assert.throws(()=>makeWarp({a:0,b:10},{a:10,b:0},10));assert.throws(()=>makeWarp({missing:0},{},10));assert.throws(()=>makeWarp([{real:NaN,default:0}],{},10));});
