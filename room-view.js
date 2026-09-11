import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {geometry,dims,source,NX,NY} from './physics.js';

const $=id=>document.getElementById(id);
// Original brown coffee table (Table), in meters.
const tableCenter=new THREE.Vector3(.7905, .402, -.5975);
const radians=THREE.MathUtils.degToRad;

export class RoomView {
  constructor(){
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color('#edf2f3');
    this.camera=new THREE.PerspectiveCamera(48,1,.004,50);
    this.pov=new THREE.PerspectiveCamera(65,1,.002,50);
    this.renderer=this.makeRenderer($('scene'));
    this.povRenderer=this.makeRenderer($('roomPhoto'));
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.minDistance=.09;this.controls.maxDistance=12;
    this.controls.maxPolarAngle=Math.PI*.87;
    this.controls.addEventListener('change',()=>this.requestRender());
    this.scene.add(new THREE.HemisphereLight(0xf1f7ff,0xb4a795,2.3));
    this.scene.add(new THREE.AmbientLight(0xffffff,1.4));
    const light=new THREE.DirectionalLight(0xfff4dc,2.7);
    light.position.set(-.3,4.8,-4);light.target.position.copy(tableCenter);
    light.castShadow=true;light.shadow.mapSize.set(2048,2048);
    light.shadow.camera.left=-5;light.shadow.camera.right=5;
    light.shadow.camera.top=5;light.shadow.camera.bottom=-5;
    light.shadow.camera.near=.1;light.shadow.camera.far=15;
    light.shadow.normalBias=.008;this.scene.add(light,light.target);
    this.labels=[];
    this.assembly=new THREE.Group();this.scene.add(this.assembly);
    this.pathGroup=new THREE.Group();this.scene.add(this.pathGroup);this.pathGroup.visible=false;
    this.marker=new THREE.Group();this.scene.add(this.marker);
    const pin=new THREE.Mesh(new THREE.SphereGeometry(.020,24,20),new THREE.MeshStandardMaterial({color:0xef662e,roughness:.6}));
    this.marker.add(pin);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.033,.0017,8,48),new THREE.MeshBasicMaterial({color:0xb84817}));
    halo.rotation.x=Math.PI/2;this.marker.add(halo);
    this.sourceLabel=this.label('SOURCE','#b64b22');this.sourceLabel.position.y=0;this.marker.add(this.sourceLabel);
    this.origin=new THREE.Vector3();this.az=0;this.el=0;this.follow=true;
    this.heat=new THREE.DataTexture(new Uint8Array(NX*NY*4),NX,NY,THREE.RGBAFormat);
    this.heat.magFilter=THREE.LinearFilter;this.heat.minFilter=THREE.LinearFilter;
    this.heat.wrapS=THREE.RepeatWrapping;this.heat.needsUpdate=true;
    this.overlayScene=new THREE.Scene();
    this.overlayCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.overlayMaterial=new THREE.ShaderMaterial({
      transparent:true,depthTest:false,depthWrite:false,
      uniforms:{heat:{value:this.heat},rotation:{value:new THREE.Matrix3()},aspect:{value:1},tanHalf:{value:1},opacity:{value:.72},enabled:{value:0}},
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:`uniform sampler2D heat; uniform mat3 rotation; uniform float aspect,tanHalf,opacity,enabled; varying vec2 vUv;
      void main(){
        vec3 ray=normalize(rotation*vec3((2.0*vUv.x-1.0)*aspect*tanHalf,(2.0*vUv.y-1.0)*tanHalf,-1.0));
        float az=atan(ray.x,-ray.z);
        vec2 skyUV=vec2((az+3.14159265)/6.2831853,(1.0-ray.y)*.5);
        float t=texture2D(heat,skyUV).r;
        vec3 a=vec3(.12,.37,.69),b=vec3(.10,.68,.67),c=vec3(.98,.77,.22),d=vec3(.86,.20,.10);
        vec3 color=t<.333?mix(a,b,t*3.0):(t<.667?mix(b,c,(t-.333)*3.0):mix(c,d,(t-.667)*3.0));
        gl_FragColor=vec4(color,enabled*opacity*pow(t,.6));
      }`
    });
    this.overlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.overlayMaterial));
    this.bind();
    new ResizeObserver(()=>this.requestRender()).observe($('scene'));
    new ResizeObserver(()=>this.requestRender()).observe($('roomPhoto'));
    this.loadRoom();
  }
  makeRenderer(canvas){
    const r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
    r.setPixelRatio(Math.min(devicePixelRatio,2));r.shadowMap.enabled=true;
    r.shadowMap.type=THREE.PCFShadowMap;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1;
    return r;
  }
  async loadRoom(){
    try{
      const loader=new GLTFLoader();
      loader.setDRACOLoader(new DRACOLoader());
      const gltf=await loader.loadAsync('./assets/room.glb');
      gltf.scene.traverse(o=>{
        if(o.name==='plafond')o.visible=false;
        if(o.isMesh){o.receiveShadow=true;o.castShadow=true;}
      });
      // Light finishes make the tiny crystals legible against the room asset.
      for(const [name,color] of [['murs',0xe2e1d5]]){
        gltf.scene.getObjectByName(name)?.traverse(o=>{
          if(o.isMesh)o.material=new THREE.MeshStandardMaterial({color,roughness:.86});
        });
      }
      this.scene.add(gltf.scene);this.room=gltf.scene;
      $('roomLoad').hidden=true;this.requestRender();
    }catch(error){$('roomLoad').textContent='Room could not load: '+error.message;$('roomLoad').setAttribute('role','alert');}
  }
  label(text,color){
    const anchor=new THREE.Object3D(),element=document.createElement('span');
    element.className='scene-label';element.textContent=text;element.style.color=color;
    element.dataset.label=text;
    $('sceneLabels').append(element);
    anchor.userData.labelElement=element;
    this.labels.push(anchor);
    return anchor;
  }
  drawLabels(){
    const w=this.renderer.domElement.clientWidth,h=this.renderer.domElement.clientHeight;
    this.labels=this.labels.filter(anchor=>anchor.userData.labelElement.isConnected);
    const boxes=[],lines=$('sceneLabelLines');lines.replaceChildren();
    for(const anchor of this.labels){
      const element=anchor.userData.labelElement;
      const p=anchor.getWorldPosition(new THREE.Vector3()).project(this.camera);
      const visible=p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1;
      element.hidden=!visible;if(!visible)continue;
      const width=element.offsetWidth,height=element.offsetHeight;
      const anchorX=(p.x+1)*w/2,anchorY=(1-p.y)*h/2;
      let x=Math.max(width/2+4,Math.min(w-width/2-4,anchorX));
      let y=Math.max(height+4,Math.min(h-4,anchorY-(element.dataset.label==='SOURCE'?14:28)));
      // Keep nearby layer labels separate in a wide view.
      for(const box of boxes)if(Math.abs(x-box.x)<(width+box.width)/2+5&&Math.abs(y-box.y)<height+5){
        const right=box.x+(width+box.width)/2+8;
        if(right+width/2<w-4)x=right;else y=box.y-height-6;
      }
      y=Math.max(height+4,y);
      element.style.left=x+'px';element.style.top=y+'px';
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      for(const [key,value] of Object.entries({x1:anchorX,y1:anchorY,x2:x,y2:y,stroke:element.style.color,'stroke-width':1,'stroke-opacity':.65}))line.setAttribute(key,value);
      lines.append(line);
      boxes.push({x,y,width});
    }
  }
  box(size,position,color,parent=this.assembly){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,metalness:.15,roughness:.48}));
    mesh.position.copy(position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  setGeometry(p){
    this.params={...p};
    const key=JSON.stringify([p.sep,p.gapA,p.gapB,p.rotationA,p.rotationB]);
    if(key!==this.geometryKey){
      this.geometryKey=key;
      this.assembly.traverse(o=>{o.userData.labelElement?.remove();o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});
      this.assembly.clear();
      const oldOrigin=this.origin.clone();
      const standHeight=.10;
      this.origin.copy(tableCenter).add(new THREE.Vector3(0,standHeight+.014+Math.max(p.gapA,p.gapB)/200,0));
      const positions=geometry(p);
      for(let layer=0;layer<2;layer++){
        const childStart=this.assembly.children.length;
        const gap=layer?p.gapB:p.gapA,z=(layer?1:-1)*p.sep/200;
        const width=(2.8+gap)/100,low=-(1.4+gap/2)/100;
        const baseY=tableCenter.y+standHeight-this.origin.y-.002;
        // Extend each layer’s original block down to the tabletop, with no bridge.
        const supportDepth=Math.min(.046,p.sep/100-.006);
        this.box([width+.022,standHeight,supportDepth],new THREE.Vector3(0,tableCenter.y-this.origin.y+standHeight/2,z),0x657780);
        for(const side of [-1,1])this.box([.0028,-baseY+.018+gap/200,.0028],new THREE.Vector3(side*(width/2+.004),(baseY+.018+gap/200)/2,z+.015),0xa4b1b7);
        const label=this.label(layer?'LAYER B':'LAYER A',layer?'#744c9c':'#236fa0');
        label.position.set(0,0,z);this.assembly.add(label);
        for(let row=0;row<2;row++)this.box([width+.009,.002,.003],new THREE.Vector3(0,(row-.5)*(1.4+gap)/100-.007,z+.014),0x95a4ac);
        const yaw=radians(layer?p.rotationB??0:p.rotationA??0),pivot=new THREE.Vector3(0,0,z);
        for(const child of this.assembly.children.slice(childStart)){child.position.sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(pivot);child.rotation.y+=yaw;}
      }
      positions.forEach((d,i)=>{
        const mesh=this.box(dims.map(v=>v/100),new THREE.Vector3(...d.map(v=>v/100)),i<4?0x3589b7:0x966ec3);
        mesh.rotation.y=d.yaw??0;
        const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:i<4?0x16466d:0x583780}));mesh.add(edges);
      });
      this.assembly.position.copy(this.origin);
      if(!this.framed){this.focusRoom();this.framed=true;}
      else{const delta=this.origin.clone().sub(oldOrigin);this.camera.position.add(delta);this.controls.target.add(delta);this.controls.update();}
    }
    this.pov.position.copy(this.origin);
    this.marker.position.copy(this.origin).add(new THREE.Vector3(...source(p.az,p.el,p.radius).map(v=>v/100)));
    if(this.follow){this.az=p.az;this.el=p.el;}
    this.updatePov();this.requestRender();
  }
  focusTable(){
    const distance=Math.max(.7,(this.params?.sep??40)/100*1.65);
    this.controls.target.copy(this.origin);
    this.camera.position.copy(this.origin).add(new THREE.Vector3(-.55,.6,.85).normalize().multiplyScalar(distance));
    this.controls.update();this.requestRender();
  }
  focusRoom(){
    this.controls.target.copy(this.origin).add(new THREE.Vector3(0,.2,-.45));
    this.camera.position.set(-.72,1.95,1.2);this.controls.update();this.requestRender();
  }
  updatePov(){
    this.pov.lookAt(this.origin.clone().add(new THREE.Vector3(...source(this.az,this.el,1))));
    this.pov.updateMatrixWorld();
    $('povHeading').textContent=`Look ${Math.round(this.az)}° az · ${Math.round(this.el)}° el`;
    $('followPov').checked=this.follow;
  }
  setHeat(values,peak,isReconstruction){
    let max=0;if(values)for(const v of values)max=Math.max(max,v);
    const pixels=this.heat.image.data;
    for(let i=0;i<NX*NY;i++){pixels[4*i]=max?Math.round(values[i]/max*255):0;pixels[4*i+3]=255;}
    this.heat.needsUpdate=true;this.peak=isReconstruction&&max>0?peak:null;
    this.overlayMaterial.uniforms.enabled.value=max>0?1:0;this.requestRender();
  }
  setPaths(routes){
    if(routes===this.pathData)return;
    this.pathData=routes;
    this.pathGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.pathGroup.clear();
    if(!routes||!this.params){this.requestRender();return;}
    const selected=routes.filter(r=>r.weight>0).sort((a,b)=>b.weight-a.weight).slice(0,16);
    const max=selected[0]?.weight??1,min=selected.at(-1)?.weight??0,det=geometry(this.params);
    // Rescale the displayed probabilities so even a narrow range spans plasma.
    const plasma=['#0d0887','#5b02a3','#9a179b','#cb4679','#ed7953','#fdb42f','#f0f921'].map(c=>new THREE.Color(c));
    const pathColor=t=>{const x=Math.max(0,Math.min(1,t))*(plasma.length-1),i=Math.min(plasma.length-2,Math.floor(x));return plasma[i].clone().lerp(plasma[i+1],x-i);};
    const start=this.origin.clone().add(new THREE.Vector3(...source(this.params.az,this.params.el,this.params.radius).map(v=>v/100)));
    const segment=(a,b,radius,material,arrow=false)=>{
      const delta=b.clone().sub(a),length=delta.length();if(length<1e-6)return;
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,7),material);
      mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());this.pathGroup.add(mesh);
      if(arrow){const tip=new THREE.Mesh(new THREE.ConeGeometry(radius*3.5,.014,8),material.clone());tip.position.copy(a).addScaledVector(delta,.65);tip.quaternion.copy(mesh.quaternion);this.pathGroup.add(tip);}
    };
    for(const route of selected.reverse()){
      const relative=route.weight/max,color=pathColor(max>min?(route.weight-min)/(max-min):1);
      const material=new THREE.MeshBasicMaterial({color,toneMapped:false,transparent:true,opacity:.18+.65*Math.sqrt(relative),depthWrite:false});
      const a=this.origin.clone().add(new THREE.Vector3(...det[route.first].map(v=>v/100)));
      const b=this.origin.clone().add(new THREE.Vector3(...det[route.second].map(v=>v/100)));
      const radius=.00045+.0017*Math.sqrt(relative);
      segment(start,a,radius*.65,material);segment(a,b,radius,material.clone(),true);
    }
    this.requestRender();
  }
  resize(renderer,camera){
    const canvas=renderer.domElement,w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return false;
    const d=renderer.getPixelRatio();
    if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d))renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();return true;
  }
  requestRender(){
    if(this.pending)return;this.pending=true;
    requestAnimationFrame(()=>{this.pending=false;this.render();});
  }
  render(){
    if(this.resize(this.renderer,this.camera)){this.renderer.render(this.scene,this.camera);this.drawLabels();}
    if(!$('roomOverlay').hidden&&this.resize(this.povRenderer,this.pov)){
      const pathsVisible=this.pathGroup.visible;this.pathGroup.visible=false;
      this.assembly.visible=false;
      this.sourceLabel.visible=false;
      // The optical reference is at the camera midpoint; hide only its own mount.
      this.povRenderer.autoClear=true;this.povRenderer.render(this.scene,this.pov);
      this.assembly.visible=true;this.pathGroup.visible=pathsVisible;
      this.sourceLabel.visible=true;
      const u=this.overlayMaterial.uniforms;
      u.rotation.value.setFromMatrix4(this.pov.matrixWorld);u.aspect.value=this.pov.aspect;u.tanHalf.value=Math.tan(radians(this.pov.fov)/2);
      this.povRenderer.autoClear=false;this.povRenderer.render(this.overlayScene,this.overlayCamera);
      this.drawReticles();
    }
  }
  drawReticles(){
    const canvas=$('povReticles'),w=canvas.clientWidth,h=canvas.clientHeight,d=Math.min(devicePixelRatio,2);
    canvas.width=w*d;canvas.height=h*d;const c=canvas.getContext('2d');c.scale(d,d);
    const mark=(direction,kind)=>{
      const pos=this.origin.clone().add(new THREE.Vector3(...direction)).project(this.pov);
      if(pos.z< -1||pos.z>1||Math.abs(pos.x)>1||Math.abs(pos.y)>1)return false;
      const x=(pos.x+1)*w/2,y=(1-pos.y)*h/2;
      c.lineWidth=4;c.strokeStyle='white';
      const path=()=>{c.beginPath();if(kind==='truth'){c.moveTo(x-8,y);c.lineTo(x+8,y);c.moveTo(x,y-8);c.lineTo(x,y+8);}else c.arc(x,y,9,0,2*Math.PI);c.stroke();};
      path();c.lineWidth=1.5;c.strokeStyle=kind==='truth'?'#733211':'#145075';path();return true;
    };
    const inView=mark(source(this.params.az,this.params.el,1),'truth');
    if(this.peak!==null&&this.peak!==undefined){
      const j=this.peak,az=-180+(j%NX+.5)*360/NX,el=Math.asin(1-2*(Math.floor(j/NX)+.5)/NY)*180/Math.PI;
      mark(source(az,el,1),'peak');
    }
    $('povOutside').hidden=inView;
  }
  bind(){
    $('gammaPaths').onclick=()=>{this.pathGroup.visible=!this.pathGroup.visible;$('gammaPaths').setAttribute('aria-pressed',String(this.pathGroup.visible));$('pathLegend').hidden=!this.pathGroup.visible;this.requestRender();};
    $('tableView').onclick=()=>this.focusTable();$('roomView').onclick=()=>this.focusRoom();
    $('povFront').onclick=()=>{this.follow=false;this.az=0;this.el=0;this.updatePov();this.requestRender();};
    $('povBack').onclick=()=>{this.follow=false;this.az=180;this.el=0;this.updatePov();this.requestRender();};
    $('followPov').onchange=()=>{this.follow=$('followPov').checked;if(this.follow){this.az=this.params.az;this.el=this.params.el;}this.updatePov();this.requestRender();};
    $('overlayOpacity').oninput=()=>{this.overlayMaterial.uniforms.opacity.value=+$('overlayOpacity').value/100;$('opacityValue').textContent=$('overlayOpacity').value+'%';this.requestRender();};
    let drag;
    const c=$('roomPhoto');
    c.onpointerdown=e=>{if(e.button!==0)return;drag=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId);};
    c.onpointermove=e=>{
      if(e.pointerType==='mouse'&&!(e.buttons&1)){drag=null;return;}
      if(!drag)return;
      this.follow=false;this.az-= (e.clientX-drag[0])*.16;this.az=((this.az+540)%360)-180;
      this.el=Math.max(-85,Math.min(85,this.el+(e.clientY-drag[1])*.16));
      drag=[e.clientX,e.clientY];this.updatePov();this.requestRender();
    };
    c.onpointerup=c.onpointercancel=c.onlostpointercapture=()=>drag=null;
    c.onwheel=e=>{e.preventDefault();this.pov.fov=Math.max(30,Math.min(100,this.pov.fov+e.deltaY*.035));this.requestRender();};
  }
}
