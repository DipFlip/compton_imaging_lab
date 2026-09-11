import {geometry,source,column,overlappingCrystals,orderedSpectrum,NX,NY,M,rng,poisson} from './physics.js';
import {exposure} from './acquisition.js';
import {simulateVolume} from './transport.js';

self.onmessage=({data:p})=>{
  const acquisition=p.activityUCi!==undefined?exposure(p.activityUCi,p.measurementSeconds):null;
  if(acquisition)p={...p,mode:'budget',emitted:acquisition.emitted};
  const det=geometry(p),cols=[],sensitivity=new Float64Array(NX*NY);
  const overlap=overlappingCrystals(det);if(overlap)throw new Error(`Crystals ${overlap.join(" and ")} overlap. Increase separation or reduce rotation/gaps.`);
  for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){
    const j=y*NX+x,c=column(source(-180+(x+.5)*360/NX,Math.asin(1-2*(y+.5)/NY)*180/Math.PI,p.radius),det,p);
    sensitivity[j]=c.reduce((a,b)=>a+b,0);cols.push(c);
  }
  const modelTruth=column(source(p.az,p.el,p.radius),det,p);
  const modelEff=modelTruth.reduce((a,b)=>a+b,0);
  const transport=p.generator==='volume'?simulateVolume(p):null;
  const truth=transport?transport.spectrum:modelTruth;
  const eff=truth.reduce((a,b)=>a+b,0),random=rng(p.seed),counts=new Float64Array(M);
  if(p.mode==='fixed'&&eff>0){
    const cdf=[];let sum=0;
    for(const v of truth)cdf.push(sum+=v/eff);
    for(let n=0;n<p.events;n++){
      const u=random();let lo=0,hi=M-1;
      while(lo<hi){const m=(lo+hi)>>1;if(cdf[m]<u)lo=m+1;else hi=m;}
      counts[lo]++;
    }
  }else if(p.mode!=='fixed'){
    for(let i=0;i<M;i++)counts[i]=poisson(truth[i]*p.emitted,random);
  }
  const n=counts.reduce((a,b)=>a+b,0),active=[];
  for(let i=0;i<M;i++)if(counts[i])active.push(i);
  let unsupported=0;
  for(const i of active)if(!cols.some(c=>c[i]>0))unsupported+=counts[i];
  const f=new Float64Array(NX*NY).fill(n?1/(NX*NY):0),pred=new Float64Array(M);
  const paths=transport?.routes??[];
  if(!transport)for(let i=0;i<4;i++)for(let j=4;j<8;j++)for(let order=0;order<2;order++)paths.push({first:order?j:i,second:order?i:j,weight:orderedSpectrum(source(p.az,p.el,p.radius),det,p,i,j,order).reduce((a,b)=>a+b,0)});
  const diagnostics=transport?{...transport,spectrum:undefined}:null;
  for(let it=1;it<=p.iterations;it++){
    pred.fill(0);
    for(let j=0;j<f.length;j++)for(const i of active)pred[i]+=cols[j][i]*f[j];
    for(let j=0;j<f.length;j++){
      let z=0;for(const i of active)z+=cols[j][i]*counts[i]/Math.max(1e-300,pred[i]);
      f[j]*=z/Math.max(1e-300,sensitivity[j]);
    }
    const sum=f.reduce((a,b)=>a+b,0);
    if(sum)for(let j=0;j<f.length;j++)f[j]/=sum;
    if(it===1||it%5===0||it===p.iterations){
      // Profile the unknown overall source intensity for a comparable likelihood.
      let detected=0;pred.fill(0);
      for(let j=0;j<f.length;j++){
        detected+=sensitivity[j]*f[j];
        for(const i of active)pred[i]+=cols[j][i]*f[j];
      }
      let logLikelihood=-n;
      for(const i of active)logLikelihood+=counts[i]*Math.log(Math.max(1e-300,pred[i]*n/Math.max(1e-300,detected)));
      self.postMessage({paths,f,sensitivity,eff,modelEff,n,it,expectedEvents:p.mode==='fixed'?p.events:eff*p.emitted,activityBq:acquisition?.activityBq,unsupported,logLikelihood,diagnostics,emitted:p.mode==='fixed'?(eff?n/eff:0):p.emitted});
    }
  }
};
