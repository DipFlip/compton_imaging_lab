import {rotateY,overlappingCrystals,dims,volume,rho,total,compton,kn,geometry,source,sub,norm,unit,dot,energySigma,normalCDF,addSpectrum,NB,M,rng} from './physics.js';

const clamp=x=>Math.max(-1,Math.min(1,x));
const degrees=180/Math.PI;

// Exact segment/axis-aligned-box intersection, in cm. Endpoints may lie inside.
export function boxPath(start,end,center){
  if(center.yaw){start=rotateY(sub(start,center),-center.yaw);end=rotateY(sub(end,center),-center.yaw);center=[0,0,0];}
  const delta=sub(end,start),length=norm(delta);
  let enter=0,exit=1;
  for(let axis=0;axis<3;axis++){
    const lower=center[axis]-dims[axis]/2,upper=center[axis]+dims[axis]/2;
    if(Math.abs(delta[axis])<1e-14){
      if(start[axis]<lower||start[axis]>upper)return 0;
      continue;
    }
    let a=(lower-start[axis])/delta[axis],b=(upper-start[axis])/delta[axis];
    if(a>b)[a,b]=[b,a];
    enter=Math.max(enter,a);exit=Math.min(exit,b);
    if(exit<=enter)return 0;
  }
  return (exit-enter)*length;
}
export const materialPath=(start,end,det)=>det.reduce((sum,c)=>sum+boxPath(start,end,c),0);

// Uniform-volume importance sampling. All path attenuation uses the actual
// sampled interaction coordinates, including occlusion by the other crystals.
export function volumeWeight(s,a,b,det,E=1){
  const incoming=sub(a,s),outgoing=sub(b,a);
  const r=norm(incoming),d=norm(outgoing);
  const cosine=clamp(dot(incoming,outgoing)/(r*d));
  const photonEnergy=E/(1+E*(1-cosine)/.511);
  const muPhoto=rho*Math.max(0,total(photonEnergy)-compton(photonEnergy));
  const attenuation=Math.exp(-rho*(total(E)*materialPath(s,a,det)+total(photonEnergy)*materialPath(a,b,det)));
  const weight=volume*volume*rho*compton(E)*kn(cosine,E)*muPhoto*attenuation/(4*Math.PI*r*r*d*d);
  return {weight,scatterEnergy:E-photonEnergy,theta:Math.acos(cosine)};
}

export function simulateVolume(p,{samples=1024,integrationSeed=73193}={}){
  const det=geometry(p),s=source(p.az,p.el,p.radius),random=rng(integrationSeed),noise=rng(integrationSeed^0x57ab);
  const overlap=overlappingCrystals(det);if(overlap)throw new Error(`Crystals ${overlap.join(" and ")} overlap. Increase separation or reduce rotation/gaps.`);
  const spectrum=new Float64Array(M),routes=[];
  const threshold=(p.thresholdKeV??20)/1000,E=(p.energyKeV??1000)/1000;
  let variance=0,armWeight=0,armSum=0,armSquare=0,positionSquare=0,measuredAccepted=0;
  let forwardWeight=0,reverseWeight=0;
  for(let i=0;i<4;i++)for(let j=4;j<8;j++)for(let order=0;order<2;order++){
    const ac=det[order?j:i],bc=det[order?i:j],base=(i*4+j-4)*NB;
    const centerTheta=Math.acos(clamp(dot(unit(sub(ac,s)),unit(sub(bc,ac)))));
    let sum=0,square=0;
    for(let n=0;n<samples;n++){
      const da=rotateY(dims.map(size=>(random()-.5)*size),ac.yaw),db=rotateY(dims.map(size=>(random()-.5)*size),bc.yaw);
      const a=ac.map((x,k)=>x+da[k]),b=bc.map((x,k)=>x+db[k]);
      const event=volumeWeight(s,a,b,det,E);
      const mean=order?E-event.scatterEnergy:event.scatterEnergy,sigma=energySigma(mean,p.res,E);
      addSpectrum(spectrum,base,mean,sigma,event.weight/samples,p.thresholdKeV??20,E);
      const acceptance=E<=2*threshold?0:sigma>0?normalCDF((E-threshold-mean)/sigma)-normalCDF((threshold-mean)/sigma):Number(mean>=threshold&&mean<E-threshold);
      const acceptedWeight=event.weight*acceptance;
      sum+=acceptedWeight;square+=acceptedWeight*acceptedWeight;
      if(order)reverseWeight+=acceptedWeight/samples;else forwardWeight+=acceptedWeight/samples;
      // Truth order is used ONLY for ARM diagnostics, never by reconstruction.
      const measured=mean+sigma*Math.sqrt(-2*Math.log(Math.max(1e-12,noise())))*Math.cos(2*Math.PI*noise());
      if(measured<threshold||measured>=E-threshold)continue;
      measuredAccepted+=event.weight;
      const scattered=order?measured:E-measured;
      const cosine=1-.511*(1/scattered-1/E);
      if(cosine < -1 || cosine > 1)continue;
      const arm=(Math.acos(cosine)-centerTheta)*degrees;
      const positionArm=(event.theta-centerTheta)*degrees;
      armWeight+=event.weight;armSum+=event.weight*arm;armSquare+=event.weight*arm*arm;
      positionSquare+=event.weight*positionArm*positionArm;
    }
    routes.push({first:order?j:i,second:order?i:j,weight:sum/samples});
    variance+=Math.max(0,(square-sum*sum/samples)/(samples*(samples-1)));
  }
  const eff=spectrum.reduce((a,b)=>a+b,0);
  return {spectrum,routes,eff,effSE:Math.sqrt(variance),armRms:armWeight?Math.sqrt(armSquare/armWeight):null,
    armBias:armWeight?armSum/armWeight:null,positionArmRms:armWeight?Math.sqrt(positionSquare/armWeight):null,
    armValidFraction:measuredAccepted?armWeight/measuredAccepted:0,
    reverseFraction:eff?reverseWeight/(forwardWeight+reverseWeight):0,samples:samples*32};
}
