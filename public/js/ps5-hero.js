/* ═══════════════════════════════════════════════════════════════
   Hero canvas — медведь на гидроцикле
   Canvas встроен в .hero-canvas-zone, НЕ fixed.
   Размеры берём у родителя — они всегда корректны.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, DPR = 1;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let T = 0;

  /* ── Resize ──────────────────────────────────────────────── */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const zone = canvas.parentElement;
    W = zone ? zone.clientWidth  : window.innerWidth;
    H = zone ? zone.clientHeight : 360;
    if (W < 1) W = window.innerWidth;
    if (H < 1) H = 360;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    // CSS size controlled by parent (width:100%, height:100%)
  }
  resize();
  setTimeout(resize, 60);
  window.addEventListener('resize', resize);

  /* ── Mouse parallax ─────────────────────────────────────── */
  window.addEventListener('mousemove', e => {
    tmx = (e.clientX / window.innerWidth)  * 2 - 1;
    tmy = (e.clientY / window.innerHeight) * 2 - 1;
  });
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', e => {
      tmx = Math.max(-1, Math.min(1, (e.gamma || 0) / 40));
      tmy = Math.max(-1, Math.min(1, ((e.beta  || 20) - 20) / 50));
    }, { passive: true });
  }

  /* ── Spray particles ─────────────────────────────────────── */
  const SPRAY = Array.from({ length: 40 }, () => ({ x:0, y:0, vx:0, vy:0, life:0, max:0, r:0 }));
  let sprayTick = 0;
  function spawnSpray(cx, cy) {
    for (const p of SPRAY) {
      if (p.life > 0) continue;
      p.x = cx + (Math.random() - .5) * 28;
      p.y = cy;
      p.vx = (Math.random() - .5) * 3;
      p.vy = -(Math.random() * 2.8 + .8);
      p.r  = 1.2 + Math.random() * 2.8;
      p.max = p.life = 25 + Math.random() * 18;
      return;
    }
  }

  /* ── Stars ───────────────────────────────────────────────── */
  const STARS = Array.from({ length: 55 }, () => ({
    x: Math.random(), y: Math.random() * .55,
    r: .4 + Math.random() * 1.2,
    a: .15 + Math.random() * .55,
    ph: Math.random() * Math.PI * 2,
  }));

  /* ── Bubbles ─────────────────────────────────────────────── */
  const BUBBLES = Array.from({ length: 18 }, () => ({
    x: Math.random(), y: .6 + Math.random() * .4,
    r: .8 + Math.random() * 3, sp: .0006 + Math.random() * .001,
    ph: Math.random() * Math.PI * 2, a: .08 + Math.random() * .2,
  }));

  /* ═══ roundRect polyfill ════════════════════════════════════ */
  function rr(x, y, w, h, r) {
    r = Math.min(Math.abs(r), Math.abs(w)/2, Math.abs(h)/2);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
  }

  /* ═══ BACKGROUND ════════════════════════════════════════════ */
  function drawBg() {
    /* Sky */
    const sky = ctx.createLinearGradient(0, 0, 0, H * .72);
    sky.addColorStop(0,   '#08041a');
    sky.addColorStop(.4,  '#0e0930');
    sky.addColorStop(.72, '#14104a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * .72);

    /* Water */
    const wat = ctx.createLinearGradient(0, H * .65, 0, H);
    wat.addColorStop(0, '#0c1460'); wat.addColorStop(1, '#040c28');
    ctx.fillStyle = wat; ctx.fillRect(0, H * .65, W, H * .38);

    /* Center atmospheric glow */
    const ag = ctx.createRadialGradient(W*.5 + mx*25, H*.45, 0, W*.5, H*.45, W*.5);
    ag.addColorStop(0,  `rgba(60,20,160,${.20 + Math.sin(T*.5)*.05})`);
    ag.addColorStop(.6,  'rgba(20,8,60,.06)');
    ag.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);

    /* Moon */
    const mx2 = W*.76 + mx*15, my2 = H*.15;
    const mg = ctx.createRadialGradient(mx2, my2, 0, mx2, my2, 55);
    mg.addColorStop(0,  'rgba(160,120,255,.5)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(mx2, my2, 17, 0, Math.PI*2);
    ctx.fillStyle = '#ede0ff'; ctx.fill();
    ctx.beginPath(); ctx.arc(mx2, my2, 13, 0, Math.PI*2);
    ctx.fillStyle = '#f6f0ff'; ctx.fill();
    ctx.restore();

    /* Stars */
    STARS.forEach(s => {
      ctx.save();
      ctx.globalAlpha = s.a * (.5 + Math.sin(T + s.ph) * .5);
      ctx.fillStyle = '#ccbbff';
      ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });

    /* City silhouette */
    const bh = [.32,.36,.28,.38,.33,.25,.37,.30,.34,.27,.36,.31,.33];
    const bx = [.05,.11,.18,.24,.30,.37,.44,.50,.57,.63,.70,.78,.86];
    const bw = [.055,.046,.07,.038,.062,.08,.042,.06,.05,.07,.045,.065,.055];
    ctx.fillStyle = 'rgba(4,2,16,.85)';
    bh.forEach((h, i) => {
      ctx.fillRect(W*bx[i], H*h, W*bw[i], H*(1-h)*.9);
    });
    // tiny windows
    ctx.fillStyle = 'rgba(180,160,255,.06)';
    bh.forEach((h, i) => {
      for (let wy = H*h+4; wy < H*(h+.12); wy+=7) {
        for (let wx = W*bx[i]+3; wx < W*(bx[i]+bw[i])-3; wx+=6) {
          if (Math.random()>.55) ctx.fillRect(wx, wy, 2.5, 3.5);
        }
      }
    });

    /* Palms */
    palm(W*.06, H*.74, .58); palm(W*.11, H*.76, .72);
    palm(W*.90, H*.74, .65); palm(W*.95, H*.77, .80);

    /* Waves */
    for (let i = 0; i < 4; i++) {
      const yb  = H * (.67 + i * .08);
      const amp = (7 - i * 1.4) * (W / 700);
      const spd = .7 - i * .1;
      ctx.save();
      ctx.globalAlpha = .10 - i * .018 + Math.sin(T*.4+i) * .025;
      ctx.strokeStyle = '#5070ee'; ctx.lineWidth = 1.3 - i * .2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 5) {
        const y = yb + Math.sin((x/W)*Math.PI*6 + T*spd+i)*amp
                     + Math.sin((x/W)*Math.PI*11 - T*spd*.6)*amp*.35;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    }

    /* Moon reflection */
    ctx.save();
    ctx.globalAlpha = .05 + Math.sin(T*.7)*.02;
    const rg = ctx.createLinearGradient(W*.5, H*.67, W*.5, H);
    rg.addColorStop(0,'rgba(150,100,255,1)'); rg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    const rw = 55 + Math.sin(T*.5)*15;
    ctx.fillRect(W*.5-rw/2, H*.67, rw, H*.35);
    ctx.restore();

    /* Bubbles */
    BUBBLES.forEach(b => {
      b.y -= b.sp; if (b.y < .5) { b.y = 1; b.x = Math.random(); }
      ctx.save(); ctx.globalAlpha = b.a*(.4+Math.sin(T+b.ph)*.3);
      ctx.strokeStyle = 'rgba(100,140,255,.6)'; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.arc(b.x*W, b.y*H, b.r, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    });
  }

  /* ═══ Palm ══════════════════════════════════════════════════ */
  function palm(x, y, sc) {
    ctx.save();
    ctx.strokeStyle='rgba(15,8,35,.9)'; ctx.lineWidth=4*sc; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x+8*sc, y-32*sc, x-6*sc, y-65*sc, x+4*sc, y-88*sc);
    ctx.stroke();
    const tx=x+4*sc, ty=y-88*sc;
    [[-1.0,.3],[-.7,-.5],[0,-.8],[.7,-.6],[1.0,.2],[.3,.8],[-.3,.8]].forEach(([lx,ly]) => {
      ctx.beginPath(); ctx.moveTo(tx,ty);
      ctx.quadraticCurveTo(tx+lx*22*sc, ty+ly*14*sc, tx+lx*44*sc, ty+ly*28*sc);
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ═══ JETSKI ════════════════════════════════════════════════ */
  function drawJetski(cx, cy, sc, tilt) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt * .035);

    /* Drop shadow */
    const sh = ctx.createRadialGradient(0, 16*sc, 0, 0, 16*sc, 70*sc);
    sh.addColorStop(0,'rgba(0,0,30,.5)'); sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh;
    ctx.beginPath(); ctx.ellipse(0,18*sc,65*sc,11*sc,0,0,Math.PI*2); ctx.fill();

    /* Hull */
    const hG = ctx.createLinearGradient(-60*sc,-6*sc,60*sc,16*sc);
    hG.addColorStop(0,'#8b00cc'); hG.addColorStop(.35,'#6500aa');
    hG.addColorStop(.65,'#9900dd'); hG.addColorStop(1,'#5000aa');
    ctx.fillStyle=hG;
    ctx.beginPath();
    ctx.moveTo(-60*sc,2*sc);
    ctx.bezierCurveTo(-70*sc,7*sc,-65*sc,16*sc,-44*sc,18*sc);
    ctx.lineTo(44*sc,18*sc);
    ctx.bezierCurveTo(68*sc,16*sc,72*sc,7*sc,65*sc,-1*sc);
    ctx.bezierCurveTo(50*sc,-10*sc,25*sc,-13*sc,0,-12*sc);
    ctx.bezierCurveTo(-25*sc,-13*sc,-50*sc,-8*sc,-60*sc,2*sc);
    ctx.fill();

    /* Hull highlight */
    ctx.fillStyle='rgba(210,70,255,.2)';
    ctx.beginPath();
    ctx.moveTo(-35*sc,-10*sc);
    ctx.bezierCurveTo(-15*sc,-15*sc,15*sc,-15*sc,42*sc,-7*sc);
    ctx.bezierCurveTo(15*sc,-11*sc,-15*sc,-11*sc,-35*sc,-10*sc); ctx.fill();

    /* Neon stripe */
    ctx.strokeStyle='rgba(200,50,255,.55)'; ctx.lineWidth=1.2;
    ctx.beginPath();
    ctx.moveTo(-46*sc,3*sc);
    ctx.bezierCurveTo(-22*sc,-1*sc,22*sc,-1*sc,52*sc,2*sc); ctx.stroke();

    /* Bottom */
    const btG = ctx.createLinearGradient(0,10*sc,0,20*sc);
    btG.addColorStop(0,'#3a0060'); btG.addColorStop(1,'#180028');
    ctx.fillStyle=btG;
    ctx.beginPath();
    ctx.moveTo(-44*sc,18*sc);
    ctx.quadraticCurveTo(0,25*sc,44*sc,18*sc);
    ctx.lineTo(52*sc,12*sc);
    ctx.quadraticCurveTo(0,19*sc,-52*sc,12*sc); ctx.closePath(); ctx.fill();

    /* ZARUB text */
    ctx.fillStyle='rgba(255,200,255,.7)';
    ctx.font=`bold ${8*sc}px Inter,Arial`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('ZARUB',-4*sc,8*sc);

    /* Handlebars */
    ctx.strokeStyle='#777'; ctx.lineWidth=2.5*sc; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-20*sc,-15*sc); ctx.lineTo(20*sc,-15*sc); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-15*sc); ctx.lineTo(0,-8*sc); ctx.stroke();
    ctx.strokeStyle='#333';
    [[-20,-15,-15,-15],[20,-15,15,-15]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x1*sc,y1*sc); ctx.lineTo(x2*sc,y2*sc); ctx.stroke();
    });

    ctx.restore();
  }

  /* ═══ BEAR ══════════════════════════════════════════════════ */
  function drawBear(cx, cy, sc, tilt) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt * .022);

    const fur='#c8914a', furD='#a06530', furL='#dda055';

    /* Body */
    const bG=ctx.createRadialGradient(-6*sc,-25*sc,4*sc,0,-16*sc,34*sc);
    bG.addColorStop(0,furL); bG.addColorStop(.6,fur); bG.addColorStop(1,furD);
    ctx.fillStyle=bG;
    ctx.beginPath(); ctx.ellipse(0,-18*sc,27*sc,32*sc,0,0,Math.PI*2); ctx.fill();

    /* Shirt */
    ctx.fillStyle='#cc2222';
    ctx.beginPath();
    ctx.moveTo(-26*sc,-8*sc);
    ctx.bezierCurveTo(-30*sc,0,-28*sc,16*sc,-20*sc,20*sc);
    ctx.lineTo(20*sc,20*sc);
    ctx.bezierCurveTo(28*sc,16*sc,30*sc,0,26*sc,-8*sc);
    ctx.bezierCurveTo(16*sc,-15*sc,-16*sc,-15*sc,-26*sc,-8*sc); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.22)'; ctx.lineWidth=1.2;
    for(let x=-24*sc;x<24*sc;x+=7*sc){
      ctx.beginPath(); ctx.moveTo(x,-8*sc); ctx.lineTo(x+3*sc,20*sc); ctx.stroke();
    }

    /* Arms */
    [[-1,1],[1,-1]].forEach(([s,r],i)=>{
      const ax=s*30*sc, ay=-4*sc;
      ctx.fillStyle=fur;
      ctx.beginPath(); ctx.ellipse(ax,ay,8*sc,17*sc,r*.4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=furD;
      ctx.beginPath(); ctx.ellipse(ax+s*3*sc,12*sc,7*sc,5.5*sc,-r*.3,0,Math.PI*2); ctx.fill();
    });

    /* Head */
    const hG=ctx.createRadialGradient(-5*sc,-56*sc,4*sc,0,-53*sc,25*sc);
    hG.addColorStop(0,furL); hG.addColorStop(.6,fur); hG.addColorStop(1,furD);
    ctx.fillStyle=hG;
    ctx.beginPath(); ctx.arc(0,-54*sc,25*sc,0,Math.PI*2); ctx.fill();

    /* Ears */
    [-18,18].forEach(ex=>{
      ctx.fillStyle=fur;
      ctx.beginPath(); ctx.arc(ex*sc,-72*sc,10*sc,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#e09070';
      ctx.beginPath(); ctx.arc(ex*sc,-72*sc,6*sc,0,Math.PI*2); ctx.fill();
    });

    /* Muzzle */
    const mG=ctx.createRadialGradient(0,-45*sc,0,0,-46*sc,14*sc);
    mG.addColorStop(0,'#eac090'); mG.addColorStop(1,'#c89060');
    ctx.fillStyle=mG;
    ctx.beginPath(); ctx.ellipse(0,-45*sc,13*sc,10*sc,0,0,Math.PI*2); ctx.fill();

    /* Nose */
    ctx.fillStyle='#2a1500';
    ctx.beginPath(); ctx.ellipse(0,-49*sc,6*sc,4.5*sc,0,0,Math.PI*2); ctx.fill();

    /* Eyes */
    [-8,8].forEach(ex=>{
      ctx.fillStyle='#1a0800';
      ctx.beginPath(); ctx.ellipse(ex*sc,-58*sc,4*sc,4.5*sc,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(ex*sc+1.2*sc,-59.2*sc,1.5*sc,0,Math.PI*2); ctx.fill();
    });

    /* Smile */
    ctx.strokeStyle='#4a2000'; ctx.lineWidth=1.8*sc; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(-5*sc,-42*sc); ctx.quadraticCurveTo(0,-38*sc,5*sc,-42*sc); ctx.stroke();

    ctx.restore();
  }

  /* ═══ WAKE & SPRAY ══════════════════════════════════════════ */
  function drawWake(cx, cy, sc) {
    ctx.save(); ctx.translate(cx, cy);

    for (let i=0; i<3; i++) {
      const spread=(i+1)*18*sc, len=(65+i*32)*sc, al=.13-i*.04;
      ctx.globalAlpha=al+Math.sin(T*2+i)*.025;
      ctx.strokeStyle='#aaccff'; ctx.lineWidth=(3.5-i)*sc; ctx.lineCap='round';
      [-1,1].forEach(side=>{
        ctx.beginPath();
        ctx.moveTo(side*8*sc,12*sc);
        ctx.quadraticCurveTo(side*len*.45,14*sc+spread*.35,side*len,13*sc+spread);
        ctx.stroke();
      });
    }

    /* Foam */
    ctx.globalAlpha=.5;
    const fG=ctx.createRadialGradient(0,14*sc,1,0,14*sc,38*sc);
    fG.addColorStop(0,'rgba(190,215,255,.65)'); fG.addColorStop(1,'rgba(80,130,255,0)');
    ctx.fillStyle=fG;
    ctx.beginPath(); ctx.ellipse(0,16*sc,34*sc+Math.sin(T*3)*2.5*sc,9*sc,0,0,Math.PI*2); ctx.fill();
    ctx.restore();

    /* Spray */
    sprayTick++; if (sprayTick%2===0){ spawnSpray(cx-16,cy+12); spawnSpray(cx+16,cy+12); }
    SPRAY.forEach(p=>{
      if (p.life<=0) return;
      p.life--; p.x+=p.vx; p.y+=p.vy; p.vy+=.1;
      const prog=1-p.life/p.max;
      ctx.save(); ctx.globalAlpha=(1-prog)*.5;
      ctx.fillStyle=`rgba(${175+Math.random()*50|0},${205+Math.random()*30|0},255,1)`;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(1-prog*.4),0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }

  /* ═══ FRAME ═════════════════════════════════════════════════ */
  function frame() {
    mx += (tmx - mx) * .055;
    my += (tmy - my) * .055;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawBg();

    /* Position: centered in the canvas */
    const floatY = Math.sin(T*.55)*9 + Math.sin(T*.82)*3;
    const sc     = Math.min(W, H) / 480;
    const cx     = W * .5 + mx * 14;
    const cy     = H * .70 + floatY + my * 5;

    drawWake(cx, cy, sc);
    drawJetski(cx, cy, sc, mx);
    drawBear(cx, cy - 12*sc, sc, mx);

    T += .016;
  }

  /* ── RAF ─────────────────────────────────────────────────── */
  let last = 0, raf;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 14) return;
    last = now;
    frame();
  }
  raf = requestAnimationFrame(loop);
  window.PS5Hero = { stop: () => cancelAnimationFrame(raf), resize };
})();
