/* PS5 Hero — Canvas 2D, zero deps, works file:// */
(function () {
  'use strict';

  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, DPR;
  let mx = 0, my = 0, tmx = 0, tmy = 0; // -1..+1 normalised mouse
  let T  = 0;
  let raf;

  /* ── Size canvas to window ───────────────────────────── */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W   = window.innerWidth;
    H   = window.innerHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Input ───────────────────────────────────────────── */
  window.addEventListener('mousemove', e => {
    tmx = (e.clientX / W) * 2 - 1;
    tmy = (e.clientY / H) * 2 - 1;
  });
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', e => {
      tmx = Math.max(-1, Math.min(1, (e.gamma || 0) / 40));
      tmy = Math.max(-1, Math.min(1, ((e.beta  || 20) - 20) / 40));
    }, { passive: true });
  }

  /* ── Particles ───────────────────────────────────────── */
  const PCOUNT = 90;
  const parts  = [];
  for (let i = 0; i < PCOUNT; i++) {
    parts.push({
      x:     Math.random(),
      y:     Math.random(),
      r:     0.8 + Math.random() * 2,
      vy:    0.00018 + Math.random() * 0.00028,
      vx:    (Math.random() - .5) * 0.00012,
      a:     0.18 + Math.random() * 0.55,
      hue:   205 + Math.random() * 35,
      ph:    Math.random() * 6.28,
    });
  }

  /* ── PS symbols orbit ────────────────────────────────── */
  const SYMS = [
    { ch: '△', col: '#3fc4a0', ang: 0.00 },
    { ch: '○', col: '#ff4d6d', ang: 1.57 },
    { ch: '✕', col: '#5588ff', ang: 3.14 },
    { ch: '□', col: '#bb77ff', ang: 4.71 },
  ];

  /* ── roundRect polyfill ──────────────────────────────── */
  function rr(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* ════════════════════════════════════════════════════════
     DRAW PS5
     ════════════════════════════════════════════════════════ */
  function drawConsole(cx, cy, sc, tilX, tilY) {
    ctx.save();
    ctx.translate(cx, cy);
    // 3D tilt via transform
    ctx.transform(1, tilY * 0.03, tilX * 0.055, 1, tilX * 9 * sc, tilY * 5 * sc);

    const bh = 190 * sc;  // half-height of body
    const bw = 27  * sc;  // half-width of dark centre

    /* SHADOW */
    const sh = ctx.createRadialGradient(0, bh + 18*sc, 2, 0, bh + 18*sc, 110*sc);
    sh.addColorStop(0, 'rgba(0,10,50,.65)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(0, bh + 20*sc, 100*sc, 18*sc, 0, 0, Math.PI*2);
    ctx.fill();

    /* STAND */
    const stG = ctx.createLinearGradient(-32*sc, bh, 32*sc, bh+18*sc);
    stG.addColorStop(0, '#1c2240'); stG.addColorStop(1, '#0b0e20');
    ctx.fillStyle = stG;
    rr(-30*sc, bh, 60*sc, 14*sc, 7*sc); ctx.fill();
    rr(-20*sc, bh+14*sc, 40*sc, 7*sc, 4*sc);
    ctx.fillStyle = '#090d1c'; ctx.fill();

    /* DARK BODY */
    const bG = ctx.createLinearGradient(-bw, -bh, bw*2, bh);
    bG.addColorStop(0, '#151a2e'); bG.addColorStop(.5, '#0d1120'); bG.addColorStop(1, '#07091a');
    ctx.fillStyle = bG;
    rr(-bw, -bh, bw*2, bh*2, 5*sc); ctx.fill();
    ctx.strokeStyle = 'rgba(30,55,130,.35)'; ctx.lineWidth = 1; ctx.stroke();

    /* WHITE LEFT WING */
    drawWing(sc, bh, bw, -1, tilX);
    /* WHITE RIGHT WING */
    drawWing(sc, bh, bw, +1, tilX);

    /* LED GLOW HALO */
    const led = 0.72 + Math.sin(T*3.2)*.18 + Math.sin(T*5.9)*.07;
    ctx.save();
    const hG = ctx.createLinearGradient(-22*sc, 0, 22*sc, 0);
    hG.addColorStop(0, 'rgba(0,40,200,0)');
    hG.addColorStop(.5, `rgba(46,125,255,${.22*led})`);
    hG.addColorStop(1, 'rgba(0,40,200,0)');
    ctx.fillStyle = hG; ctx.fillRect(-22*sc, -bh, 44*sc, bh*2);
    ctx.restore();

    /* LED STRIP */
    ctx.save();
    const lG = ctx.createLinearGradient(0, -bh, 0, bh);
    lG.addColorStop(0,   `rgba(120,190,255,${.55*led})`);
    lG.addColorStop(.5,  `rgba(46,125,255,${led})`);
    lG.addColorStop(1,   `rgba(120,190,255,${.55*led})`);
    ctx.fillStyle = lG;
    rr(-3.5*sc, -bh*.97, 7*sc, bh*1.94, 3.5*sc); ctx.fill();
    // bright centre line
    ctx.fillStyle = `rgba(210,235,255,${.4*led})`;
    rr(-1.5*sc, -bh*.88, 3*sc, bh*1.76, 1.5*sc); ctx.fill();
    ctx.restore();

    /* DISK SLOT */
    ctx.fillStyle = '#040710';
    rr(-bw, -14*sc, bw*.85, 5*sc, 2.5*sc); ctx.fill();
    ctx.fillStyle = `rgba(46,125,255,${.35*led})`;
    ctx.fillRect(-bw+2*sc, -12*sc, bw*.75, .9*sc);

    /* USB PORTS */
    ctx.fillStyle = '#060918';
    rr(-bw+2*sc, -bh*.58, 11*sc, 4.5*sc, 2*sc); ctx.fill();
    rr(-bw+2*sc, -bh*.47, 8*sc, 3.5*sc, 1.5*sc); ctx.fill();

    /* POWER BUTTON */
    ctx.beginPath();
    ctx.arc(23*sc, -bh*.58, 5*sc, 0, Math.PI*2);
    ctx.fillStyle = '#08101e'; ctx.fill();
    ctx.strokeStyle = 'rgba(40,80,180,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath();
    ctx.arc(23*sc, -bh*.58, 2*sc, 0, Math.PI*2);
    ctx.fillStyle = `rgba(100,190,255,${.65+.35*led})`; ctx.fill();

    /* EJECT BUTTON */
    ctx.beginPath();
    ctx.arc(23*sc, -bh*.44, 4*sc, 0, Math.PI*2);
    ctx.fillStyle = '#0a1122'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = .8; ctx.stroke();

    /* PS text */
    ctx.save();
    ctx.font = `${5.5*sc}px Inter,Arial,sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PLAYSTATION', 0, bh*.62);
    ctx.restore();

    ctx.restore();
  }

  function drawWing(sc, bh, bw, side, tilX) {
    const pw = 82 * sc;
    const bx = side * bw;
    ctx.save();

    ctx.beginPath();
    if (side < 0) {
      ctx.moveTo(bx, -bh);
      ctx.bezierCurveTo(bx-8*sc, -bh*.88, bx-pw, -bh*.52, bx-pw*1.08, 0);
      ctx.bezierCurveTo(bx-pw*1.14, bh*.52, bx-pw*.78, bh*.88, bx-8*sc, bh);
      ctx.lineTo(bx, bh);
    } else {
      ctx.moveTo(bx, -bh);
      ctx.bezierCurveTo(bx+8*sc, -bh*.88, bx+pw, -bh*.52, bx+pw*1.08, 0);
      ctx.bezierCurveTo(bx+pw*1.14, bh*.52, bx+pw*.78, bh*.88, bx+8*sc, bh);
      ctx.lineTo(bx, bh);
    }
    ctx.closePath();

    // Base fill
    const x0 = side < 0 ? bx-pw*1.14 : bx;
    const x1 = side < 0 ? bx : bx+pw*1.14;
    const wG = ctx.createLinearGradient(x0, -bh*.5, x1, bh*.5);
    wG.addColorStop(0,   '#eef2ff');
    wG.addColorStop(.35, '#dce2f8');
    wG.addColorStop(.75, '#c6ccea');
    wG.addColorStop(1,   '#adb4d6');
    ctx.fillStyle = wG; ctx.fill();

    // Specular shine — shifts with mouse
    ctx.save(); ctx.clip();
    const shine = tilX * side;
    const sG = ctx.createLinearGradient(x0, -bh, x1, bh*.2);
    sG.addColorStop(0,    `rgba(255,255,255,${.32 + shine*.18})`);
    sG.addColorStop(.35,  `rgba(255,255,255,${.08})`);
    sG.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = sG; ctx.fill();
    ctx.restore();

    // Edge bevel
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Inner shadow near body
    ctx.save(); ctx.clip();
    const iG = ctx.createLinearGradient(bx, 0, bx - side*14*sc, 0);
    iG.addColorStop(0, 'rgba(0,0,0,.22)'); iG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = iG; ctx.fillRect(Math.min(x0,x1)-2, -bh, Math.abs(x1-x0)+4, bh*2);
    ctx.restore();

    ctx.restore();
  }

  /* ════════════════════════════════════════════════════════
     FRAME
     ════════════════════════════════════════════════════════ */
  function frame() {
    // Lerp mouse
    mx += (tmx - mx) * .055;
    my += (tmy - my) * .055;

    // Clear
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* ── BACKGROUND ─────────────────────────────────────── */
    const bg = ctx.createRadialGradient(W*.5, H*.4, 0, W*.5, H*.4, Math.max(W,H)*.9);
    bg.addColorStop(0,   '#0c1840');
    bg.addColorStop(.45, '#060d24');
    bg.addColorStop(1,   '#020510');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Atmospheric glow spot
    const ag = ctx.createRadialGradient(W*.5+mx*30, H*.42+my*20, 0, W*.5, H*.42, W*.55);
    ag.addColorStop(0,   `rgba(18,55,155,${.20 + Math.sin(T*.6)*.05})`);
    ag.addColorStop(.6,  'rgba(8,25,80,.08)');
    ag.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);

    /* ── GRID ────────────────────────────────────────────── */
    ctx.save();
    ctx.globalAlpha = .038;
    ctx.strokeStyle = '#2255bb'; ctx.lineWidth = .6;
    const gs = Math.min(W,H)/14;
    for (let x=0; x<W; x+=gs){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y=0; y<H; y+=gs){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.restore();

    /* ── PARTICLES ───────────────────────────────────────── */
    parts.forEach(p => {
      p.y -= p.vy;
      p.x += p.vx + mx * .00012;
      if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
      if (p.x < -.02) p.x = 1.02;
      if (p.x >  1.02) p.x = -.02;
      const pulse = .6 + Math.sin(T*1.1 + p.ph) * .4;
      ctx.save();
      ctx.globalAlpha = p.a * pulse;
      ctx.fillStyle = `hsl(${p.hue},90%,70%)`;
      ctx.beginPath();
      ctx.arc(p.x*W, p.y*H, p.r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    /* ── CONSOLE POSITION ────────────────────────────────── */
    const floatY = Math.sin(T*.55)*12 + Math.sin(T*.83)*4;
    const sc     = Math.min(W, H) / 500;
    const cx     = W*.5 + mx*14;
    const cy     = H*.43 + floatY + my*7;

    /* ── ENERGY RINGS ────────────────────────────────────── */
    const ringDefs = [
      { s:.90, sp:.006, ph:0.0,  op:.16 },
      { s:1.22, sp:.005, ph:1.2,  op:.12 },
      { s:1.56, sp:.004, ph:2.4,  op:.09 },
      { s:1.94, sp:.003, ph:3.6,  op:.065 },
      { s:2.38, sp:.002, ph:4.8,  op:.04 },
    ];
    ringDefs.forEach((r, i) => {
      const pulse = .45 + Math.sin(T*r.sp*55 + r.ph) * .55;
      const rw    = 88 * sc * r.s;
      const rh    = 24 * sc * r.s;
      const rot   = T * .045 * (i%2===0?1:-1) + r.ph;
      ctx.save();
      ctx.translate(cx, cy + 28*sc);
      ctx.rotate(rot);
      ctx.globalAlpha = r.op * pulse;
      ctx.strokeStyle = `hsl(${218+i*7},90%,68%)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(0, 0, rw, rh, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha = r.op * pulse * .35;
      ctx.beginPath();
      ctx.ellipse(0, 0, rw*1.07, rh*1.07, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    });

    /* ── SCAN LINES ──────────────────────────────────────── */
    [-0.15, -0.07, 0, .07, .14, .22].forEach((yo, i) => {
      const yp  = H * (.44 + yo + Math.sin(T*.35+i)*0.012);
      const alp = (.04 + Math.sin(T*.8+i*1.1)*.035) * (1 - Math.abs(my)*.4);
      const lw  = W * .6;
      const lx  = (W - lw) * .5;
      ctx.save();
      ctx.globalAlpha = alp;
      const lg = ctx.createLinearGradient(lx, 0, lx+lw, 0);
      lg.addColorStop(0,   'rgba(0,80,255,0)');
      lg.addColorStop(.28, 'rgba(46,125,255,.9)');
      lg.addColorStop(.72, 'rgba(46,125,255,.9)');
      lg.addColorStop(1,   'rgba(0,80,255,0)');
      ctx.strokeStyle = lg; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(lx, yp); ctx.lineTo(lx+lw, yp); ctx.stroke();
      ctx.restore();
    });

    /* ── PS5 CONSOLE ─────────────────────────────────────── */
    drawConsole(cx, cy, sc, mx, my);

    /* ── LIGHT RAYS ──────────────────────────────────────── */
    const led = .72 + Math.sin(T*3.2)*.18;
    for (let i=0; i<5; i++) {
      const ang = (i/5)*Math.PI*2 + T*.07;
      const len = (68 + Math.sin(T*.9+i)*18) * sc;
      const alp = (.025 + Math.sin(T*.55+i*1.3)*.018) * led;
      ctx.save();
      ctx.globalAlpha = alp;
      const rg = ctx.createLinearGradient(cx, cy, cx+Math.cos(ang)*len, cy+Math.sin(ang)*len*.38);
      rg.addColorStop(0, 'rgba(46,125,255,.9)');
      rg.addColorStop(1, 'rgba(0,60,200,0)');
      ctx.strokeStyle = rg;
      ctx.lineWidth = (3.2+Math.sin(T+i)*1.2)*sc;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx+Math.cos(ang)*len, cy+Math.sin(ang)*len*.38);
      ctx.stroke();
      ctx.restore();
    }

    /* ── RISING CORE PARTICLES ───────────────────────────── */
    for (let i=0; i<10; i++) {
      const prog = ((T*.42 + i/10) % 1);
      const ang2 = (i/10)*Math.PI*2 + T*.25;
      const px   = cx + Math.cos(ang2)*18*sc*(1-prog);
      const py   = cy - prog*170*sc;
      ctx.save();
      ctx.globalAlpha = (1-prog)*.7;
      ctx.fillStyle   = `hsl(${215+prog*25},88%,72%)`;
      ctx.shadowColor = '#2277ff'; ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(px, py, (2.2-prog*1.7)*sc, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    /* ── PS SYMBOLS ──────────────────────────────────────── */
    const symR = 108 * sc;
    SYMS.forEach((s, i) => {
      s.ang += .0008 + i*.0002;
      const life = .5 + Math.sin(T*.65 + i*1.6)*.5;
      const sx = cx + Math.cos(s.ang)*symR*(1+mx*.07);
      const sy = cy + Math.sin(s.ang)*symR*.34 + floatY*.28;
      const fs = (12+life*5)*sc;
      ctx.save();
      ctx.globalAlpha = life * .58;
      ctx.font         = `bold ${fs}px Arial`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = s.col; ctx.shadowBlur = 14*sc;
      ctx.fillStyle    = s.col;
      ctx.fillText(s.ch, sx, sy);
      ctx.restore();
    });

    T += .016;
  }

  /* ── RAF ─────────────────────────────────────────────── */
  let last = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 14) return; // ~60fps cap
    last = now;
    if (canvas.style.opacity !== '0') frame();
  }
  raf = requestAnimationFrame(loop);

  window.PS5Hero = { stop: () => cancelAnimationFrame(raf) };
})();
