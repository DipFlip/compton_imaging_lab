import {geometry,overlappingCrystals} from './physics.js';
import {simulateVolume} from './transport.js';
self.onmessage=({data:p})=>{
  const spacings=[4,8,12,20,30,40,60,80];
  for(let index=0;index<spacings.length;index++){
    const sep=spacings[index];
    if(overlappingCrystals(geometry({...p,sep}))){self.postMessage({index,total:spacings.length,point:{sep,invalid:true,eff:null,effSE:null,armRms:null,positionArmRms:null,armValidFraction:0}});continue;}
    const r=simulateVolume({...p,sep},{samples:1024});
    self.postMessage({index,total:spacings.length,point:{sep,eff:r.eff,effSE:r.effSE,armRms:r.armRms,
      positionArmRms:r.positionArmRms,armBias:r.armBias,armValidFraction:r.armValidFraction,
      reverseFraction:r.reverseFraction,photonsFor500:r.eff?500/r.eff:null}});
  }
};
