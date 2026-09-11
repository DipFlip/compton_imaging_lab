import assert from 'node:assert/strict';
import {total,compton,kn,geometry,source,response,column,NX,NY} from './physics.js';
assert.ok(Math.abs(total(1)-.057823)<.00001);
assert.ok(compton(1)>0&&compton(1)<total(1));
let integral=0;for(let i=0;i<10000;i++)integral+=kn(-1+(i+.5)*2/10000)*4*Math.PI/10000;assert.ok(Math.abs(integral-1)<1e-5);
let p={sep:40,gapA:0,gapB:0,res:2.6,radius:100,az:35,el:15,events:500,mode:'fixed',seed:42,iterations:10};let d=geometry(p);assert.equal(d.length,8);let s=source(35,15,100),a=response(s,d[0],d[4]);assert.ok(a.e>=0&&a.e<=.797&&a.w>=0);
let front=column(source(35,15,100),d,p),back=column(source(-145,-15,100),d,p);assert.ok(front.every(v=>Number.isFinite(v)&&v>=0));assert.ok(Math.abs(front.reduce((a,b)=>a+b,0)/back.reduce((a,b)=>a+b,0)-1)<1e-9);
let frames=[];globalThis.self={postMessage:r=>frames.push(structuredClone(r))};await import('./worker.js');let start=performance.now();self.onmessage({data:p});let r=frames.at(-1);assert.equal(r.n,500);assert.equal(r.f.length,NX*NY);assert.ok(Math.abs(r.f.reduce((a,b)=>a+b,0)-1)<1e-9);assert.ok(r.f.every(v=>Number.isFinite(v)&&v>=0));assert.ok(r.eff>0&&r.eff<1);console.log({mu:total(1)*5.08,compton:compton(1),eff:r.eff,seconds:(performance.now()-start)/1000});console.log('Physics normalization, symmetric geometry, finite MLEM, event count and image normalization passed.');

// Spectral bin probabilities must remain normalized even for sub-bin resolution.
const {addSpectrum,NB}=await import('./physics.js');
let narrow=new Float64Array(NB);addSpectrum(narrow,0,.500,.0001,1);
assert.ok(Math.abs(narrow.reduce((a,b)=>a+b,0)-1)<1e-9);
assert.ok(Math.abs(narrow[49]-.5)<1e-6&&Math.abs(narrow[50]-.5)<1e-6);
let edge=new Float64Array(NB);addSpectrum(edge,0,.02,.002,1);
assert.ok(Math.abs(edge.reduce((a,b)=>a+b,0)-.5)<1e-6);

const {boxPath,materialPath,simulateVolume}=await import('./transport.js');
assert.equal(boxPath([0,0,-10],[0,0,10],[0,0,0]),2.54);
assert.equal(boxPath([0,0,0],[0,0,10],[0,0,0]),1.27);
assert.equal(boxPath([3,0,-10],[3,0,10],[0,0,0]),0);
assert.equal(boxPath([0,0,0],[0,0,0],[0,0,0]),0);
assert.ok(Math.abs(materialPath([0,0,-10],[0,0,10],[[0,0,-3],[0,0,3]])-5.08)<1e-12);
let sample=simulateVolume(p),reference=simulateVolume(p,{samples:8192,integrationSeed:9911});
assert.ok(Math.abs(sample.eff-reference.eff)<5*Math.hypot(sample.effSE,reference.effSE),'volume integral converges within its sampling uncertainty');
assert.ok(sample.armRms>sample.positionArmRms);
assert.ok(sample.armValidFraction>0&&sample.armValidFraction<=1);
assert.ok(sample.reverseFraction>0&&sample.reverseFraction<1);
assert.ok(sample.spectrum.every(v=>Number.isFinite(v)&&v>=0));
assert.deepEqual(sample,simulateVolume(p),'integration is reproducible');

for(const settings of [{generator:'volume'},{generator:'volume',az:180,el:0},{generator:'volume',sep:4,gapA:3,gapB:7},{generator:'volume',mode:'budget',emitted:0}]){
  frames=[];self.onmessage({data:{...p,...settings}});const last=frames.at(-1);
  assert.equal(last.unsupported,0,'the response grid must support the observed bins');
  assert.equal(last.n,settings.emitted===0?0:500);
  assert.ok(last.f.every(v=>Number.isFinite(v)&&v>=0));
  for(let i=1;i<frames.length;i++)assert.ok(frames[i].logLikelihood>=frames[i-1].logLikelihood-1e-8,'MLEM likelihood cannot decrease');
  if(settings.emitted===0)assert.equal(last.f.reduce((a,b)=>a+b,0),0);
}
console.log('Volume ray paths, integrated energy bins, integration convergence, reproducibility, short/back geometries, zero counts and MLEM monotonicity passed.');

const {exposure}=await import('./acquisition.js');
assert.equal(exposure(1,1).emitted,37000);
assert.equal(exposure(1000,3600).emitted,133200000000);
assert.equal(exposure(10000,18000).emitted,6660000000000);
assert.throws(()=>exposure(-1,1),RangeError);
for(const iterations of [1,2,3,4,5]){
  frames=[];self.onmessage({data:{...p,generator:'volume',activityUCi:1000,measurementSeconds:3600,iterations}});
  const r=frames.at(-1);assert.equal(r.it,iterations);assert.equal(r.emitted,133200000000);
  assert.ok(Math.abs(r.expectedEvents-r.eff*r.emitted)<1e-9);
  assert.ok(r.n>0);assert.ok(r.f.every(Number.isFinite));
}
frames=[];self.onmessage({data:{...p,generator:'volume',activityUCi:.1,measurementSeconds:1,iterations:1}});
assert.equal(frames.at(-1).n,0);
console.log('Activity/time conversion, 1–5 MLEM iterations and low-exposure zero-event acquisition passed.');

const {overlappingCrystals}=await import('./physics.js');
const rotated=geometry({...p,rotationA:90,rotationB:-35});
assert.ok(Math.abs(boxPath([rotated[0][0],rotated[0][1],-100],[rotated[0][0],rotated[0][1],100],rotated[0])-1.4)<1e-10);
assert.equal(overlappingCrystals(rotated),null);
assert.ok(overlappingCrystals(geometry({...p,sep:1})));
assert.throws(()=>simulateVolume({...p,sep:1}),/overlap/);
assert.ok(Math.abs(sample.routes.reduce((sum,r)=>sum+r.weight,0)-sample.eff)<1e-15);
const low=simulateVolume({...p,az:0,el:0,thresholdKeV:0});
const high=simulateVolume({...p,az:0,el:0,thresholdKeV:100});
assert.ok(low.eff>high.eff,'lower threshold admits additional forward routes');
frames=[];self.onmessage({data:{...p,generator:'volume',rotationA:45,rotationB:-30,thresholdKeV:0,iterations:2}});
assert.equal(frames.at(-1).n,500);
assert.ok(frames.at(-1).f.every(Number.isFinite));
assert.equal(frames.at(-1).paths.length,32);
console.log('Rotated ray lengths, overlap rejection, route normalization and adjustable threshold passed.');
for(const energyKeV of [50,100,662,3000]){
 const E=energyKeV/1000;
 let integral=0;for(let i=0;i<10000;i++)integral+=kn(-1+(i+.5)*2/10000,E)*4*Math.PI/10000;
 assert.ok(Math.abs(integral-1)<1e-5);
 const settings={...p,energyKeV,thresholdKeV:0,generator:'volume',iterations:2};
 const v=simulateVolume(settings);assert.ok(v.eff>0&&Number.isFinite(v.eff));
 assert.ok(Math.abs(v.routes.reduce((a,r)=>a+r.weight,0)-v.eff)<1e-14);
 frames=[];self.onmessage({data:settings});assert.equal(frames.at(-1).n,500);assert.ok(frames.at(-1).f.every(Number.isFinite));
 assert.ok(frames.at(-1).logLikelihood>=frames[0].logLikelihood-1e-8);
}
assert.equal(simulateVolume({...p,energyKeV:50,thresholdKeV:30}).eff,0);
assert.equal(column(s,d,{...p,energyKeV:50,thresholdKeV:30}).reduce((a,b)=>a+b,0),0);
console.log('50–3000 keV normalization, finite reconstruction, route sums and impossible threshold passed.');
