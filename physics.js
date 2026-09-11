// cm, MeV. NIST elemental total attenuation, stoichiometric mass mixing.
export const dims=[1.4,1.4,2.54], volume=1.4*1.4*2.54, rho=5.08;
const en=[.04,.05,.06,.08,.1,.15,.2,.3,.4,.5,.6,.8,1,1.25,1.5,2,3],la=[25.79,14.47,8.962,4.177,2.315,.8239,.4239,.1961,.1301,.1015,.0857,.06843,.05876,.05110,.04640,.04122,.03737],br=[7.900,4.264,2.582,1.198,.6861,.2899,.1838,.1186,.09563,.08328,.07515,.06443,.05728,.05094,.04650,.04089,.03552];
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),norm=a=>Math.hypot(...a),unit=a=>a.map(x=>x/norm(a));
export function total(e){let i=0;while(i<en.length-2&&e>en[i+1])i++;let t=Math.log(Math.max(.04,Math.min(3,e))/en[i])/Math.log(en[i+1]/en[i]);let mix=j=>(138.905*la[j]+239.712*br[j])/378.617;return Math.exp(Math.log(mix(i))*(1-t)+Math.log(mix(i+1))*t);}
export function compton(e){let a=e/.511,l=Math.log(1+2*a);return 2*Math.PI*7.9408e-26*((1+a)/(a*a)*(2*(1+a)/(1+2*a)-l/a)+l/(2*a)-(1+3*a)/(1+2*a)**2)*6.02214e23*162/378.617;}
export function kn(c,e=1){let k=1/(1+e/.511*(1-c));return .5*7.9408e-26*k*k*(k+1/k-(1-c*c))/(compton(e)/(6.02214e23*162/378.617));}
export const area=u=>Math.abs(u[0])*1.4*2.54+Math.abs(u[1])*1.4*2.54+Math.abs(u[2])*1.4*1.4;
export function rotateY(v,yaw=0){const c=Math.cos(yaw),s=Math.sin(yaw);return [c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];}
export function geometry(p){return Array.from({length:8},(_,i)=>{
  const gap=i<4?p.gapA:p.gapB,yaw=(i<4?p.rotationA??0:p.rotationB??0)*Math.PI/180;
  const v=rotateY([((i%2)-.5)*(1.4+gap),((Math.floor(i/2)%2)-.5)*(1.4+gap),0],yaw);
  v[2]+=i<4?-p.sep/2:p.sep/2;v.yaw=yaw;return v;
});}
export function overlappingCrystals(det){
  for(let i=0;i<det.length;i++)for(let j=i+1;j<det.length;j++){
    const a=det[i],b=det[j];if(Math.abs(a[1]-b[1])>=dims[1]-1e-8)continue;
    const axes=[rotateY([1,0,0],a.yaw),rotateY([0,0,1],a.yaw),rotateY([1,0,0],b.yaw),rotateY([0,0,1],b.yaw)];
    if(axes.every(axis=>Math.abs(dot(sub(a,b),axis))<
      Math.abs(dot(axes[0],axis))*dims[0]/2+Math.abs(dot(axes[1],axis))*dims[2]/2+
      Math.abs(dot(axes[2],axis))*dims[0]/2+Math.abs(dot(axes[3],axis))*dims[2]/2-1e-8))return [i+1,j+1];
  }
  return null;
}
export function source(az,el,r){az*=Math.PI/180;el*=Math.PI/180;return [r*Math.cos(el)*Math.sin(az),r*Math.sin(el),-r*Math.cos(el)*Math.cos(az)];}
// Mean-chord transport and a direct photoelectric proxy. Not a full-energy peak calibration.
export function response(s,a,b,yawA=a.yaw??0,yawB=b.yaw??0,E=1){let incoming=unit(sub(a,s)),out=unit(sub(b,a)),c=Math.max(-1,Math.min(1,dot(incoming,out))),e=E/(1+E*(1-c)/.511),ai=area(rotateY(incoming,-yawA)),ao=area(rotateY(out,-yawB)),escapeArea=area(rotateY(out,-yawA)),mu=total(E)*rho,mp=total(e)*rho;
let w=ai/(4*Math.PI*norm(sub(a,s))**2)*(1-Math.exp(-mu*volume/ai))*compton(E)/total(E)*Math.exp(-mp*volume/escapeArea/2)*kn(c,E)*ao/norm(sub(b,a))**2*(1-Math.exp(-mp*volume/ao))*Math.max(0,1-compton(e)/total(e));return {e:E-e,w};}
// First-order propagation of independent uniform unknown coordinates in both crystals.
export function spread(s,a,b,res,E=1){
  let variance=0;const h=.01;
  for(let k=0;k<6;k++){
    const delta=rotateY([k%3===0?h:0,k%3===1?h:0,k%3===2?h:0],k<3?a.yaw:b.yaw);
    const aa=[...a],bb=[...b],target=k<3?aa:bb;
    for(let axis=0;axis<3;axis++)target[axis]+=delta[axis];
    const plus=response(s,aa,bb,a.yaw,b.yaw,E).e;
    for(let axis=0;axis<3;axis++)target[axis]-=2*delta[axis];
    const minus=response(s,aa,bb,a.yaw,b.yaw,E).e;
    variance+=((plus-minus)/(2*h))**2*dims[k%3]**2/12;
  }
  return Math.sqrt(variance+(res/100/2.355)**2*.662*response(s,a,b,a.yaw,b.yaw,E).e);
}
export const NX=72,NY=36,NB=100,M=16*NB;
// The known source-energy sum constrains two independent scintillation measurements.
export const energySigma=(e,res,E=1)=>res/100/2.355*Math.sqrt(.662*Math.max(0,e*(E-e)/E));
export function normalCDF(x){
  const t=1/(1+.2316419*Math.abs(x));
  const tail=Math.exp(-x*x/2)/Math.sqrt(2*Math.PI)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return x>=0?1-tail:tail;
}
// Integrate the Gaussian over bin edges: midpoint evaluation was inaccurate
// when energy resolution was narrower than the 10 keV measurement bins.
export function addSpectrum(out,base,mean,sigma,weight,thresholdKeV=20,E=1){
  const lower=thresholdKeV/1000,upper=E-lower,bin=E/NB;
  if(upper<=lower)return;
  if(sigma<1e-10){const k=Math.floor(mean/bin);if(mean>=lower&&mean<upper&&k>=0&&k<NB)out[base+k]+=weight;return;}
  const lo=Math.max(0,Math.floor(Math.max(lower,mean-7*sigma)/bin));
  const hi=Math.min(NB,Math.ceil(Math.min(upper,mean+7*sigma)/bin));
  for(let k=lo;k<hi;k++){
    const left=Math.max(lower,k*bin),right=Math.min(upper,(k+1)*bin);
    if(right>left)out[base+k]+=weight*Math.max(0,normalCDF((right-mean)/sigma)-normalCDF((left-mean)/sigma));
  }
}
export function orderedSpectrum(s,det,p,i,j,order){
  const E=(p.energyKeV??1000)/1000,a=det[order?j:i],b=det[order?i:j],r=response(s,a,b,a.yaw,b.yaw,E),mean=order?E-r.e:r.e;
  const sigma=Math.sqrt(spread(s,a,b,0,E)**2+energySigma(mean,p.res,E)**2),out=new Float64Array(NB);
  addSpectrum(out,0,mean,sigma,r.w,p.thresholdKeV??20,E);return out;
}
export function column(s,det,p){
  const out=new Float64Array(M);
  for(let i=0;i<4;i++)for(let j=4;j<8;j++)for(let order=0;order<2;order++){
    const bins=orderedSpectrum(s,det,p,i,j,order),base=(i*4+j-4)*NB;
    for(let k=0;k<NB;k++)out[base+k]+=bins[k];
  }
  return out;
}
export function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function poisson(l,r){if(l<30){let n=0,q=1,L=Math.exp(-l);do{n++;q*=r();}while(q>L);return n-1;}return Math.max(0,Math.round(l+Math.sqrt(l)*Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r())));}
