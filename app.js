import {exposure} from './acquisition.js';
import {RoomView} from './room-view.js';
import {geometry,source,dims,NX,NY,dot,unit,sub} from './physics.js';
const $=id=>document.getElementById(id);let p={sep:40,gapA:0,gapB:0,radius:100,az:0,el:0,res:2.6,iterations:30,thresholdKeV:20,energyKeV:1000,rotationA:0,rotationB:0,activityUCi:1000,measurementSeconds:3600,generator:'volume',seed:42},worker,result,records=[],busy=true,timer,roomView;
function slider(parent,key,label,min,max,step,unit){let l=document.createElement('label');l.innerHTML=`${label}<output id="${key}Value"></output><input id="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${p[key]}">`;$(parent).append(l);$(key).oninput=()=>{p[key]=+$(key).value;sync();schedule();};$(key).dataset.unit=unit;}
slider('controls','sep','Layer center separation',4,80,1,'cm');slider('controls','gapA','Edge gap · layer A',0,20,.5,'cm');slider('controls','gapB','Edge gap · layer B',0,20,.5,'cm');slider('controls','rotationA','Layer A yaw',-90,90,1,'°');slider('controls','rotationB','Layer B yaw',-90,90,1,'°');slider('sourceControls','az','Azimuth',-180,180,1,'°');slider('sourceControls','el','Elevation',-85,85,1,'°');slider('sourceControls','radius','Source distance',25,300,5,'cm');slider('reconControls','energyKeV','Gamma-ray energy',50,3000,10,'keV');slider('reconControls','thresholdKeV','Low-energy threshold per hit',0,200,1,'keV');slider('reconControls','res','Energy FWHM @ 662 keV',2,6,.1,'%');slider('reconControls','iterations','MLEM iterations',1,100,1,'');
function formatActivity(v){return v>=1000?`${(v/1000).toLocaleString(undefined,{maximumFractionDigits:3})} mCi`:`${v.toLocaleString(undefined,{maximumFractionDigits:1})} µCi`;}
function formatTime(v){return v>=3600?`${Math.floor(v/3600)} h ${Math.floor(v%3600/60)} min ${v%60} s`:v>=60?`${Math.floor(v/60)} min ${v%60} s`:`${v} s`;}
function exposureSlider(key,title,min,max,unit,format){
  const label=document.createElement('label');label.innerHTML=`${title}<output id="${key}Value"></output><input type="range" id="${key}" aria-label="${title}" min="${Math.log10(min)}" max="${Math.log10(max)}" step="any"><div class="exact-value"><input type="number" id="${key}Exact" aria-label="${title} in ${unit}" min="${min}" max="${max}" step="${key==='activityUCi'?'.1':'1'}"><span>${unit}</span></div>`;
  $('acquisitionControls').append(label);
  const update=()=>{$(key).value=Math.log10(p[key]);$(key+'Exact').value=p[key];$(key+'Value').textContent=format(p[key]);$(key).setAttribute('aria-valuetext',format(p[key]));};
  $(key).oninput=()=>{p[key]=key==='activityUCi'?Math.round(10**+$(key).value*10)/10:Math.round(10**+$(key).value);update();schedule();};
  $(key+'Exact').onchange=()=>{const value=+$(key+'Exact').value;if(!Number.isFinite(value)||value<min||value>max){$(key+'Exact').reportValidity();update();return;}p[key]=key==='activityUCi'?Math.round(value*10)/10:Math.round(value);update();schedule();};
  update();
}
exposureSlider('activityUCi','Source activity',.1,10000,'µCi',formatActivity);
exposureSlider('measurementSeconds','Measurement time',1,18000,'seconds',formatTime);
function sync(){for(let key of ['sep','gapA','gapB','rotationA','rotationB','thresholdKeV','energyKeV','az','el','radius','res','iterations']){$(key).value=p[key];$(key+'Value').textContent=p[key]+' '+$(key).dataset.unit;}drawScene();}
function schedule(){busy=true;result=null;$('save').disabled=true;$('status').textContent='Updating response…';$('eff').textContent=$('count').textContent=$('photons').textContent='—';$('transportStatus').textContent='Updating event model…';$('expected').textContent='Calculating expected counts…';checkSweep();drawMap();if(worker)worker.terminate();clearTimeout(timer);timer=setTimeout(run,220);}
function run(){busy=true;$('save').disabled=true;worker=new Worker('./worker.js',{type:'module'});worker.onerror=e=>{$('status').textContent='Simulation error: '+e.message;};worker.onmessage=({data:r})=>{result=r;busy=r.it!==p.iterations;$('save').disabled=busy;$('eff').textContent=(r.eff*1e6).toPrecision(3);$('count').textContent=r.n.toLocaleString();$('photons').textContent=r.emitted.toExponential(2);$('expected').textContent=`Expected: ${(r.expectedEvents>0&&r.expectedEvents<.01?r.expectedEvents.toExponential(2):r.expectedEvents.toLocaleString(undefined,{maximumFractionDigits:2}))}`;metrics();showTransport();$('status').textContent=r.n?`Iteration ${r.it}/${p.iterations} · peak error ${r.error.toFixed(1)}° · 68% image radius ${r.r68.toFixed(1)}°${r.unsupported?' · '+r.unsupported+' events outside response support':''}`:'No accepted events. Try lowering the per-hit threshold or increasing exposure.';drawMap();};worker.postMessage({...p});}
document.querySelectorAll('[data-az]').forEach(b=>b.onclick=()=>{p.az=+b.dataset.az;p.el=+b.dataset.el;sync();schedule();});$('resample').onclick=()=>{p.seed++;schedule();};$('view').onchange=()=>{updateMapTitle();drawMap();};$('projection').onchange=()=>{$('roomOverlay').hidden=$('projection').value!=='room';$('skyPanel').hidden=$('projection').value!=='sky';updateMapTitle();drawMap();roomView?.requestRender();};
function updateMapTitle(){$('mapTitle').textContent=$('view').value==='sensitivity'?'Approximate response sensitivity':$('projection').value==='room'?'Reconstruction · detector view':'Reconstructed directional intensity';}
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(a,b))))*180/Math.PI;function dir(j){return unit(source(-180+(j%NX+.5)*360/NX,Math.asin(1-2*(Math.floor(j/NX)+.5)/NY)*180/Math.PI,1));}
function metrics(){let f=result.f,peak=0;for(let j=1;j<f.length;j++)if(f[j]>f[peak])peak=j;result.peak=peak;result.error=angle(dir(peak),unit(source(p.az,p.el,1)));let sorted=Array.from(f,(v,j)=>[angle(dir(j),dir(peak)),v]).sort((a,b)=>a[0]-b[0]),sum=0;result.r68=180;for(let [r,v]of sorted){sum+=v;if(sum>=.68){result.r68=r;break;}}}
function canvas(id){let c=$(id),r=c.getBoundingClientRect(),d=devicePixelRatio||1;c.width=r.width*d;c.height=r.height*d;let ctx=c.getContext('2d');ctx.scale(d,d);return [ctx,r.width,r.height];}
function drawScene(){roomView?.setGeometry(p);}
function color(t){let stops=[[241,247,250],[109,182,203],[247,199,79],[218,72,35]],u=Math.min(2.999,Math.max(0,t)*3),i=Math.floor(u);return `rgb(${stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*(u-i))).join(',')})`;}
function drawMap(){roomView?.setPaths(result?.paths??null);roomView?.setHeat(result?($('view').value==='sensitivity'?result.sensitivity:result.f):null,result?.peak,$('view').value==='reconstruction');if($('skyPanel').hidden)return;let [c,w,h]=canvas('sky'),l=45,t=14,pw=w-l-15,ph=h-50,values=result?($('view').value==='sensitivity'?result.sensitivity:result.f):null,max=values?Math.max(...values):1;c.fillStyle='#f1f7fa';c.fillRect(l,t,pw,ph);if(values)for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){c.fillStyle=color(values[y*NX+x]/Math.max(1e-30,max));c.fillRect(l+x*pw/NX,t+y*ph/NY,pw/NX+.5,ph/NY+.5);}c.font='11px system-ui';c.fillStyle='#506270';c.textAlign='center';for(let a of [-180,-90,0,90,180])c.fillText(a+'°',l+(a+180)/360*pw,h-12);c.textAlign='right';for(let e of [-90,-30,0,30,90])c.fillText(e+'°',l-7,t+(1-Math.sin(e*Math.PI/180))/2*ph+4);let x=l+(p.az+180)/360*pw,y=t+(1-Math.sin(p.el*Math.PI/180))/2*ph;c.strokeStyle='#253d49';c.lineWidth=2;c.beginPath();c.moveTo(x-7,y);c.lineTo(x+7,y);c.moveTo(x,y-7);c.lineTo(x,y+7);c.stroke();if(result&&result.n&&$('view').value==='reconstruction'){let j=result.peak;c.beginPath();c.arc(l+(j%NX+.5)/NX*pw,t+(Math.floor(j/NX)+.5)/NY*ph,6,0,2*Math.PI);c.stroke();}c.lineWidth=1;}
$('sky').onclick=e=>{let r=$('sky').getBoundingClientRect(),x=(e.clientX-r.left-45)/(r.width-60),y=(e.clientY-r.top-14)/(r.height-50);if(x<0||x>1||y<0||y>1)return;p.az=Math.round(x*360-180);p.el=Math.round(Math.asin(1-y*2)*180/Math.PI);p.el=Math.max(-85,Math.min(85,p.el));sync();schedule();};
$('save').onclick=()=>{if(busy||!result)return;records.push({...p,...result,armRms:result.diagnostics?.armRms,effSE:result.diagnostics?.effSE,f:undefined,sensitivity:undefined});let r=result;let tr=document.createElement('tr');for(let text of [`${p.sep} / ${p.gapA}, ${p.gapB}`,`${p.az}, ${p.el}`,`${p.energyKeV} keV`,p.generator==='volume'?'Volume':'Matched',formatActivity(p.activityUCi),formatTime(p.measurementSeconds),r.n,(r.eff*1e6).toPrecision(3),r.n?r.error.toFixed(1)+'°':'—',r.n?r.r68.toFixed(1)+'°':'—']){let td=document.createElement('td');td.textContent=text;tr.append(td);}$('history').append(tr);};$('export').onclick=()=>{let keys=['sep','gapA','gapB','rotationA','rotationB','thresholdKeV','energyKeV','az','el','radius','activityUCi','measurementSeconds','generator','seed','iterations','res','n','expectedEvents','eff','emitted','error','r68','armRms','effSE'];let csv=[keys.join(','),...records.map(r=>keys.map(k=>r[k]).join(','))].join('\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='compton-comparisons.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};new ResizeObserver(()=>{drawScene();drawMap();drawSweep();}).observe($('scene'));try{roomView=new RoomView();}catch(error){$('roomLoad').textContent='3D view unavailable: '+error.message;$('projection').value='sky';$('projection').onchange();}sync();setTimeout(run,0);


function showTransport(){
  const d=result.diagnostics;
  $('transportStatus').textContent=d?
    `Volume sample: ${d.samples.toLocaleString()} position pairs · rate sampling SE ${(100*d.effSE/result.eff).toFixed(1)}% · true-order ARM RMS ${d.armRms===null?'—':d.armRms.toFixed(1)+'°'} (${(100*d.armValidFraction).toFixed(0)}% physical angles) · B scatters first ${(100*d.reverseFraction).toFixed(0)}%`:
    'Matched-model acquisition: generated from the same approximation used by MLEM.';
}

let sweepWorker,sweepPoints=[],sweepParams=null,sweepBusy=false;
const sweepKey=q=>JSON.stringify([q.gapA,q.gapB,q.radius,q.az,q.el,q.res,q.rotationA,q.rotationB,q.thresholdKeV,q.energyKeV]);
function checkSweep(){
  if(sweepParams&&sweepKey(sweepParams)!==sweepKey(p)){
    if(sweepWorker)sweepWorker.terminate();
    sweepBusy=false;$('sweep').disabled=false;sweepPoints=[];sweepParams=null;
    $('sweepResults').hidden=true;$('exportSweep').disabled=true;
    $('sweepStatus').textContent='Source, gaps or energy response changed. Run a new sweep.';
  }else {if(sweepPoints.length)renderSweepTable();drawSweep();}
}
$('sweep').onclick=()=>{
  if(sweepWorker)sweepWorker.terminate();
  sweepParams={...p};sweepPoints=[];sweepBusy=true;
  $('sweep').disabled=true;$('exportSweep').disabled=true;$('sweepResults').hidden=true;
  $('sweepStatus').textContent='Sampling eight geometries…';
  sweepWorker=new Worker('./sweep-worker.js',{type:'module'});
  sweepWorker.onerror=e=>{sweepBusy=false;$('sweep').disabled=false;$('sweepStatus').textContent='Sweep error: '+e.message;};
  sweepWorker.onmessage=({data:r})=>{
    sweepPoints.push(r.point);$('sweepResults').hidden=false;
    $('sweepStatus').textContent=`${r.index+1}/${r.total} separations · source ${sweepParams.az}°, ${sweepParams.el}° at ${sweepParams.radius} cm · A/B gaps ${sweepParams.gapA}/${sweepParams.gapB} cm · volume sampling`;
    if(r.index+1===r.total){sweepBusy=false;$('sweep').disabled=false;$('exportSweep').disabled=false;}
    renderSweepTable();drawSweep();
  };
  sweepWorker.postMessage(sweepParams);
};
function renderSweepTable(){
  $('sweepTable').replaceChildren();
  for(const r of sweepPoints){
    const tr=document.createElement('tr'),cell=document.createElement('td'),button=document.createElement('button');
    button.textContent=r.sep+' cm';button.setAttribute('aria-label','Reconstruct at '+r.sep+' cm separation');
    button.disabled=!!r.invalid;button.onclick=()=>{p.sep=r.sep;sync();schedule();};cell.append(button);tr.append(cell);
    for(const text of [r.invalid?'Overlapping crystals':(r.eff*1e6).toPrecision(3),r.armRms===null?'—':r.armRms.toFixed(2)+'°',(100*r.armValidFraction).toFixed(0)+'%',r.invalid?'—':(r.eff*exposure(p.activityUCi,p.measurementSeconds).emitted).toLocaleString(undefined,{maximumFractionDigits:2})]){
      const td=document.createElement('td');td.textContent=text;tr.append(td);
    }
    $('sweepTable').append(tr);
  }
}
function drawSweep(){
  if(!sweepPoints.length||$('sweepResults').hidden)return;
  function plot(id,series,logarithmic,label){
    const [c,w,h]=canvas(id),left=62,right=w-14,top=16,bottom=h-47;
    const values=sweepPoints.flatMap(r=>series.map(s=>r[s.key])).filter(v=>v!==null&&v>0);
    if(!values.length)return;
    let min=logarithmic?Math.floor(Math.log10(Math.min(...values)*.8)):0;
    let max=logarithmic?Math.ceil(Math.log10(Math.max(...values)*1.2)):Math.ceil(Math.max(...values)*1.15);
    if(max<=min)max=min+1;
    const x=v=>left+(v-4)/76*(right-left),y=v=>bottom-((logarithmic?Math.log10(Math.max(v,1e-30)):v)-min)/(max-min)*(bottom-top);
    c.font='11px system-ui';c.lineWidth=1;
    const ticks=logarithmic?Array.from({length:max-min+1},(_,i)=>min+i):Array.from({length:5},(_,i)=>min+i*(max-min)/4);
    c.textAlign='right';
    for(const tick of ticks){const py=bottom-(tick-min)/(max-min)*(bottom-top);c.strokeStyle='#dfe7eb';c.beginPath();c.moveTo(left,py);c.lineTo(right,py);c.stroke();c.fillStyle='#506270';c.fillText(logarithmic?'1e'+tick:tick.toFixed(1),left-7,py+4);}
    c.textAlign='center';c.fillStyle='#506270';
    for(const tick of [4,20,40,60,80])c.fillText(tick,x(tick),bottom+18);
    c.fillText('Layer separation (cm)',(left+right)/2,h-6);
    c.save();c.translate(12,(top+bottom)/2);c.rotate(-Math.PI/2);c.fillText(label,0,0);c.restore();
    // Clip error bars and curves to the plot area.
    c.save();c.beginPath();c.rect(left-4,top-4,right-left+8,bottom-top+8);c.clip();
    if(p.sep>=4&&p.sep<=80){c.strokeStyle='#596a7d';c.setLineDash([3,4]);c.beginPath();c.moveTo(x(p.sep),top);c.lineTo(x(p.sep),bottom);c.stroke();c.setLineDash([]);}
    for(const s of series){
      c.strokeStyle=s.color;c.fillStyle=s.color;c.lineWidth=2;c.beginPath();let started=false;
      for(const r of sweepPoints){if(r[s.key]===null)continue;const px=x(r.sep),py=y(r[s.key]);if(!started){c.moveTo(px,py);started=true;}else c.lineTo(px,py);}c.stroke();
      for(const r of sweepPoints){if(r[s.key]===null)continue;const px=x(r.sep),py=y(r[s.key]);c.beginPath();c.arc(px,py,3,0,2*Math.PI);c.fill();
        if(logarithmic){c.lineWidth=1;c.beginPath();c.moveTo(px,y(Math.max(r.eff*.01,r.eff-2*r.effSE)*1e6));c.lineTo(px,y((r.eff+2*r.effSE)*1e6));c.stroke();}
      }
    }
    c.restore();
  }
  for(const r of sweepPoints)r.perMillion=r.invalid?null:r.eff*1e6;
  plot('ratePlot',[{key:'perMillion',color:'#2677a8'}],true,'Accepted / 10⁶ emitted');
  plot('armPlot',[{key:'armRms',color:'#2677a8'},{key:'positionArmRms',color:'#8754aa'}],false,'ARM RMS (degrees)');
}
$('exportSweep').onclick=()=>{
  if(!sweepPoints.length||sweepBusy)return;
  const keys=['sep','gapA','gapB','rotationA','rotationB','thresholdKeV','energyKeV','radius','az','el','res','eff','effSE','armRms','positionArmRms','armBias','armValidFraction','reverseFraction','photonsFor500','activityUCi','measurementSeconds','expectedEvents'];
  const rows=sweepPoints.map(point=>({...sweepParams,...point,activityUCi:p.activityUCi,measurementSeconds:p.measurementSeconds,expectedEvents:point.eff*exposure(p.activityUCi,p.measurementSeconds).emitted}));
  const csv=[keys.join(','),...rows.map(r=>keys.map(k=>r[k]??'').join(','))].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='compton-spacing-sweep.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

// Keep panel headings available while hiding their controls and visualization.
for (const title of [document.querySelector('.workspace .panel h2'), $('mapTitle')]) {
  const panel=title.closest('.panel'),button=document.createElement('button');
  button.type='button';button.className='panel-toggle';button.textContent=title.textContent;
  if(title.id){button.id=title.id;title.removeAttribute('id');}
  button.setAttribute('aria-expanded','true');title.replaceChildren(button);
  button.onclick=()=>{
    const collapsed=panel.classList.toggle('panel-collapsed');
    button.setAttribute('aria-expanded',String(!collapsed));
    if(!collapsed)requestAnimationFrame(()=>{drawScene();drawMap();roomView?.requestRender();});
  };
}
