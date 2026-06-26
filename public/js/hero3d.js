/* ═══════════════════════════════════════════════════════════════
   Logovo — Hero 3D Cinematic
   Fullscreen scene: abstract glowing shapes in deep space
   Inspired by game AAA aesthetics — no trademarked elements
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── boot after THREE loads ─────────────────────────────── */
  function boot() {
    const canvas = document.getElementById('heroCanvas3d');
    if (!canvas || typeof THREE === 'undefined') return;

    const W = () => window.innerWidth;
    const H = () => window.innerHeight - (
      parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--nb') || '58') || 58
    );

    /* ── Renderer ───────────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W(), H());
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x02010e, 1);

    /* ── Scene ──────────────────────────────────────────────── */
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03010e, 0.028);

    /* ── Camera ─────────────────────────────────────────────── */
    const camera = new THREE.PerspectiveCamera(50, W()/H(), 0.1, 200);
    camera.position.set(0, 0, 16);

    /* ── Mouse / device tilt ────────────────────────────────── */
    let tx = 0, ty = 0, mx = 0, my = 0; // target / smoothed
    window.addEventListener('mousemove', e => {
      tx = (e.clientX / window.innerWidth  - .5) * 2;
      ty = (e.clientY / window.innerHeight - .5) * 2;
    }, { passive:true });
    if (window.DeviceOrientationEvent)
      window.addEventListener('deviceorientation', e => {
        tx = Math.max(-1, Math.min(1, (e.gamma||0)/32));
        ty = Math.max(-1, Math.min(1, ((e.beta||0)-15)/32));
      }, { passive:true });

    /* ── LIGHTS ─────────────────────────────────────────────── */
    scene.add(new THREE.AmbientLight(0x0d0630, 2.5));

    const L1 = new THREE.PointLight(0x7c5ce0, 18, 55); // purple key
    L1.position.set(-7, 8, 10);
    scene.add(L1);

    const L2 = new THREE.PointLight(0x4361ee, 12, 50); // indigo fill
    L2.position.set(8, -6, 8);
    scene.add(L2);

    const L3 = new THREE.PointLight(0x00d2ff, 7, 45);  // cyan rim
    L3.position.set(0, 10, -12);
    scene.add(L3);

    const L4 = new THREE.PointLight(0xff0080, 5, 35);  // rose accent
    L4.position.set(5, 5, 5);
    scene.add(L4);

    /* ── BACKGROUND (GLSL nebula) ───────────────────────────── */
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec2 v; void main(){ v=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        uniform float uT;
        varying vec2 v;
        vec3 hash3(vec2 p){ return fract(sin(vec3(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)),dot(p,vec2(419.2,371.9))))*43758.5); }
        void main(){
          vec2 uv = v - .5;
          // Deep void
          vec3 c = vec3(0.005, 0.002, 0.020);
          // Nebula core — violet
          float d = length(uv * vec2(1.4, 1.));
          c += vec3(0.18,0.04,0.48) * exp(-d*3.5) * .65;
          // Second nebula — indigo top-left
          float d2 = length(uv - vec2(-.35,.28));
          c += vec3(0.08,0.12,0.55) * exp(-d2*4.8) * .42;
          // Cyan bottom-right
          float d3 = length(uv - vec2(.38,-.32));
          c += vec3(0.,0.45,0.75) * exp(-d3*5.5) * .28;
          // Rose micro-accent
          float d4 = length(uv - vec2(.20,.22));
          c += vec3(0.45,0.,0.25) * exp(-d4*7.) * .15;
          // Animate subtle pulse
          c += vec3(0.03,0.005,0.07) * sin(uT*.38 + d*4.5) * .14;
          // Vignette
          c *= 1. - length(uv) * .72;
          // Gamma
          c = pow(max(c, vec3(0.)), vec3(.88));
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 70), bgMat);
    bgMesh.position.z = -30;
    scene.add(bgMesh);

    /* ── STAR FIELD ─────────────────────────────────────────── */
    (() => {
      const N = 400;
      const pos = new Float32Array(N*3);
      const sz  = new Float32Array(N);
      for (let i=0;i<N;i++){
        pos[i*3]   = (Math.random()-.5)*130;
        pos[i*3+1] = (Math.random()-.5)*80;
        pos[i*3+2] = (Math.random()-.5)*60 - 15;
        sz[i] = Math.random()*3.2+0.3;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos,3));
      g.setAttribute('size',     new THREE.BufferAttribute(sz, 1));
      const m = new THREE.ShaderMaterial({
        transparent:true, depthWrite:false,
        uniforms:{},
        vertexShader:`attribute float size;
          void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*(200./-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader:`
          void main(){
            float d=length(gl_PointCoord-.5)*2.;
            if(d>1.)discard;
            float a=(1.-smoothstep(.0,.85,d))*.8;
            gl_FragColor=vec4(.82,.78,1.,a);
          }`,
      });
      scene.add(new THREE.Points(g,m));
    })();

    /* ── LIGHT RAYS (volumetric streaks) ────────────────────── */
    const rays = [];
    for (let i=0;i<6;i++){
      const angle = (i/6)*Math.PI*2;
      const len   = 8 + Math.random()*6;
      const g = new THREE.CylinderGeometry(0.004, 0.18, len, 6, 1, true);
      const m = new THREE.MeshBasicMaterial({
        color: [0x7c5ce0,0x4361ee,0x00d2ff,0xc084fc,0x818cf8,0x6366f1][i],
        transparent:true, opacity: 0.04+Math.random()*0.05,
        blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(g,m);
      mesh.rotation.z = angle;
      mesh.position.set(Math.cos(angle)*2, Math.sin(angle)*2, -5+Math.random()*3);
      rays.push({ mesh, baseOp:m.opacity, ph:Math.random()*Math.PI*2 });
      scene.add(mesh);
    }

    /* ── SHAPE FACTORY ──────────────────────────────────────── */
    const glassMat = (color, emit, opacity=0.88) =>
      new THREE.MeshPhysicalMaterial({
        color, emissive:emit, emissiveIntensity:1.8,
        metalness:0.02, roughness:0.05,
        transmission:0.48, thickness:1.4, ior:1.5,
        transparent:true, opacity, side:THREE.DoubleSide,
        reflectivity:0.92,
      });

    const wireMat = (color) =>
      new THREE.MeshBasicMaterial({
        color, wireframe:true, transparent:true, opacity:0.16,
        blending:THREE.AdditiveBlending, depthWrite:false,
      });

    const haloMat = (color) => {
      const N=160, pos=new Float32Array(N*3), sz=new Float32Array(N);
      for(let i=0;i<N;i++){
        const θ=Math.random()*Math.PI*2, φ=Math.acos(2*Math.random()-1);
        const r=1.6*(0.6+Math.random()*.85);
        pos[i*3]=r*Math.sin(φ)*Math.cos(θ);
        pos[i*3+1]=r*Math.sin(φ)*Math.sin(θ);
        pos[i*3+2]=r*Math.cos(φ);
        sz[i]=1.1+Math.random()*2.4;
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(pos,3));
      g.setAttribute('size',    new THREE.BufferAttribute(sz,1));
      return new THREE.Points(g, new THREE.ShaderMaterial({
        transparent:true, blending:THREE.AdditiveBlending, depthWrite:false,
        uniforms:{ uC:{value:new THREE.Color(color)} },
        vertexShader:`attribute float size; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*(160./-mv.z); gl_Position=projectionMatrix*mv; }`,
        fragmentShader:`uniform vec3 uC; void main(){ float d=length(gl_PointCoord-.5)*2.; if(d>1.)discard; float a=(1.-d)*(1.-d)*.5; gl_FragColor=vec4(uC,a); }`,
      }));
    };

    // Geometries
    const geos = [
      new THREE.TorusGeometry(0.95, 0.15, 32, 80),                   // ○
      new THREE.ConeGeometry(0.96, 1.70, 3, 1, false),               // △
      new THREE.BoxGeometry(1.55, 1.55, 0.18, 2,2,2),                // □
      (() => {                                                          // ×
        const s=new THREE.Shape(), t=.31, a=.90;
        s.moveTo(-t,-a);s.lineTo(t,-a);s.lineTo(t,-t);s.lineTo(a,-t);
        s.lineTo(a,t);s.lineTo(t,t);s.lineTo(t,a);s.lineTo(-t,a);
        s.lineTo(-t,t);s.lineTo(-a,t);s.lineTo(-a,-t);s.lineTo(-t,-t);
        s.closePath();
        return new THREE.ExtrudeGeometry(s,{depth:.20,bevelEnabled:true,bevelSize:.06,bevelThickness:.06,bevelSegments:4});
      })(),
    ];

    const COLORS = [
      { c:0x22d3ee, e:0x00f5ff, h:'#22d3ee' },  // ○ cyan
      { c:0x4ade80, e:0x22ff66, h:'#4ade80' },  // △ lime
      { c:0xfb7185, e:0xff2060, h:'#fb7185' },  // □ rose
      { c:0xa5b4fc, e:0x6366f1, h:'#818cf8' },  // × indigo
    ];

    // Positions — loose diamond
    const ORIGINS = [
      [-3.5, 2.0, 0], // ○ top-left
      [ 3.5, 2.0, 0], // △ top-right
      [-3.5,-2.0, 0], // □ bottom-left
      [ 3.5,-2.0, 0], // × bottom-right
    ];

    const shapes = COLORS.map((col,i) => {
      const g  = new THREE.Group();
      const m  = new THREE.Mesh(geos[i], glassMat(col.c, col.e));
      const w  = new THREE.Mesh(geos[i], wireMat(col.c));
      w.scale.setScalar(1.06);
      const h  = haloMat(col.h);
      g.add(m,w,h);
      g.position.set(...ORIGINS[i]);
      g.scale.setScalar(0.001);
      scene.add(g);
      return { g, m, w, h, col, ph:Math.random()*Math.PI*2, orbit:ORIGINS[i].slice() };
    });

    /* ── AMBIENT DUST PARTICLES ─────────────────────────────── */
    const DUST_N = 220;
    const dPos = new Float32Array(DUST_N*3);
    const dVel = new Float32Array(DUST_N*3);
    const dSz  = new Float32Array(DUST_N);
    for(let i=0;i<DUST_N;i++){
      dPos[i*3]  =(Math.random()-.5)*28;
      dPos[i*3+1]=(Math.random()-.5)*18;
      dPos[i*3+2]=(Math.random()-.5)*14-3;
      dVel[i*3]  =(Math.random()-.5)*.0030;
      dVel[i*3+1]= Math.random()    *.0038+.0008;
      dVel[i*3+2]=(Math.random()-.5)*.0008;
      dSz[i]=0.8+Math.random()*2.8;
    }
    const dGeo=new THREE.BufferGeometry();
    dGeo.setAttribute('position',new THREE.BufferAttribute(dPos,3));
    dGeo.setAttribute('size',    new THREE.BufferAttribute(dSz, 1));
    const dust=new THREE.Points(dGeo, new THREE.ShaderMaterial({
      transparent:true, blending:THREE.AdditiveBlending, depthWrite:false,
      uniforms:{},
      vertexShader:`attribute float size; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*(165./-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`void main(){ float d=length(gl_PointCoord-.5)*2.; if(d>1.)discard; float a=(1.-d)*(1.-d)*.36; gl_FragColor=vec4(.55,.45,.95,a); }`,
    }));
    dust.visible=false;
    scene.add(dust);

    /* ── RESIZE ─────────────────────────────────────────────── */
    window.addEventListener('resize', ()=>{
      const w=W(),h=H();
      camera.aspect=w/h;
      camera.updateProjectionMatrix();
      renderer.setSize(w,h);
    }, {passive:true});

    /* ── EASING ─────────────────────────────────────────────── */
    const eSpring = t => t>=1?1: Math.pow(2,-10*t)*Math.sin((t*10-.75)*(2*Math.PI/3))+1;
    const eOut3   = t => 1-Math.pow(1-Math.min(t,1),3);

    /* ── INTRO TIMING ───────────────────────────────────────── */
    // 0.0 — bg already rendered (sync)
    // 0.3 — stars visible (instant, opacity 1 from start)
    // 0.8 — dust particles appear
    // 1.4 — shapes start entering (staggered by 0.2s each)
    // 2.8 — all shapes fully in place

    /* ── RENDER LOOP ────────────────────────────────────────── */
    let t0 = null, prev = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      if (!t0) t0 = now;
      const T  = (now - t0) * 0.001;
      const dt = Math.min((now - prev) * 0.001, 0.05);
      prev = now;

      bgMat.uniforms.uT.value = T;

      // Smooth mouse
      mx += (tx - mx) * .052;
      my += (ty - my) * .052;

      // Camera parallax
      camera.position.x += (-mx*2.0 - camera.position.x) * .045;
      camera.position.y += ( my*1.2  - camera.position.y) * .045;
      // Gentle zoom breathe
      camera.position.z = 16 + Math.sin(T*.18)*.3;
      camera.lookAt(0, 0, 0);

      // Dust particles
      if (T > 0.8) {
        dust.visible = true;
        const alpha = Math.min((T-.8)/.6, 1);
        // Just drift — opacity handled by shader constant
        for(let i=0;i<DUST_N;i++){
          dPos[i*3]  +=dVel[i*3];
          dPos[i*3+1]+=dVel[i*3+1];
          dPos[i*3+2]+=dVel[i*3+2];
          if(dPos[i*3+1]>10)  dPos[i*3+1]=-9;
          if(dPos[i*3]  >15)  dPos[i*3]  =-15;
          if(dPos[i*3]  <-15) dPos[i*3]  = 15;
        }
        dGeo.attributes.position.needsUpdate = true;
      }

      // Light rays pulse
      rays.forEach((r,i) => {
        r.mesh.material.opacity = r.baseOp * (.6 + Math.sin(T*.55+r.ph+i)*.4);
        r.mesh.rotation.z += dt * (.012 + i*.003) * (i%2?1:-1);
      });

      // Shapes
      const shapeReady = T > 2.5;
      shapes.forEach((s, i) => {
        const delay  = 1.4 + i * 0.20;
        if (T > delay) {
          const p = Math.min((T-delay)/.55, 1);
          s.g.scale.setScalar(Math.max(eSpring(p), 0.001));
        }

        const t = T + s.ph;
        const R = .28;

        // Float orbit
        const ox = Math.sin(t*.25 + i*1.57)*R;
        const oy = Math.cos(t*.18 + i*.78)*R*.65;
        const oz = Math.sin(t*.14 + i*2.1 )*.18;

        // Mouse pull (after shapes settle)
        const pull = shapeReady ? eOut3(Math.min((T-2.5)/1., 1)) : 0;
        const ax = mx * .70 * pull;
        const ay = -my * .45 * pull;

        const gx = s.orbit[0] + ox + ax;
        const gy = s.orbit[1] + oy + ay;
        const gz = s.orbit[2] + oz;

        s.g.position.x += (gx - s.g.position.x) * .030;
        s.g.position.y += (gy - s.g.position.y) * .030;
        s.g.position.z += (gz - s.g.position.z) * .030;

        // Rotation
        s.g.rotation.x = Math.sin(t*.26+s.ph)*.44;
        s.g.rotation.y = t*(.18+i*.03);
        s.g.rotation.z = Math.cos(t*.15+s.ph)*.23;

        // Emissive pulse
        const pulse = .14 + Math.sin(t*1.65+s.ph)*.07;
        s.m.material.emissiveIntensity = 1.5 + pulse*5.5;
        s.w.material.opacity = .11 + pulse * .9;
      });

      // Lights follow mouse subtly
      L1.position.x = -6 + mx*3;
      L1.position.y =  7 + my*2;
      L2.position.x =  7 - mx*2.5;
      L4.position.x =  4 + mx*2;
      L4.position.y =  4 - my*1.5;

      renderer.render(scene, camera);
    }

    requestAnimationFrame(frame);
  }

  /* ── Load Three.js r128 ─────────────────────────────────── */
  if (typeof THREE !== 'undefined') {
    setTimeout(boot, 50);
  } else {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload  = () => setTimeout(boot, 50);
    s.onerror = () => console.warn('[Hero3D] Three.js unavailable');
    document.head.appendChild(s);
  }
})();
