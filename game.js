/* ============================================================
   NOVA METRÓPOLE — jogo 3D de ação urbana no navegador
   Three.js puro, sem build step. Personagens originais.
   ============================================================ */

(() => {
'use strict';

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const lerp = (a,b,t) => a + (b-a)*t;
const rand = (a,b) => a + Math.random()*(b-a);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---------- Heróis ----------
// Personagens originais: o nome diz o poder, para a criança entender de cara.
// `ability` define como cada um se desloca — é o que muda o jogo na prática.
const HEROES = [
  { id:'teia', name:'TEIA', power:'Lança teias', ability:'web', emoji:'🕸️',
    desc:'Balança entre os prédios',
    c1:'#d92b3c', c2:'#1a2b6b', accent:'#ffffff', mask:'meia' },
  { id:'bruto', name:'BRUTO', power:'Força bruta', ability:'smash', emoji:'💪',
    desc:'Super-pulo com impacto no chão',
    c1:'#3ea34a', c2:'#255c2c', accent:'#9be89f', mask:'nenhuma' },
  { id:'escudo', name:'ESCUDO', power:'Escudo giratório', ability:'shield', emoji:'🛡️',
    desc:'Arremessa e o escudo volta',
    c1:'#2f6fd0', c2:'#17325e', accent:'#ffffff', mask:'capuz' },
  { id:'blindado', name:'BLINDADO', power:'Armadura voadora', ability:'fly', emoji:'🚀',
    desc:'Voa com propulsores',
    c1:'#d4a017', c2:'#8f2b20', accent:'#8ff0ff', mask:'visor' },
];
let selectedHero = HEROES[0];

// ---------- Perguntas de reciclagem ----------
const QUIZ = [
  { q:'Uma garrafa PET vazia deve ir em qual lixeira de coleta seletiva?', opts:['Vermelha (plástico)','Verde (vidro)','Marrom (orgânico)'], correct:0 },
  { q:'Papelão sujo de gordura (caixa de pizza) pode ser reciclado normalmente?', opts:['Sim, sempre','Não, contamina o papel','Só se for lavado com sabão'], correct:1 },
  { q:'Qual a cor da lixeira para latas de metal, como latinhas de refrigerante?', opts:['Amarela','Azul','Preta'], correct:0 },
  { q:'Pilhas e baterias usadas devem ser descartadas onde?', opts:['No lixo comum','Em pontos de coleta especial','Enterradas no jardim'], correct:1 },
  { q:'Vidro quebrado para reciclagem deve ser descartado como?', opts:['Solto no lixo comum','Embrulhado e sinalizado','Jogado na rua'], correct:1 },
  { q:'Qual desses materiais NÃO é reciclável?', opts:['Papel','Isopor sujo de comida','Alumínio'], correct:1 },
  { q:'Reduzir o uso de sacolas plásticas ajuda principalmente a evitar o quê?', opts:['Poluição de rios e oceanos','Aumento de chuva','Falta de sol'], correct:0 },
  { q:'Compostagem serve para transformar resíduos orgânicos em quê?', opts:['Combustível','Adubo natural','Plástico'], correct:1 },
];

// ---------- Estado global do jogo ----------
const state = {
  running:false,
  score:0,
  itemsCollected:0,
  totalItems:8,
  quizCorrect:0,
  webEnergy:1,
  pendingPickup:null,
  swinging:false,
  quizOpen:false,
};

// ============================================================
// THREE.JS SETUP
// ============================================================
const container = $('app');
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch?1.75:2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4e8);
scene.fog = new THREE.Fog(0xaecde6, 320, 1500);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth/window.innerHeight, 0.1, 2200);

function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w,h);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  checkOrientation();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// Em celular na vertical o jogo fica injogável: os controles ocupam a tela
// toda e sobra pouca cidade. Nesse caso mostramos o aviso e pausamos.
let portraitBlocked = false;
function checkOrientation(){
  const portrait = window.innerHeight > window.innerWidth;
  portraitBlocked = isTouch && portrait;
  const gate = $('rotate-gate');
  if(gate) gate.classList.toggle('show', portraitBlocked);
}

// Tenta travar em paisagem de verdade (funciona em tela cheia no Android;
// o iOS ignora, e aí o aviso acima cobre o caso).
async function lockLandscape(){
  try{
    if(document.documentElement.requestFullscreen && !document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }
    if(screen.orientation && screen.orientation.lock){
      await screen.orientation.lock('landscape');
    }
  }catch(e){
    // Sem permissão ou sem suporte: o aviso de girar resolve.
  }
}

// ---------- Luzes ----------
const hemi = new THREE.HemisphereLight(0xd6e8ff, 0x8a8fa3, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0cc, 1.15);
sun.position.set(60,90,40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left = -190; sun.shadow.camera.right = 190;
sun.shadow.camera.top = 190; sun.shadow.camera.bottom = -190;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.35);
fillLight.position.set(-50,40,-60);
scene.add(fillLight);

// ---------- Céu com gradiente (sky dome) ----------
let skyDome;
{
  const skyGeo = new THREE.SphereGeometry(2000, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms:{
      top:{value:new THREE.Color(0x3f7fc4)},
      bottom:{value:new THREE.Color(0xf6d9b0)},
    },
    vertexShader:`varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader:`
      varying vec3 vPos; uniform vec3 top; uniform vec3 bottom;
      void main(){
        float h = normalize(vPos).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottom, top, clamp(h*1.3,0.0,1.0)), 1.0);
      }`
  });
  skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  scene.add(skyDome);
}

// ============================================================
// MANHATTAN REAL — geometria vinda do OpenStreetMap (Midtown)
// Pegadas, alturas e nomes de prédios/ruas são dados reais.
// ============================================================
const cityGroup = new THREE.Group();
scene.add(cityGroup);
const buildings = [];     // {mesh,x,z,w,d,h,rot,name}
const collectibles = [];
const landmarks = [];     // prédios nomeados, usados como referência nas missões

const MAP = window.MANHATTAN_MAP;
const CITY_HALF = Math.max(MAP.halfX, MAP.halfZ);

// ---------- Asfalto base ----------
{
  const groundMat = new THREE.MeshStandardMaterial({ color:0x3a3d47, roughness:1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfX*2+120, MAP.halfZ*2+120), groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  cityGroup.add(ground);
}

// ---------- Ruas reais ----------
// Cada via vira uma faixa de quads seguindo a polilinha original do OSM.
{
  const roadMat = new THREE.MeshStandardMaterial({ color:0x2b2e38, roughness:0.95 });
  const positions = [];
  for(const road of MAP.roads){
    const hw = road.w/2;
    for(let i=0;i<road.pts.length-1;i++){
      const [x0,z0] = road.pts[i], [x1,z1] = road.pts[i+1];
      const dx = x1-x0, dz = z1-z0;
      const len = Math.hypot(dx,dz);
      if(len < 0.5) continue;
      const nx = -dz/len*hw, nz = dx/len*hw;
      positions.push(
        x0+nx,0.03,z0+nz,  x1+nx,0.03,z1+nz,  x1-nx,0.03,z1-nz,
        x0+nx,0.03,z0+nz,  x1-nx,0.03,z1-nz,  x0-nx,0.03,z0-nz
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.computeVertexNormals();
  const roadMesh = new THREE.Mesh(geo, roadMat);
  roadMesh.receiveShadow = true;
  cityGroup.add(roadMesh);
}

// ---------- Prédios ----------
// Fachadas variam de tom conforme a altura: torres de vidro em cima,
// prédios baixos de tijolo embaixo — aproxima o visual real de Midtown.
const facadeLow  = [0x6b6054, 0x7a6b5c, 0x5e564c, 0x806f5e];
const facadeMid  = [0x6a7186, 0x5d6478, 0x767d90];
const facadeHigh = [0x7b8ea6, 0x6d84a0, 0x8a9cb2];

function facadeColor(h){
  if(h > 90)  return facadeHigh[Math.floor(Math.random()*facadeHigh.length)];
  if(h > 35)  return facadeMid[Math.floor(Math.random()*facadeMid.length)];
  return facadeLow[Math.floor(Math.random()*facadeLow.length)];
}

// Um material por faixa de altura mantém o número de draw calls baixo.
const buildingMats = new Map();
function getBuildingMat(color){
  if(!buildingMats.has(color)){
    buildingMats.set(color, new THREE.MeshStandardMaterial({ color, roughness:0.82, metalness:0.08 }));
  }
  return buildingMats.get(color);
}

const boxGeo = new THREE.BoxGeometry(1,1,1);

for(const b of MAP.buildings){
  const mat = getBuildingMat(facadeColor(b.h));
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.position.set(b.x, b.h/2, b.z);
  mesh.scale.set(b.w, b.h, b.d);
  mesh.rotation.y = -b.r;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  cityGroup.add(mesh);

  const rec = { mesh, x:b.x, z:b.z, w:b.w, d:b.d, h:b.h, rot:b.r, name:b.n||null };
  buildings.push(rec);
  if(b.n && b.h > 60) landmarks.push(rec);
}
// Grid espacial: varrer 1443 prédios por frame inviabiliza o celular.
// Cada célula guarda só os prédios que a tocam, e cada consulta olha 9 células.
const GRID_CELL = 40;
const grid = new Map();
const gridKey = (cx,cz) => cx + ',' + cz;

for(const b of buildings){
  const reach = Math.max(b.w, b.d) * 0.5 + 2;
  const minX = Math.floor((b.x-reach)/GRID_CELL), maxX = Math.floor((b.x+reach)/GRID_CELL);
  const minZ = Math.floor((b.z-reach)/GRID_CELL), maxZ = Math.floor((b.z+reach)/GRID_CELL);
  for(let cx=minX; cx<=maxX; cx++){
    for(let cz=minZ; cz<=maxZ; cz++){
      const k = gridKey(cx,cz);
      let cell = grid.get(k);
      if(!cell) grid.set(k, cell = []);
      cell.push(b);
    }
  }
}

function nearbyBuildings(x, z){
  const cx = Math.floor(x/GRID_CELL), cz = Math.floor(z/GRID_CELL);
  const out = [];
  for(let ix=cx-1; ix<=cx+1; ix++){
    for(let iz=cz-1; iz<=cz+1; iz++){
      const cell = grid.get(gridKey(ix,iz));
      if(cell) out.push(...cell);
    }
  }
  return out;
}

// Os prédios do OSM são retângulos rotacionados, então o ponto é levado
// para o referencial do prédio antes do teste.
function insideFootprint(b, x, z, margin){
  const dx = x - b.x, dz = z - b.z;
  const cos = Math.cos(b.rot), sin = Math.sin(b.rot);
  const lx = dx*cos + dz*sin;
  const lz = -dx*sin + dz*cos;
  return Math.abs(lx) < b.w/2 + margin && Math.abs(lz) < b.d/2 + margin;
}

function groundHeightAt(x,z){
  let top = 0;
  for(const b of nearbyBuildings(x,z)){
    if(b.h > top && insideFootprint(b, x, z, 0)) top = b.h;
  }
  return top;
}


// ---------- Fachadas com janelas ----------
// Textura procedural repetida: uma grade de janelas sai muito mais barata que
// instanciar milhares de planos, e assim todo prédio ganha fachada.
function makeFacadeTexture(baseHex){
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  const base = new THREE.Color(baseHex);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0,0,64,64);

  // faixas horizontais marcam as lajes entre andares
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  for(let y=0; y<64; y+=16) ctx.fillRect(0, y+13, 64, 3);

  for(let r=0;r<4;r++){
    for(let c=0;c<4;c++){
      const lit = Math.random() < 0.5;
      ctx.fillStyle = lit ? 'rgba(255,226,163,0.95)' : 'rgba(45,58,82,0.85)';
      ctx.fillRect(c*16+3, r*16+3, 10, 10);
      if(lit){
        ctx.fillStyle = 'rgba(255,243,205,0.55)';
        ctx.fillRect(c*16+4, r*16+4, 8, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

{
  // Uma textura por cor de fachada; cada prédio só ajusta o repeat.
  const texByColor = new Map();
  const matCache = new Map();
  for(const b of buildings){
    const colorHex = b.mesh.material.color.getHex();
    if(!texByColor.has(colorHex)) texByColor.set(colorHex, makeFacadeTexture(colorHex));

    // Degraus fixos de repeat: sem isso cada prédio vira um material próprio
    // e o número de draw calls explode no celular.
    const step = v => v<=3?2 : v<=6?4 : v<=12?8 : v<=24?16 : v<=48?32 : 64;
    const rx = step(Math.round(b.w/4.5));
    const ry = step(Math.round(b.h/4.5));
    const key = colorHex + ':' + rx + ':' + ry;
    let mat = matCache.get(key);
    if(!mat){
      const tex = texByColor.get(colorHex).clone();
      tex.needsUpdate = true;
      tex.repeat.set(rx, ry);
      mat = b.mesh.material.clone();
      mat.map = tex;
      matCache.set(key, mat);
    }
    b.mesh.material = mat;
  }
}

// ---------- Mesclagem por material ----------
// 1443 meshes individuais = 1443 draw calls, o que derruba o celular.
// Os prédios são estáticos, então cada material vira um único mesh mesclado.
// Os meshes originais ficam fora da cena, mas seguem servindo de alvo para
// os raycasts da teia e da câmera (por isso não são descartados).
{
  const byMaterial = new Map();
  for(const b of buildings){
    const mat = b.mesh.material;
    let group = byMaterial.get(mat);
    if(!group) byMaterial.set(mat, group = []);
    group.push(b);
  }

  for(const [mat, group] of byMaterial){
    const positions = [];
    const normals = [];
    const uvs = [];
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();

    for(const b of group){
      b.mesh.updateMatrixWorld(true);
      const geo = b.mesh.geometry.clone();
      geo.applyMatrix4(b.mesh.matrixWorld);
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const uv = geo.attributes.uv;
      const index = geo.index;
      const count = index ? index.count : pos.count;
      for(let i=0;i<count;i++){
        const vi = index ? index.getX(i) : i;
        v.fromBufferAttribute(pos, vi);
        positions.push(v.x, v.y, v.z);
        n.fromBufferAttribute(nor, vi);
        normals.push(n.x, n.y, n.z);
        uvs.push(uv.getX(vi), uv.getY(vi));
      }
      geo.dispose();
      cityGroup.remove(b.mesh);
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cityGroup.add(mesh);
  }
}

// ---------- Placas de rua ----------
// Nas esquinas das avenidas principais, para o jogador se localizar de verdade.
function makeStreetSign(text, x, z){
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0f6b3f'; ctx.fillRect(0,0,256,64);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.strokeRect(4,4,248,56);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase().slice(0,18), 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.MeshBasicMaterial({ map:tex, side:THREE.DoubleSide, transparent:true });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9,2.25), mat);
  sign.position.set(x, 7, z);
  cityGroup.add(sign);

  const poleMat = new THREE.MeshStandardMaterial({ color:0x2a2a2a });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,7,6), poleMat);
  pole.position.set(x, 3.5, z);
  cityGroup.add(pole);
  return sign;
}

const streetSigns = [];
{
  const placed = new Set();
  for(const road of MAP.roads){
    if(!road.n || placed.has(road.n)) continue;
    if(road.pts.length < 2) continue;
    const mid = road.pts[Math.floor(road.pts.length/2)];
    if(Math.abs(mid[0]) > MAP.halfX-20 || Math.abs(mid[1]) > MAP.halfZ-20) continue;
    placed.add(road.n);
    streetSigns.push(makeStreetSign(road.n, mid[0], mid[1]));
    if(placed.size >= 40) break;
  }
}

// ============================================================
// COLETÁVEIS DE RECICLAGEM
// ============================================================
const collectMat = new THREE.MeshStandardMaterial({ color:0x3ddc84, emissive:0x3ddc84, emissiveIntensity:0.8, roughness:0.3 });
function spawnCollectibles(n){
  for(const c of collectibles) scene.remove(c.mesh);
  collectibles.length = 0;
  const spots = buildings.filter(b=>b.h>25 && b.h<160);
  for(let i=0;i<n;i++){
    let x,z,y;
    if(spots.length && Math.random()<0.65){
      const b = spots[Math.floor(Math.random()*spots.length)];
      x = b.x + rand(-2,2); z = b.z + rand(-2,2); y = b.h + 2.5;
    } else {
      x = rand(-MAP.halfX+40, MAP.halfX-40);
      z = rand(-MAP.halfZ+40, MAP.halfZ-40);
      y = rand(10,26);
    }
    const geo = Math.random()<0.5 ? new THREE.IcosahedronGeometry(1.1,0) : new THREE.OctahedronGeometry(1.2,0);
    const mesh = new THREE.Mesh(geo, collectMat);
    mesh.position.set(x,y,z);
    scene.add(mesh);
    mesh.add(new THREE.PointLight(0x3ddc84, 1.4, 14));
    collectibles.push({ mesh, collected:false, baseY:y, phase:Math.random()*Math.PI*2 });
  }
}
spawnCollectibles(state.totalItems);

// ============================================================
// CIDADE VIVA — carros nas avenidas e pessoas nas calçadas
// ============================================================
// Tudo desenhado por instancing: são centenas de objetos móveis e um mesh
// por tipo mantém o custo baixo o suficiente para celular.

const traffic = { cars: [], mesh: null, dummy: new THREE.Object3D() };
const crowd   = { people: [], mesh: null, dummy: new THREE.Object3D() };

// Só avenidas largas recebem trânsito; vielas ficariam entupidas.
function drivableRoads(){
  return MAP.roads.filter(r => r.w >= 16 && r.pts.length >= 2);
}

function buildTraffic(quantidade){
  const vias = drivableRoads();
  if(!vias.length) return;

  const carGeo = new THREE.BoxGeometry(2, 1.5, 4.4);
  const carMat = new THREE.MeshStandardMaterial({ roughness:0.45, metalness:0.35 });
  traffic.mesh = new THREE.InstancedMesh(carGeo, carMat, quantidade);
  traffic.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(quantidade*3), 3);
  traffic.mesh.castShadow = true;
  scene.add(traffic.mesh);

  // Amarelo de táxi predomina, como em Nova York.
  const cores = [0xf5c518, 0xf5c518, 0xf5c518, 0xd94f4f, 0x4f6fd9, 0xe8e8e8, 0x3a3a3a];

  // Distribui só ao redor do ponto inicial: espalhar por Midtown inteira
  // deixaria 4 carros por quarteirão e a cidade pareceria vazia.
  const perto = vias.filter(r => r.pts.some(pt =>
    Math.hypot(pt[0]-SPAWN.x, pt[1]-SPAWN.z) < 320));
  const pool = perto.length >= 4 ? perto : vias;

  for(let i=0;i<quantidade;i++){
    const via = pool[Math.floor(Math.random()*pool.length)];
    const seg = Math.floor(Math.random()*(via.pts.length-1));
    traffic.cars.push({
      via, seg,
      t: Math.random(),
      vel: rand(7, 14),
      lado: Math.random() < 0.5 ? -1 : 1,
      cor: new THREE.Color(cores[Math.floor(Math.random()*cores.length)]),
    });
  }
}

function updateTraffic(dt){
  if(!traffic.mesh) return;
  const { dummy } = traffic;

  for(let i=0;i<traffic.cars.length;i++){
    const c = traffic.cars[i];
    const a = c.via.pts[c.seg], b = c.via.pts[c.seg+1];
    const dx = b[0]-a[0], dz = b[1]-a[1];
    const comp = Math.hypot(dx,dz) || 1;

    c.t += (c.vel*dt)/comp;
    while(c.t >= 1){
      c.t -= 1;
      c.seg = (c.seg + 1) % (c.via.pts.length - 1);
    }

    const px = a[0] + dx*c.t, pz = a[1] + dz*c.t;
    // desloca para a faixa da direita do sentido em que anda
    const nx = -dz/comp, nz = dx/comp;
    const off = c.via.w*0.22*c.lado;

    dummy.position.set(px + nx*off, 0.75, pz + nz*off);
    dummy.rotation.set(0, Math.atan2(dx, dz) + (c.lado<0?Math.PI:0), 0);
    dummy.updateMatrix();
    traffic.mesh.setMatrixAt(i, dummy.matrix);
    traffic.mesh.setColorAt(i, c.cor);
  }
  traffic.mesh.instanceMatrix.needsUpdate = true;
  if(traffic.mesh.instanceColor) traffic.mesh.instanceColor.needsUpdate = true;
}

// ----- Pedestres -----
// Cápsulas simples: são pequenos na tela e carregar um modelo animado para
// cada um custaria caro demais.
function buildCrowd(quantidade){
  const vias = MAP.roads.filter(r => r.pts.length >= 2);
  if(!vias.length) return;

  const geo = new THREE.CapsuleGeometry(0.28, 0.85, 3, 6);
  const mat = new THREE.MeshStandardMaterial({ roughness:0.85 });
  crowd.mesh = new THREE.InstancedMesh(geo, mat, quantidade);
  crowd.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(quantidade*3), 3);
  crowd.mesh.castShadow = true;
  scene.add(crowd.mesh);

  const cores = [0x3f4a6b, 0x7a4b3a, 0x2f6b4f, 0x6b3a5c, 0x4a4a4a, 0x8a6f3a];

  const perto = vias.filter(r => r.pts.some(pt =>
    Math.hypot(pt[0]-SPAWN.x, pt[1]-SPAWN.z) < 320));
  const pool = perto.length >= 4 ? perto : vias;

  for(let i=0;i<quantidade;i++){
    const via = pool[Math.floor(Math.random()*pool.length)];
    const seg = Math.floor(Math.random()*(via.pts.length-1));
    crowd.people.push({
      via, seg,
      t: Math.random(),
      vel: rand(1.1, 1.9),
      lado: Math.random() < 0.5 ? -1 : 1,
      fase: Math.random()*Math.PI*2,
      cor: new THREE.Color(cores[Math.floor(Math.random()*cores.length)]),
    });
  }
}

function updateCrowd(dt){
  if(!crowd.mesh) return;
  const { dummy } = crowd;

  for(let i=0;i<crowd.people.length;i++){
    const p = crowd.people[i];
    const a = p.via.pts[p.seg], b = p.via.pts[p.seg+1];
    const dx = b[0]-a[0], dz = b[1]-a[1];
    const comp = Math.hypot(dx,dz) || 1;

    p.t += (p.vel*dt)/comp;
    while(p.t >= 1){
      p.t -= 1;
      p.seg = (p.seg + 1) % (p.via.pts.length - 1);
    }

    const px = a[0] + dx*p.t, pz = a[1] + dz*p.t;
    const nx = -dz/comp, nz = dx/comp;
    const off = (p.via.w*0.5 + 1.8) * p.lado;   // na calçada, fora do asfalto

    // leve sobe-e-desce para sugerir passada
    const bob = Math.sin(clock.elapsedTime*7 + p.fase)*0.06;
    dummy.position.set(px + nx*off, 0.92 + bob, pz + nz*off);
    dummy.rotation.set(0, Math.atan2(dx, dz) + (p.lado<0?Math.PI:0), 0);
    dummy.updateMatrix();
    crowd.mesh.setMatrixAt(i, dummy.matrix);
    crowd.mesh.setColorAt(i, p.cor);
  }
  crowd.mesh.instanceMatrix.needsUpdate = true;
  if(crowd.mesh.instanceColor) crowd.mesh.instanceColor.needsUpdate = true;
}


// ============================================================
// PERSONAGEM DO JOGADOR — modelos reais (Mixamo) com animação
// ============================================================
const player = new THREE.Group();
scene.add(player);

const gltfLoader = new THREE.GLTFLoader();
{
  // Os modelos foram comprimidos com Draco, então o decodificador é obrigatório.
  const draco = new THREE.DRACOLoader();
  draco.setDecoderPath('vendor/draco/');
  gltfLoader.setDRACOLoader(draco);
}

// Os 4 personagens compartilham o mesmo esqueleto do Mixamo, então as quatro
// animações são carregadas uma vez e reaproveitadas por todos.
const ANIM_FILES = { idle:'idle', run:'running', jump:'jumping', fall:'falling' };
const animClips = {};
const heroModels = {};     // cache: um herói já carregado não recarrega

let mixer = null;
let actions = {};
let currentAction = null;
let modelRoot = null;

function loadGLTF(url){
  return new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));
}

async function preloadAnimations(){
  await Promise.all(Object.entries(ANIM_FILES).map(async ([chave, arquivo]) => {
    const g = await loadGLTF(`assets/anims/${arquivo}.glb`);
    if(g.animations && g.animations[0]) animClips[chave] = g.animations[0];
  }));
}

// O tom do herói é aplicado por cima da textura original: preserva as sombras
// e o desenho do traje, só desloca a cor.
function tintMaterial(mat, hex){
  const m = mat.clone();
  // A textura de cor precisa ser declarada sRGB, senão o personagem fica escuro.
  if(m.map) m.map.encoding = THREE.sRGBEncoding;
  // Tom do herói misturado com branco: preserva o desenho da textura em vez
  // de chapar tudo numa cor só.
  m.color = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.2);
  m.roughness = Math.min(1, (m.roughness ?? 0.75));
  m.metalness = Math.min(0.35, m.metalness ?? 0.1);
  return m;
}

async function buildPlayerModel(hero){
  player.clear();
  mixer = null; actions = {}; currentAction = null; modelRoot = null;

  let gltf = heroModels[hero.id];
  if(!gltf){
    gltf = await loadGLTF(`assets/models/${hero.id}.glb`);
    heroModels[hero.id] = gltf;
  }

  // Cada seleção recebe uma cópia própria: dois heróis podem usar o mesmo
  // arquivo e não podem compartilhar o mesmo esqueleto animado.
  const root = THREE.SkeletonUtils.clone(gltf.scene);
  modelRoot = root;

  root.traverse(o => {
    if(o.isMesh){
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;   // o bounding box do skinning engana o culling
      o.material = Array.isArray(o.material)
        ? o.material.map(m => tintMaterial(m, hero.c1))
        : tintMaterial(o.material, hero.c1);
    }
  });

  // A escala vem medida do próprio modelo: o conversor às vezes entrega em
  // metros, às vezes em centímetros, e fixar um fator quebra num dos casos.
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const alturaNatural = bounds.max.y - bounds.min.y;
  const ALTURA_HEROI = 1.85;
  root.scale.setScalar(alturaNatural > 0.01 ? ALTURA_HEROI / alturaNatural : 1);

  // Os modelos do Mixamo já olham para -Z, que é a frente usada por
  // player.rotation.y — girar aqui faria o herói andar de costas.
  player.add(root);

  mixer = new THREE.AnimationMixer(root);
  for(const [chave, clip] of Object.entries(animClips)){
    const adaptado = adaptClipToSkeleton(clip, root);
    if(!adaptado) continue;
    const act = mixer.clipAction(adaptado);
    act.enabled = true;
    if(chave === 'jump'){ act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; }
    actions[chave] = act;
  }
  playAction('idle', 0);
}

// Cada personagem do Mixamo vem com um esqueleto de tamanho diferente (37 a
// 112 ossos), mas os nomes dos ossos são os mesmos. O clipe é então filtrado
// para conter só as faixas cujo osso existe neste modelo — sem isso o
// skinning quebra e o personagem some da tela.
function adaptClipToSkeleton(clip, root){
  const nomes = new Set();
  root.traverse(o => { if(o.isBone || o.type === 'Bone') nomes.add(o.name); });

  const tracks = clip.tracks.filter(t => nomes.has(t.name.split('.')[0]));
  if(!tracks.length) return null;
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// Transição cruzada entre animações: sem isso a troca "pula" de pose.
function playAction(nome, fade = 0.22){
  const next = actions[nome];
  if(!next || next === currentAction) return;
  next.reset();
  next.setEffectiveWeight(1);
  next.play();
  if(currentAction) currentAction.crossFadeTo(next, fade, false);
  currentAction = next;
}

function updateAnimationState(dt){
  if(!mixer) return;
  const speed = Math.hypot(P.vel.x, P.vel.z);

  if(climbing){
    // Sem clipe de escalada no acervo: reaproveita a corrida devagar, que
    // já mexe braços e pernas, em vez do "fall" parado que parece elevador.
    playAction('run');
    if(actions.run) actions.run.timeScale = 0.7;
  } else if(swing.active || ability.flying || !P.onGround){
    playAction(P.vel.y > 3 ? 'jump' : 'fall');
  } else if(speed > 0.8){
    playAction('run');
    // a animação acompanha a velocidade real, senão a corrida "patina"
    if(actions.run) actions.run.timeScale = clamp(speed / 9, 0.65, 1.9);
  } else {
    playAction('idle');
  }
  mixer.update(dt);

  // Não há um clipe de "balançar na teia" — o Mixamo não oferece um pronto
  // para todos os personagens. O gingado é simulado por cima da animação de
  // queda: inclina o corpo para o lado do arco do pêndulo, como um bonequinho
  // real balançaria numa corda.
  if(swing.active && modelRoot){
    const toAnchor = tmpVec2.copy(swing.anchor).sub(P.pos).normalize();
    const lado = toAnchor.x*Math.cos(player.rotation.y) - toAnchor.z*Math.sin(player.rotation.y);
    const alvo = clamp(-lado*0.55, -0.5, 0.5) + Math.sin(clock.elapsedTime*3.2)*0.06;
    modelRoot.rotation.z = lerp(modelRoot.rotation.z, alvo, 0.15);
    modelRoot.rotation.x = lerp(modelRoot.rotation.x, 0.25, 0.15);
  } else if(modelRoot){
    modelRoot.rotation.z = lerp(modelRoot.rotation.z, 0, 0.15);
    modelRoot.rotation.x = lerp(modelRoot.rotation.x, 0, 0.15);
  }
}

// Física simplificada do jogador
// Spawn no meio de uma rua real: sem isso o jogador nasce dentro de um prédio.
function findStreetSpawn(){
  // Um ponto da via não basta: precisa de folga em volta, senão o jogador
  // nasce encostado na fachada e a câmera fica presa dentro do prédio.
  const clearAround = (x,z,r) => {
    for(let a=0; a<8; a++){
      const ang = a*Math.PI/4;
      if(groundHeightAt(x + Math.cos(ang)*r, z + Math.sin(ang)*r) > 0) return false;
    }
    return groundHeightAt(x,z) === 0;
  };
  for(const road of MAP.roads){
    if(!road.n || !/Avenue|Broadway/i.test(road.n)) continue;
    for(const [x,z] of road.pts){
      if(Math.abs(x) > MAP.halfX-80 || Math.abs(z) > MAP.halfZ-80) continue;
      if(clearAround(x,z,7)) return new THREE.Vector3(x, 2, z);
    }
  }
  return new THREE.Vector3(0, 60, 0);
}
const SPAWN = findStreetSpawn();

// Depende de SPAWN: a cidade viva se concentra ao redor do ponto inicial.
buildTraffic(140);
buildCrowd(180);

const P = {
  pos: SPAWN.clone(),
  vel: new THREE.Vector3(0,0,0),
  yaw: 0,
  onGround:false,
  radius:0.5,
};
const GRAVITY = -26;
const WALK_SPEED = 9;
const AIR_CONTROL = 0.55;

// Câmera orbital em terceira pessoa (segue e permite olhar com mouse/touch)
const camState = { yaw:0, pitch:0.28, dist:9 };

// ============================================================
// TEIA — corda com física de pêndulo simplificada
// ============================================================
const webLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.85, linewidth:2 })
);
webLine.visible = false;
webLine.releasing = false;
webLine.releaseT = 0;
webLine.releaseFrom = new THREE.Vector3();
webLine.releaseAnchor = new THREE.Vector3();
scene.add(webLine);

const webShot = new THREE.Mesh(new THREE.SphereGeometry(0.18,8,8), new THREE.MeshBasicMaterial({ color:0xffffff }));
webShot.visible = false;
scene.add(webShot);

// ----- Seta guia -----
// Uma seta flutuante sempre aponta para o próximo item, para a criança
// nunca ficar perdida na cidade.
const guideArrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.4, 1.1, 5),
  new THREE.MeshBasicMaterial({ color:0xffd23f, transparent:true, opacity:0.85 })
);
guideArrow.visible = false;
scene.add(guideArrow);

function updateGuideArrow(){
  const alvo = collectibles.find(c => !c.collected);
  if(!alvo){ guideArrow.visible = false; return; }

  const dir = tmpVec.copy(alvo.mesh.position).sub(P.pos);
  const dist = dir.length();
  guideArrow.visible = dist > 6;
  if(!guideArrow.visible) return;

  dir.normalize();
  // Flutua à frente do herói, na altura do peito, apontando para o item.
  guideArrow.position.copy(P.pos).addScaledVector(dir, 3.2).setY(P.pos.y + 2.4);
  guideArrow.position.y += Math.sin(clock.elapsedTime*3)*0.18;
  guideArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
}

const swing = {
  active:false,
  anchor:new THREE.Vector3(),
  length:0,
  shooting:false,
  shootT:0,
  shootFrom:new THREE.Vector3(),
  shootTo:new THREE.Vector3(),
};

// Coleta os meshes ao longo de um raio, amostrando o grid — evita jogar
// os 1443 prédios no raycaster a cada lançamento de teia.
function meshesAlongRay(origin, dir, maxDist){
  const seen = new Set();
  const out = [];
  for(let t=0; t<=maxDist; t+=GRID_CELL*0.75){
    const px = origin.x + dir.x*t, pz = origin.z + dir.z*t;
    for(const b of nearbyBuildings(px, pz)){
      if(seen.has(b)) continue;
      seen.add(b);
      out.push(b.mesh);
    }
  }
  return out;
}

function raycastForAnchor(){
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  const raycaster = new THREE.Raycaster(origin, dir, 0, 90);
  const hits = raycaster.intersectObjects(meshesAlongRay(origin, dir, 90), false);
  if(hits.length){
    return hits[0].point.clone();
  }
  // Fallback quando não há prédio na mira: um ponto alto à frente, para o
  // balanço funcionar mesmo numa avenida larga.
  return origin.clone()
    .add(dir.clone().setY(0).normalize().multiplyScalar(30))
    .setY(Math.max(origin.y + 32, 42));
}

// Mira automática: a criança de 3 a 6 anos não consegue apontar a câmera e
// lançar a teia no lugar certo. O jogo escolhe o melhor prédio sozinho.
function findAutoAnchor(){
  const frente = new THREE.Vector3(-Math.sin(camState.yaw), 0, -Math.cos(camState.yaw));
  let melhor = null, melhorNota = -Infinity;

  for(const b of nearbyBuildings(P.pos.x, P.pos.z)){
    const topo = b.h;
    if(topo < P.pos.y + 4) continue;              // precisa estar acima do herói

    const dx = b.x - P.pos.x, dz = b.z - P.pos.z;
    const dist = Math.hypot(dx, dz);
    if(dist < 6 || dist > 70) continue;

    // Prefere o que está à frente do olhar, nem perto nem longe demais.
    const alinhamento = (dx*frente.x + dz*frente.z) / (dist || 1);
    if(alinhamento < -0.2) continue;
    const nota = alinhamento*2.2 - Math.abs(dist - 28)/28 + Math.min(topo, 90)/90;

    if(nota > melhorNota){ melhorNota = nota; melhor = { b, dist }; }
  }

  if(melhor){
    const { b } = melhor;
    // Um pouco acima do topo dá um arco de balanço mais generoso.
    return new THREE.Vector3(b.x, Math.min(b.h + 6, P.pos.y + 46), b.z);
  }
  // Sem prédio por perto: um ponto alto à frente, para o balanço funcionar
  // mesmo no meio de uma avenida larga.
  return new THREE.Vector3(
    P.pos.x + frente.x*26, Math.max(P.pos.y + 30, 40), P.pos.z + frente.z*26
  );
}

function startSwing(){
  if(state.webEnergy<=0.05) return;
  const anchor = findAutoAnchor();
  // Impulso inicial: sem ele a colisão com o chão encerra o balanço no mesmo
  // frame e nunca dá para sair da rua.
  if(P.onGround){
    P.vel.y = Math.max(P.vel.y, 9);
    P.pos.y += 0.4;
    P.onGround = false;
  }
  swing.active = true;
  swing.anchor.copy(anchor);
  // Corda mais curta que a distância atual: é a folga que puxa o herói para
  // frente e para cima, em vez de deixá-lo pendurado parado.
  swing.length = Math.max(8, P.pos.distanceTo(anchor) * 0.82);
  swing.shooting = true; swing.shootT = 0;
  swing.shootFrom.copy(player.position).setY(player.position.y+1.1);
  swing.shootTo.copy(anchor);
  webLine.visible = true;
  state.swinging = true;
}
function endSwing(boost){
  if(!swing.active) return;
  swing.active = false;
  // A teia não some de repente: solta do prédio e recolhe visualmente,
  // como no gesto real de largar uma corda.
  webLine.releasing = true;
  webLine.releaseT = 0;
  webLine.releaseFrom.copy(player.position).setY(player.position.y+1.1);
  webLine.releaseAnchor.copy(swing.anchor);
  state.swinging = false;
  if(boost){
    P.vel.y += 6;
    // frente da câmera é -(sin,cos): a câmera fica atrás do jogador
    const fwd = new THREE.Vector3(-Math.sin(camState.yaw),0,-Math.cos(camState.yaw));
    P.vel.addScaledVector(fwd, 4);
  }
}

// ============================================================
// PODERES — um por herói
// ============================================================
const ability = {
  cooldown: 0,
  flying: false,
  smashCharging: false,
};

// ----- BLINDADO: voo com propulsores -----
const thrusterLight = new THREE.PointLight(0x66ccff, 0, 12);
scene.add(thrusterLight);

// ----- ESCUDO: disco que vai e volta -----
const shieldDisc = new THREE.Mesh(
  new THREE.CylinderGeometry(0.55,0.55,0.1,20),
  new THREE.MeshStandardMaterial({ color:0x2f6fd0, metalness:0.7, roughness:0.25 })
);
shieldDisc.rotation.x = Math.PI/2;
shieldDisc.visible = false;
scene.add(shieldDisc);
const shieldState = { active:false, t:0, from:new THREE.Vector3(), to:new THREE.Vector3(), returning:false };

function throwShield(){
  if(shieldState.active || ability.cooldown > 0) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  shieldState.active = true;
  shieldState.returning = false;
  shieldState.t = 0;
  shieldState.from.copy(P.pos).setY(P.pos.y + 1.2);
  shieldState.to.copy(shieldState.from).addScaledVector(dir, 34);
  shieldDisc.visible = true;
  ability.cooldown = 1.1;
  toast('Escudo lançado!');
}

function updateShield(dt){
  if(!shieldState.active) return;
  const chest = tmpVec2.copy(P.pos).setY(P.pos.y + 1.2);
  const SPEED = 46;             // m/s, constante na ida e na volta

  if(!shieldState.returning){
    shieldState.t += dt * SPEED;
    const total = shieldState.from.distanceTo(shieldState.to);
    shieldDisc.position.lerpVectors(shieldState.from, shieldState.to, Math.min(shieldState.t/total, 1));
    if(shieldState.t >= total){ shieldState.returning = true; shieldState.t = 0; }
  } else {
    // na volta ele persegue o jogador, que pode ter se movido
    const toPlayer = chest.clone().sub(shieldDisc.position);
    const dist = toPlayer.length();
    if(dist < 1.4){
      shieldState.active = false;
      shieldDisc.visible = false;
    } else {
      shieldDisc.position.addScaledVector(toPlayer.normalize(), Math.min(dt*SPEED, dist));
    }
  }
  shieldDisc.rotation.z += dt * 22;

  // recolhe itens no caminho — é o que torna o poder útil na missão
  for(const c of collectibles){
    if(!c.collected && c.mesh.position.distanceTo(shieldDisc.position) < 3){
      collectItem(c);
    }
  }
}

// ----- BRUTO: super-pulo com impacto -----
const shockRing = new THREE.Mesh(
  new THREE.RingGeometry(0.6, 1.1, 28),
  new THREE.MeshBasicMaterial({ color:0x9be89f, transparent:true, opacity:0.9, side:THREE.DoubleSide })
);
shockRing.rotation.x = -Math.PI/2;
shockRing.visible = false;
scene.add(shockRing);
const shock = { active:false, t:0 };

function smashJump(){
  if(ability.cooldown > 0) return;
  if(P.onGround){
    P.vel.y = 20;                        // pulo bem mais alto que o normal
    ability.smashCharging = true;
    ability.cooldown = 0.35;
    toast('Super-pulo!');
  } else if(ability.smashCharging){
    P.vel.y = -42;                       // mergulho para o impacto
    ability.cooldown = 0.3;
  }
}

function doSmashLanding(){
  ability.smashCharging = false;
  shock.active = true; shock.t = 0;
  shockRing.position.set(P.pos.x, P.pos.y + 0.1, P.pos.z);
  shockRing.visible = true;
  // a onda de choque recolhe os itens próximos do chão
  for(const c of collectibles){
    if(!c.collected && c.mesh.position.distanceTo(P.pos) < 16) collectItem(c);
  }
}

function updateShock(dt){
  if(!shock.active) return;
  shock.t += dt * 1.8;
  const s = 1 + shock.t * 14;
  shockRing.scale.set(s, s, 1);
  shockRing.material.opacity = Math.max(0, 0.9 - shock.t);
  if(shock.t >= 1){ shock.active = false; shockRing.visible = false; }
}

// ----- Despacho por herói -----
function abilityStart(){
  switch(selectedHero.ability){
    case 'web':    startSwing(); break;
    case 'smash':  smashJump(); break;
    case 'shield': throwShield(); break;
    case 'fly':    ability.flying = true; break;
  }
}
function abilityEnd(){
  switch(selectedHero.ability){
    case 'web': endSwing(true); break;
    case 'fly': ability.flying = false; break;
  }
}

function updateAbility(dt){
  if(ability.cooldown > 0) ability.cooldown -= dt;
  updateShield(dt);
  updateShock(dt);

  if(selectedHero.ability === 'fly'){
    if(ability.flying && state.webEnergy > 0){
      // Empuxo na direção do olhar. A sustentação precisa superar a gravidade
      // (GRAVITY = -26), senão o herói "voa" descendo.
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      // O empuxo horizontal segue o olhar, mas a subida é fixa: sem isso,
      // olhar levemente para baixo já joga o herói contra o chão.
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      P.vel.addScaledVector(flat, dt * 34);
      P.vel.y += dt * (52 + dir.y * 22);
      P.vel.y = Math.min(P.vel.y, 26);
      P.vel.multiplyScalar(0.985);
      P.onGround = false;
      state.webEnergy = Math.max(0, state.webEnergy - dt*0.3);
      thrusterLight.position.set(P.pos.x, P.pos.y - 0.3, P.pos.z);
      thrusterLight.intensity = 2.2;
    } else {
      thrusterLight.intensity = lerp(thrusterLight.intensity, 0, 0.15);
    }
  }
}

// ============================================================
// INPUT
// ============================================================
const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='Space'){ tryJump(); e.preventDefault(); }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

let jumpBuffer=0;
let dashing=false;
let climbing=false;
let climbT=0;
let ultimoToqueCamera = 0;
function tryJump(){
  if(P.onGround){ P.vel.y = 10.5; P.onGround=false; }
  else if(!swing.active){ jumpBuffer = 0.15; }
}

// mouse look (desktop, pointer lock opcional — usamos drag simples para evitar fricção)
let dragging=false, lastX=0, lastY=0;
const canvasEl = () => renderer.domElement;

canvasEl().addEventListener('mousedown', e=>{
  dragging=true; lastX=e.clientX; lastY=e.clientY;
  if(e.button===0) abilityStart();
});
window.addEventListener('mouseup', ()=>{ dragging=false; abilityEnd(); });
window.addEventListener('mousemove', e=>{
  if(!dragging) return;
  const dx=e.clientX-lastX, dy=e.clientY-lastY;
  lastX=e.clientX; lastY=e.clientY;
  camState.yaw -= dx*0.0045;
  camState.pitch = clamp(camState.pitch - dy*0.003, -0.35, 0.9);
  ultimoToqueCamera = performance.now();
});

// touch: stick de movimento
const stickZone = $('stickZone'), stickKnob = $('stickKnob');
let stick = { active:false, x:0, y:0, id:null };
function stickReset(){ stick.active=false; stick.x=0; stick.y=0; stickKnob.style.transform='translate(0,0)'; }
stickZone.addEventListener('touchstart', e=>{
  const t=e.changedTouches[0]; stick.active=true; stick.id=t.identifier;
  stick.startX=t.clientX; stick.startY=t.clientY;
}, {passive:true});
stickZone.addEventListener('touchmove', e=>{
  for(const t of e.changedTouches){
    if(t.identifier!==stick.id) continue;
    let dx=t.clientX-stick.startX, dy=t.clientY-stick.startY;
    const max=44; const d=Math.hypot(dx,dy);
    if(d>max){ dx=dx/d*max; dy=dy/d*max; }
    stick.x = dx/max; stick.y = dy/max;
    stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
  }
}, {passive:true});
stickZone.addEventListener('touchend', stickReset, {passive:true});
stickZone.addEventListener('touchcancel', stickReset, {passive:true});

// touch: olhar com drag na tela (fora do stick e botões)
let lookTouchId=null, lookLastX=0, lookLastY=0;
window.addEventListener('touchstart', e=>{
  for(const t of e.changedTouches){
    const el = document.elementFromPoint(t.clientX,t.clientY);
    if(el && (el.closest('.stick-zone') || el.closest('.action-zone'))) continue;
    if(lookTouchId===null){ lookTouchId=t.identifier; lookLastX=t.clientX; lookLastY=t.clientY; }
  }
}, {passive:true});
window.addEventListener('touchmove', e=>{
  for(const t of e.changedTouches){
    if(t.identifier!==lookTouchId) continue;
    const dx=t.clientX-lookLastX, dy=t.clientY-lookLastY;
    lookLastX=t.clientX; lookLastY=t.clientY;
    camState.yaw -= dx*0.005;
    camState.pitch = clamp(camState.pitch - dy*0.0035, -0.35, 0.9);
    ultimoToqueCamera = performance.now();
  }
}, {passive:true});
window.addEventListener('touchend', e=>{
  for(const t of e.changedTouches){ if(t.identifier===lookTouchId) lookTouchId=null; }
}, {passive:true});

// touch buttons
const btnWeb = $('btnWeb'), btnJump = $('btnJump');
btnWeb.addEventListener('touchstart', e=>{ e.preventDefault(); abilityStart(); }, {passive:false});
btnWeb.addEventListener('touchend', e=>{ e.preventDefault(); abilityEnd(); }, {passive:false});
btnJump.addEventListener('touchstart', e=>{ e.preventDefault(); tryJump(); }, {passive:false});

// Corrida: mantém pressionado para acelerar.
const btnDash = $('btnDash');
btnDash.addEventListener('touchstart', e=>{ e.preventDefault(); dashing = true; }, {passive:false});
btnDash.addEventListener('touchend',   e=>{ e.preventDefault(); dashing = false; }, {passive:false});

// Mostra os controles de toque também em telas pequenas: se a detecção de
// toque falhar num aparelho, o jogador ficaria sem nenhum controle.
{
  const telaPequena = Math.min(window.innerWidth, window.innerHeight) < 500;
  const usarToque = isTouch || telaPequena;
  $('desktop-hint').style.display = usarToque ? 'none' : '';
  stickZone.style.display = usarToque ? '' : 'none';
  document.querySelector('.action-zone').style.display = usarToque ? '' : 'none';
}

// ============================================================
// UI: TELAS E FLUXO
// ============================================================
const roster = $('roster');
HEROES.forEach((h, i)=>{
  const card = document.createElement('div');
  card.className = 'hero-card' + (i===0?' active':'');
  card.style.setProperty('--hc', h.c1);
  card.style.setProperty('--hc2', h.c2);
  card.innerHTML = `<div class="hero-check">✓</div><div class="hero-swatch">${h.emoji}</div><div class="hero-name">${h.name}</div><div class="hero-power">${h.desc}</div>`;
  card.addEventListener('click', ()=>{
    selectedHero = h;
    document.querySelectorAll('.hero-card').forEach(c=>c.classList.remove('active'));
    card.classList.add('active');
  });
  roster.appendChild(card);
});

$('btnStart').addEventListener('click', ()=>{
  if(isTouch) lockLandscape();
  $('screen-start').classList.add('hidden');
  $('screen-select').classList.remove('hidden');
});
$('btnConfirm').addEventListener('click', async ()=>{
  const btn = $('btnConfirm');
  btn.disabled = true;
  btn.textContent = 'Carregando…';
  try{
    await buildPlayerModel(selectedHero);
  }catch(e){
    console.error('falha ao carregar o personagem', e);
  }
  btn.disabled = false;
  btn.textContent = 'Entrar na cidade';
  applyHeroTheme(selectedHero);
  $('screen-select').classList.add('hidden');
  resetGame();
  state.running = true;
});
$('btnReplay').addEventListener('click', ()=>{
  $('screen-end').classList.add('hidden');
  $('screen-select').classList.remove('hidden');
});

function resetGame(){
  state.score=0; state.itemsCollected=0; state.quizCorrect=0; state.webEnergy=1;
  P.pos.copy(SPAWN); P.vel.set(0,0,0);
  spawnCollectibles(state.totalItems);
  updateHUD();
}

function toast(msg){
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove('show'), 1800);
}

function updateHUD(){
  $('hudItems').textContent = `${state.itemsCollected}/${state.totalItems}`;
  $('hudScore').textContent = state.score;

  // O anel ao redor do botão de poder mostra a energia restante.
  const arc = $('abCdArc');
  if(arc){
    const circumference = 289;
    arc.style.strokeDashoffset = String(circumference * (1 - state.webEnergy));
  }
}

// Cor do herói alimenta o retrato e o botão de poder via variáveis CSS.
function applyHeroTheme(hero){
  const root = document.documentElement.style;
  root.setProperty('--hero-c1', hero.c1);
  root.setProperty('--hero-c2', hero.c2);
  root.setProperty('--hero-accent', hero.accent);
  $('tbPortrait').textContent = hero.emoji;
  $('tbHeroName').textContent = hero.name;
  $('tbHeroPower').textContent = hero.power;
  $('abMainIcon').textContent = hero.emoji;
  $('objectiveBar').textContent = hero.desc + ' — recolha os 8 recicláveis';
}

// ---------- Minimapa ----------
// Desenha só o entorno: prédios como blocos, itens como pontos verdes.
const miniCanvas = $('minimapCanvas');
const miniCtx = miniCanvas ? miniCanvas.getContext('2d') : null;
const MINI_RANGE = 260;

function updateMinimap(){
  if(!miniCtx) return;
  const size = miniCanvas.width;
  const half = size/2;
  const scale = half / MINI_RANGE;

  miniCtx.clearRect(0,0,size,size);
  miniCtx.fillStyle = '#121828';
  miniCtx.fillRect(0,0,size,size);

  // gira o mapa conforme o olhar, como num minimapa de jogo de ação
  miniCtx.save();
  miniCtx.translate(half, half);
  miniCtx.rotate(camState.yaw);

  miniCtx.fillStyle = '#39415c';
  for(const b of nearbyMinimapBuildings()){
    const dx = (b.x - P.pos.x) * scale;
    const dz = (b.z - P.pos.z) * scale;
    const w = Math.max(2, b.w * scale), d = Math.max(2, b.d * scale);
    miniCtx.fillRect(dx - w/2, dz - d/2, w, d);
  }

  miniCtx.fillStyle = '#3ddc84';
  for(const c of collectibles){
    if(c.collected) continue;
    const dx = (c.mesh.position.x - P.pos.x) * scale;
    const dz = (c.mesh.position.z - P.pos.z) * scale;
    if(Math.hypot(dx,dz) > half) continue;
    miniCtx.beginPath();
    miniCtx.arc(dx, dz, 3, 0, Math.PI*2);
    miniCtx.fill();
  }
  miniCtx.restore();

  // seta do jogador, sempre apontando para cima
  miniCtx.fillStyle = '#ffd23f';
  miniCtx.beginPath();
  miniCtx.moveTo(half, half-6);
  miniCtx.lineTo(half-4.5, half+5);
  miniCtx.lineTo(half+4.5, half+5);
  miniCtx.closePath();
  miniCtx.fill();
}

function nearbyMinimapBuildings(){
  const out = [];
  const cells = Math.ceil(MINI_RANGE / GRID_CELL);
  const cx = Math.floor(P.pos.x/GRID_CELL), cz = Math.floor(P.pos.z/GRID_CELL);
  const seen = new Set();
  for(let ix=cx-cells; ix<=cx+cells; ix++){
    for(let iz=cz-cells; iz<=cz+cells; iz++){
      const cell = grid.get(gridKey(ix,iz));
      if(!cell) continue;
      for(const b of cell){
        if(seen.has(b)) continue;
        seen.add(b);
        out.push(b);
      }
    }
  }
  return out;
}

// ---------- Quiz modal ----------
function openQuiz(onDone){
  state.quizOpen = true;
  const q = QUIZ[Math.floor(Math.random()*QUIZ.length)];
  $('quizQ').textContent = q.q;
  const optsEl = $('quizOpts');
  optsEl.innerHTML='';
  $('quizFeedback').textContent='';
  q.opts.forEach((opt, idx)=>{
    const b = document.createElement('button');
    b.className='quiz-opt'; b.textContent = opt;
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.quiz-opt').forEach(x=>x.disabled=true);
      if(idx===q.correct){
        b.classList.add('correct');
        $('quizFeedback').textContent = 'Correto! Você ganhou pontos extras. ♻️';
        state.quizCorrect++;
        state.score += 50;
      } else {
        b.classList.add('wrong');
        optsEl.children[q.correct].classList.add('correct');
        $('quizFeedback').textContent = 'Quase! Continue reciclando corretamente.';
      }
      updateHUD();
      setTimeout(()=>{
        $('quiz-modal').classList.remove('show');
        state.quizOpen = false;
        onDone && onDone();
      }, 1400);
    });
    optsEl.appendChild(b);
  });
  $('quiz-modal').classList.add('show');
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================
const clock = new THREE.Clock();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();


function updatePlayer(dt){
  if(state.quizOpen) return;

  // regenerate web energy quando não balançando
  if(!swing.active) state.webEnergy = Math.min(1, state.webEnergy + dt*0.18);

  if(swing.active){
    // consumo de energia
    state.webEnergy = Math.max(0, state.webEnergy - dt*0.22);
    if(state.webEnergy<=0){ endSwing(false); }
  }

  if(swing.active && !swing.shooting){
    // física de pêndulo: força em direção tangencial + gravidade
    const toAnchor = tmpVec.copy(swing.anchor).sub(P.pos);
    const dist = toAnchor.length();
    // corrigir distância (corda inextensível, com folga)
    if(dist > swing.length){
      toAnchor.normalize();
      P.pos.addScaledVector(toAnchor, dist - swing.length);
      // remover componente radial da velocidade
      const radial = toAnchor.dot(P.vel);
      P.vel.addScaledVector(toAnchor, -radial);
    }
    P.vel.y += GRAVITY*dt;
    // input dá empuxo tangencial leve
    let mx=0, mz=0;
    if(keys['KeyW']||keys['ArrowUp']) mz-=1;
    if(keys['KeyS']||keys['ArrowDown']) mz+=1;
    if(keys['KeyA']||keys['ArrowLeft']) mx-=1;
    if(keys['KeyD']||keys['ArrowRight']) mx+=1;
    mx += stick.x; mz -= stick.y;
    if(mx||mz){
      const yaw=camState.yaw;
      const fx = Math.sin(yaw)*mz + Math.cos(yaw)*mx;
      const fz = Math.cos(yaw)*mz - Math.sin(yaw)*mx;
      P.vel.x += fx*dt*14;
      P.vel.z += fz*dt*14;
    }
    P.pos.addScaledVector(P.vel, dt);
  } else if(!swing.shooting) {
    // movimento normal (correr / pular)
    let mx=0, mz=0;
    if(keys['KeyW']||keys['ArrowUp']) mz-=1;
    if(keys['KeyS']||keys['ArrowDown']) mz+=1;
    if(keys['KeyA']||keys['ArrowLeft']) mx-=1;
    if(keys['KeyD']||keys['ArrowRight']) mx+=1;
    mx += stick.x; mz -= stick.y;
    const len = Math.hypot(mx,mz);
    if(len>0.01){
      mx/=Math.max(len,1); mz/=Math.max(len,1);
      const yaw=camState.yaw;
      const fx = Math.sin(yaw)*mz + Math.cos(yaw)*mx;
      const fz = Math.cos(yaw)*mz - Math.sin(yaw)*mx;
      // Com rotation.y = θ, a frente local do modelo (0,0,-1) vira, no
      // mundo, (sin θ, 0, -cos θ) — checado nos três modelos do Mixamo, que
      // sem rotação extra já olham para -Z. Para essa frente-no-mundo bater
      // com o vetor de movimento (fx,fz): sin θ = fx, cos θ = -fz.
      // Medido no asset com player.rotation.y=0: a frente (-Z local) aponta
      // para (0,0,-1) no mundo. Girando por θ em Y, (0,0,-1) vira
      // (-sin θ, 0, -cos θ); igualando a (fx,fz): sin θ=-fx, cos θ=-fz.
      const targetYaw = Math.atan2(-fx, -fz);
      // interpola pelo caminho curto, senão o herói gira o corpo todo ao
      // atravessar 180°
      let delta = targetYaw - player.rotation.y;
      while(delta >  Math.PI) delta -= Math.PI*2;
      while(delta < -Math.PI) delta += Math.PI*2;
      player.rotation.y += delta * 0.25;
      const run = (dashing || keys['ShiftLeft'] || keys['ShiftRight']) ? 1.85 : 1;
      const speedMul = (P.onGround?1:AIR_CONTROL) * run;
      P.vel.x = lerp(P.vel.x, fx*WALK_SPEED*speedMul, P.onGround?0.35:0.08);
      P.vel.z = lerp(P.vel.z, fz*WALK_SPEED*speedMul, P.onGround?0.35:0.08);
    } else if(P.onGround){
      P.vel.x = lerp(P.vel.x,0,0.3); P.vel.z = lerp(P.vel.z,0,0.3);
    }

    if(jumpBuffer>0){ jumpBuffer-=dt; if(P.onGround){ P.vel.y=10.5; P.onGround=false; jumpBuffer=0; } }

  // ----- Escalar paredes -----
  // Encostar num prédio e seguir andando faz o herói subir pela fachada.
  // É o gesto mais simples possível: a criança só empurra para frente.
  {
    // Olha um pouco à frente do herói: encostar de raspão já conta como
    // "quero subir", que é o gesto que a criança faz naturalmente.
    const vel = Math.hypot(P.vel.x, P.vel.z);
    const querMover = vel > 0.5;
    let parede = null;
    if(querMover && !swing.active && !ability.flying){
      const fx = P.pos.x + (P.vel.x/vel)*1.4;
      const fz = P.pos.z + (P.vel.z/vel)*1.4;
      parede = nearbyBuildings(fx, fz).find(b =>
        P.pos.y < b.h - 0.5 && insideFootprint(b, fx, fz, 1.2)
      ) || null;
    }
    const comecandoAgora = parede && !climbing;
    climbing = !!parede;
    if(climbing){
      if(comecandoAgora) climbT = 0;
      climbT += dt;
      // Acelera até um ritmo de escalada, em vez de saltar direto pra uma
      // velocidade fixa — isso é o que faz parecer elevador.
      const ritmo = Math.min(climbT / 0.5, 1);
      // Um leve vaivém lateral simula o gesto de puxar o corpo, alternando
      // o "braço" que segura a parede.
      const vaivem = Math.sin(clock.elapsedTime * 6) * 0.35;
      P.vel.y = lerp(P.vel.y, 4.5 * ritmo, 0.3);

      // Cola na parede: sem isso a colisão empurra o herói de volta e ele
      // escorrega em vez de subir.
      const dx = P.pos.x - parede.x, dz = P.pos.z - parede.z;
      const d2 = Math.hypot(dx, dz) || 1;
      const nx = -dx/d2, nz = -dz/d2;      // normal apontando pra dentro da parede
      const tx = -nz, tz = nx;             // tangente, pra dar o vaivém lateral
      P.vel.x = nx*1.1 + tx*vaivem;
      P.vel.z = nz*1.1 + tz*vaivem;
    }
  }

    // A escalada sobrescreve a gravidade: enquanto agarrado, o herói sobe.
    if(!climbing) P.vel.y += GRAVITY*dt;
    P.pos.addScaledVector(P.vel, dt);
  }

  // ----- Rede de segurança -----
  // Crianças pequenas caem o tempo todo. Em vez de punir, a queda é freada
  // e o herói pousa devagar, sem susto e sem perder nada.
  if(P.vel.y < -26 && !ability.flying){
    P.vel.y = -26;
  }

  // colisão com chão dos prédios / solo
  const groundY = groundHeightAt(P.pos.x, P.pos.z);
  if(P.pos.y <= groundY + 1.0){
    const impactSpeed = -P.vel.y;
    P.pos.y = groundY + 1.0;
    if(P.vel.y<0) P.vel.y = 0;
    P.onGround = true;
    if(swing.active) endSwing(false);
    // queda forte do Bruto vira onda de choque
    if(ability.smashCharging && impactSpeed > 18) doSmashLanding();
    else if(P.onGround) ability.smashCharging = false;
  } else {
    P.onGround = false;
  }

  // limites da cidade
  P.pos.x = clamp(P.pos.x, -MAP.halfX+6, MAP.halfX-6);
  P.pos.z = clamp(P.pos.z, -MAP.halfZ+6, MAP.halfZ-6);
  if(P.pos.y < -10){ P.pos.copy(SPAWN); P.vel.set(0,0,0); }

  // P.pos é o centro da cápsula de colisão; o modelo tem os pés na origem,
  // então desce 1 unidade para o chão bater com o pé.
  player.position.copy(P.pos).setY(P.pos.y - 1.0);

  // A animação agora vem dos clipes do Mixamo.
  updateAnimationState(dt);

  // web line + shoot animation
  if(swing.shooting){
    swing.shootT += dt*4.5;
    if(swing.shootT>=1){ swing.shooting=false; swing.shootT=1; }
    const p = tmpVec2.copy(swing.shootFrom).lerp(swing.shootTo, swing.shootT);
    webShot.position.copy(p); webShot.visible = true;
    updateWebLine(swing.shootFrom, p);
  } else {
    webShot.visible = false;
    if(swing.active){
      updateWebLine(new THREE.Vector3(P.pos.x,P.pos.y+0.9,P.pos.z), swing.anchor);
    } else if(webLine.releasing){
      // Encolhe do herói até o ponto onde estava presa, em vez de sumir de
      // repente — dá a sensação de a teia se soltando e recolhendo.
      webLine.releaseT += dt*3.2;
      if(webLine.releaseT >= 1){
        webLine.releasing = false;
        webLine.visible = false;
      } else {
        const alvo = new THREE.Vector3(P.pos.x, P.pos.y+0.9, P.pos.z);
        const preso = tmpVec2.copy(webLine.releaseFrom).lerp(webLine.releaseAnchor, webLine.releaseT);
        webLine.visible = true;
        updateWebLine(alvo, preso);
      }
    }
  }
}

function updateWebLine(from,to){
  const posAttr = webLine.geometry.attributes.position;
  posAttr.setXYZ(0, from.x,from.y,from.z);
  posAttr.setXYZ(1, to.x,to.y,to.z);
  posAttr.needsUpdate = true;
}

// A sombra cobre só uma janela ao redor do jogador; sem isso o mapa de
// sombra teria de abraçar Midtown inteira e ficaria borrado demais.
function updateSky(){
  skyDome.position.set(P.pos.x, 0, P.pos.z);
}

function updateSunShadow(){
  sun.position.set(P.pos.x + 70, P.pos.y + 230, P.pos.z + 55);
  sun.target.position.set(P.pos.x, P.pos.y, P.pos.z);
  sun.target.updateMatrixWorld();
}

// A câmera se alinha sozinha ao movimento, para a criança não precisar
// controlá-la com o segundo dedo. Só recua quando ela mesma está arrastando.
function updateAutoCamera(dt){
  if(performance.now() - ultimoToqueCamera < 2500) return;
  if(climbing || swing.active || !P.onGround) return; // só segue no chão
  const vel = Math.hypot(P.vel.x, P.vel.z);
  if(vel < 2) return;
  // Mesma fórmula usada para virar o corpo (ver player.rotation.y acima):
  // a câmera fica atrás do herói, então precisa mirar para onde ELE olha.
  const desejado = Math.atan2(P.vel.x, P.vel.z) + Math.PI;
  let delta = desejado - camState.yaw;
  while(delta >  Math.PI) delta -= Math.PI*2;
  while(delta < -Math.PI) delta += Math.PI*2;
  camState.yaw += delta * Math.min(1, dt*1.6);
}

function updateCamera(){
  const target = tmpVec.set(P.pos.x, P.pos.y+1.1, P.pos.z);
  const offset = new THREE.Vector3(
    Math.sin(camState.yaw)*Math.cos(camState.pitch),
    Math.sin(camState.pitch)+0.25,
    Math.cos(camState.yaw)*Math.cos(camState.pitch)
  ).multiplyScalar(camState.dist);
  const desired = target.clone().add(offset);

  // evitar câmera atravessar prédios: raycast simples da target até desired
  const dir = desired.clone().sub(target).normalize();
  const dist = target.distanceTo(desired);
  const raycaster = new THREE.Raycaster(target, dir, 0, dist);
  const hits = raycaster.intersectObjects(meshesAlongRay(target, dir, dist), false);
  let finalPos = desired;
  if(hits.length){ finalPos = hits[0].point.clone().addScaledVector(dir,-0.4); }

  camera.position.lerp(finalPos, 0.35);
  camera.lookAt(target);
}

function collectItem(c){
  if(c.collected) return;
  c.collected = true;
  c.mesh.visible = false;
  state.itemsCollected++;
  state.score += 20;
  updateHUD();
  toast('Item reciclável coletado! ♻️');
  openQuiz(()=>{
    if(state.itemsCollected >= state.totalItems) finishGame();
  });
}

function updateCollectibles(dt){
  for(const c of collectibles){
    if(c.collected) continue;
    c.mesh.rotation.y += dt*1.6;
    c.mesh.position.y = c.baseY + Math.sin(clock.elapsedTime*2 + c.phase)*0.4;
    if(c.mesh.position.distanceTo(P.pos) < 2.6) collectItem(c);
  }
}

function finishGame(){
  state.running = false;
  $('statItems').textContent = state.itemsCollected;
  $('statQuiz').textContent = state.quizCorrect;
  $('screen-end').classList.remove('hidden');
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if(state.running && !portraitBlocked){
    updateAbility(dt);
    updatePlayer(dt);
    updateAutoCamera(dt);
    updateSunShadow();
    updateSky();
    updateCamera();
    updateCollectibles(dt);
    updateTraffic(dt);
    updateCrowd(dt);
    updateGuideArrow();
    updateHUD();
    updateMinimap();
  }
  renderer.render(scene, camera);
}

// ---------- Carregamento ----------
// A barra acompanha o download real das animações, não um tempo inventado.
(async () => {
  $('loadTxt').textContent = 'Erguendo Manhattan…';
  $('loadFill').style.width = '35%';
  await new Promise(r => setTimeout(r, 120));

  $('loadTxt').textContent = 'Preparando os heróis…';
  try{
    await preloadAnimations();
  }catch(e){
    console.error('falha ao carregar animações', e);
  }
  $('loadFill').style.width = '100%';
  $('loadTxt').textContent = 'Pronto';
  setTimeout(() => { $('loading').style.display = 'none'; }, 250);
})();

resize();
animate();





})();
