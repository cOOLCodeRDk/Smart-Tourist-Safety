(function(){
  "use strict";
  const svgNS = "http://www.w3.org/2000/svg";

  // ---------- Data ----------
  const NAMES = [
    {name:"Meera Kulkarni", nat:"IN", phone:"+91 98xxxxx210"},
    {name:"Daniel Osei", nat:"GH", phone:"+233 24xxxxx88"},
    {name:"Yuki Tanaka", nat:"JP", phone:"+81 90xxxxx445"},
    {name:"Sofia Almeida", nat:"PT", phone:"+351 91xxxxx302"},
    {name:"Arjun Mehta", nat:"IN", phone:"+91 99xxxxx761"},
    {name:"Liam Carter", nat:"AU", phone:"+61 4xxxxx119"},
    {name:"Priya Nair", nat:"IN", phone:"+91 97xxxxx055"},
    {name:"Hana Kovac", nat:"HR", phone:"+385 91xxxxx630"}
  ];
  const FLAG = {IN:"🇮🇳", GH:"🇬🇭", JP:"🇯🇵", PT:"🇵🇹", AU:"🇦🇺", HR:"🇭🇷"};
  const ITINERARIES = [
    "Day 1 — Laxman Jhula & riverside cafes. Day 2 — Forest trail trek. Day 3 — Departs Haridwar 18:40.",
    "Day 1 — Market lane, Tera Manzil temple. Day 2 — River-front yoga session. Day 3 — Rafting (guided).",
    "Solo trekker. Forest trail + riverbank camping, 2 nights. Check-in due 20:00 daily.",
    "Group tour (6 pax). Market lane shopping, temple visit, evening Ganga aarti."
  ];

  function hashId(str){
    let h = 0;
    for (let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
    return "TID-" + h.toString(16).toUpperCase().padStart(8,"0").slice(0,8) + "-" + (h % 97).toString(16).toUpperCase().padStart(2,"0");
  }

  const SAFE_WAYPOINTS = [
    {x:120,y:90},{x:200,y:140},{x:330,y:230},{x:400,y:260},
    {x:360,y:380},{x:430,y:400},{x:250,y:350},{x:600,y:130},
    {x:650,y:380},{x:150,y:220},{x:480,y:180}
  ];
  const SAFE_POINTS = [
    {name:"Market Lane safe zone", x:410, y:385},
    {name:"Forest Trail base camp", x:130, y:140}
  ];
  const RISK_POLY = [[480,255],[560,240],[610,300],[560,340],[500,320]];
  const BUFFER_POLY = [[450,220],[590,200],[650,300],[590,370],[465,345],[435,285]];

  function pointInPoly(pt, poly){
    let inside = false;
    for (let i=0, j=poly.length-1; i<poly.length; j=i++){
      const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
      const intersect = ((yi>pt.y) !== (yj>pt.y)) && (pt.x < (xj-xi)*(pt.y-yi)/(yj-yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  let tourists = NAMES.map((p, i) => {
    const start = SAFE_WAYPOINTS[i % SAFE_WAYPOINTS.length];
    return {
      id: hashId(p.name + i), name: p.name, nat: p.nat, phone: p.phone,
      x: start.x, y: start.y, tx: start.x, ty: start.y,
      status: "safe", score: 80 + Math.floor(Math.random()*15),
      itinerary: ITINERARIES[i % ITINERARIES.length],
      lastCheckIn: "Just now", lastPing: "—", verified: true,
      isSelf: i === 0, _warned: false
    };
  });

  let patrols = [
    {id:"P1", x:150, y:420, tx:150, ty:420, busy:false, target:null},
    {id:"P2", x:660, y:130, tx:660, ty:130, busy:false, target:null}
  ];

  let alerts = [];
  let selectedId = tourists[0].id;
  let alertSeq = 0;

  // ---------- DOM refs ----------
  const rosterEl = document.getElementById("roster");
  const rosterCountEl = document.getElementById("roster-count");
  const alertFeedEl = document.getElementById("alertFeed");
  const alertCountEl = document.getElementById("alert-count");
  const detailEl = document.getElementById("detail");
  const markersG = document.getElementById("markers");
  const searchInput = document.getElementById("searchInput");
  const mapFrame = document.getElementById("mapFrame");
  const mapWrapOriginal = document.getElementById("mapWrapOriginal");
  const phoneMapSlot = document.getElementById("phoneMapSlot");

  function statusColor(status){
    return status === "alert" ? "var(--danger)" : status === "caution" ? "var(--caution)" : "var(--safe)";
  }
  function timeNow(){
    const d = new Date();
    return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  }
  function nearestSafe(t){
    let best=null, bd=Infinity;
    SAFE_POINTS.forEach(p=>{ const d=Math.hypot(p.x-t.x,p.y-t.y); if(d<bd){bd=d;best=p;} });
    const meters = Math.round(bd*2);
    const mins = Math.max(1, Math.round(meters/80));
    return {name:best.name, meters, mins};
  }

  // ---------- Rendering: control room ----------
  function renderStats(){
    document.getElementById("stat-total").textContent = tourists.length;
    document.getElementById("stat-alerts").textContent = tourists.filter(t=>t.status==="alert").length;
    const avg = Math.round(tourists.reduce((s,t)=>s+t.score,0)/tourists.length);
    document.getElementById("stat-score").textContent = avg;
  }

  function renderRoster(){
    const q = searchInput.value.trim().toLowerCase();
    const list = tourists.filter(t => !q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    rosterCountEl.textContent = list.length + " / " + tourists.length;
    rosterEl.innerHTML = "";
    list.forEach(t=>{
      const row = document.createElement("div");
      row.className = "roster-item" + (t.id===selectedId ? " active" : "");
      row.innerHTML = `
        <span class="status-dot ${t.status}"></span>
        <div class="roster-text">
          <span class="roster-name">${t.isSelf ? '<span class="you-tag">YOU · </span>' : ""}${FLAG[t.nat]||""} ${t.name}</span>
          <span class="roster-meta">${t.id}</span>
        </div>
        <span class="roster-score">${t.score}</span>
      `;
      row.addEventListener("click", ()=>{ selectedId = t.id; renderAll(); });
      rosterEl.appendChild(row);
    });
  }

  function renderMarkers(){
    markersG.innerHTML = "";
    tourists.forEach(t=>{
      const isSel = t.id===selectedId;
      const c = statusColor(t.status);
      const g = document.createElementNS(svgNS,"g");
      if (t.status === "alert"){
        const halo = document.createElementNS(svgNS,"circle");
        halo.setAttribute("cx", t.x); halo.setAttribute("cy", t.y); halo.setAttribute("r", 13);
        halo.setAttribute("fill", "none"); halo.setAttribute("stroke", "#EF4444"); halo.setAttribute("stroke-width","2"); halo.setAttribute("opacity","0.55");
        halo.innerHTML = `<animate attributeName="r" values="8;16;8" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0;0.6" dur="1.4s" repeatCount="indefinite"/>`;
        g.appendChild(halo);
      }
      const dot = document.createElementNS(svgNS,"circle");
      dot.setAttribute("cx", t.x); dot.setAttribute("cy", t.y);
      dot.setAttribute("r", isSel ? 7 : 5.5);
      dot.setAttribute("fill", c);
      dot.setAttribute("stroke", t.isSelf ? "#fff" : (isSel ? "#fff" : "#0B1220"));
      dot.setAttribute("stroke-width", isSel ? 2 : (t.isSelf ? 1.6 : 1.2));
      dot.style.cursor = "pointer";
      dot.addEventListener("click", ()=>{ selectedId = t.id; renderAll(); });
      g.appendChild(dot);
      markersG.appendChild(g);
    });
    patrols.forEach(p=>{
      const s=6;
      const tri = document.createElementNS(svgNS,"polygon");
      tri.setAttribute("points", `${p.x},${p.y-s} ${p.x-s},${p.y+s} ${p.x+s},${p.y+s}`);
      tri.setAttribute("fill", p.busy ? "#5B8CFF" : "#385075");
      tri.setAttribute("stroke", "#0B1220");
      tri.setAttribute("stroke-width", "1");
      markersG.appendChild(tri);
    });
  }

  function severityClass(sev){
    return sev === "danger" ? "sev-danger" : sev === "caution" ? "sev-caution" : "sev-info";
  }

  function renderAlerts(){
    alertCountEl.textContent = alerts.length + " logged";
    if (alerts.length === 0){
      alertFeedEl.innerHTML = `<div class="alert-empty">No active alerts. Grid is quiet.</div>`;
      return;
    }
    alertFeedEl.innerHTML = "";
    alerts.slice(0,10).forEach(a=>{
      const card = document.createElement("div");
      card.className = "alert-card " + severityClass(a.severity);
      card.innerHTML = `
        <div class="alert-top">
          <span class="alert-who">${a.who}</span>
          <span class="alert-time">${a.time}</span>
        </div>
        <div class="alert-msg">${a.msg}</div>
        ${(!a.resolved && !a.dispatched) ? `<button class="alert-action" data-alert="${a.uid}">Dispatch nearest patrol</button>` : ""}
      `;
      if (!a.resolved && !a.dispatched){
        card.querySelector(".alert-action").addEventListener("click", ()=> dispatchPatrol(a.uid));
      }
      alertFeedEl.appendChild(card);
    });
  }

  function gaugeArc(score){
    const r = 26, circumference = Math.PI * r;
    const frac = Math.max(0, Math.min(1, score/100));
    const dash = circumference * frac;
    const color = score >= 70 ? "#2DD4BF" : score >= 40 ? "#F5A524" : "#EF4444";
    return `
      <svg width="64" height="40" viewBox="0 0 64 40">
        <path d="M 6 32 A 26 26 0 0 1 58 32" stroke="var(--line-strong)" stroke-width="6" fill="none" stroke-linecap="round"/>
        <path d="M 6 32 A 26 26 0 0 1 58 32" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${dash} ${circumference}"/>
      </svg>
    `;
  }

  function renderDetail(){
    const t = tourists.find(x=>x.id===selectedId);
    if (!t){ detailEl.innerHTML = ""; return; }
    detailEl.innerHTML = `
      <div class="detail-head">
        <div>
          <div class="detail-name">${t.isSelf ? "YOU · " : ""}${FLAG[t.nat]||""} ${t.name}</div>
          <div class="id-hash">${t.id}</div>
        </div>
        <div class="verified">${t.verified ? "✓ KYC verified" : "Unverified"}</div>
      </div>
      <div class="gauge-row">
        ${gaugeArc(t.score)}
        <div>
          <div class="gauge-num">${t.score}</div>
          <div class="gauge-label">safety score</div>
        </div>
      </div>
      <div class="detail-grid">
        <div><div class="dg-label">Status</div><div class="dg-value" style="color:${statusColor(t.status)}">${t.status}</div></div>
        <div><div class="dg-label">Last ping</div><div class="dg-value">${t.lastPing}</div></div>
        <div><div class="dg-label">Emergency contact</div><div class="dg-value">${t.phone}</div></div>
        <div><div class="dg-label">Nationality</div><div class="dg-value">${t.nat}</div></div>
      </div>
      <div class="itinerary"><strong style="color:var(--text)">Itinerary —</strong> ${t.itinerary}</div>
    `;
  }

  // ---------- Rendering: tourist app ----------
  function renderTouristApp(){
    const me = tourists.find(t=>t.isSelf);
    const pill = document.getElementById("meStatusPill");
    pill.textContent = me.status.toUpperCase();
    pill.className = "phone-status-pill " + (me.status!=="safe" ? me.status : "");

    const banner = document.getElementById("warningBanner");
    banner.className = "warning-banner show-" + me.status;
    if (me.status==="alert") banner.textContent = "You've entered a restricted zone or triggered SOS. Control room has been notified — stay where you are if it's safe to do so.";
    else if (me.status==="caution") banner.textContent = "You're nearing a restricted area or inactive for a while. Consider heading back toward a safe zone.";
    else banner.textContent = "All clear — you're inside a monitored safe area.";

    const ns = nearestSafe(me);
    document.getElementById("nearestSafe").innerHTML = `Nearest safe zone: <b>${ns.name}</b> — about ${ns.meters} m (~${ns.mins} min walk)`;
    document.getElementById("meContactPhone").textContent = me.phone;
  }

  function renderAll(){
    renderStats();
    renderRoster();
    renderMarkers();
    renderAlerts();
    renderDetail();
    renderTouristApp();
  }

  // ---------- Alerts / dispatch ----------
  function pushAlert(t, type, msg, severity){
    alertSeq++;
    alerts.unshift({ uid: alertSeq, touristId: t.id, who: t.name, type, msg, severity, time: timeNow(), resolved:false, dispatched:false });
    alerts = alerts.slice(0,30);
  }

  function dispatchPatrol(uid){
    const a = alerts.find(x=>x.uid===uid);
    if (!a || a.resolved || a.dispatched) return;
    const t = tourists.find(x=>x.id===a.touristId);
    if (!t) return;
    let patrol = patrols.find(p=>!p.busy) || patrols[0];
    patrol.busy = true; patrol.target = t.id; patrol.tx = t.x; patrol.ty = t.y;
    a.dispatched = true; a.alertUid = uid;
    a.msg += ` — ${patrol.id} dispatched, ETA ~15s (sim).`;
    renderAlerts();
  }

  document.getElementById("sosBtn").addEventListener("click", ()=>{
    const t = tourists.find(x=>x.id===selectedId) || tourists[0];
    t.status = "alert"; t.score = Math.max(10, t.score - 35);
    pushAlert(t, "sos", "Manual SOS triggered from device. Immediate response required.", "danger");
    renderAll();
  });

  searchInput.addEventListener("input", renderRoster);

  // ---- Tourist app: hold-to-confirm SOS ----
  let holdTimer=null, holdStart=0;
  const meSosBtn = document.getElementById("meSosBtn");
  const sosProgress = document.getElementById("sosProgress");
  function startHold(e){
    e.preventDefault();
    holdStart = Date.now();
    holdTimer = setInterval(()=>{
      const pct = Math.min(100, (Date.now()-holdStart)/1000*100);
      sosProgress.style.width = pct+"%";
      if (pct>=100){ clearInterval(holdTimer); holdTimer=null; sosProgress.style.width="0%"; triggerMeSOS(); }
    }, 30);
  }
  function cancelHold(){ if (holdTimer){ clearInterval(holdTimer); holdTimer=null; } sosProgress.style.width="0%"; }
  meSosBtn.addEventListener("pointerdown", startHold);
  meSosBtn.addEventListener("pointerup", cancelHold);
  meSosBtn.addEventListener("pointerleave", cancelHold);
  function triggerMeSOS(){
    const me = tourists.find(t=>t.isSelf);
    me.status="alert"; me.score=Math.max(10, me.score-35);
    pushAlert(me, "sos", "Manual SOS triggered from device. Immediate response required.", "danger");
    renderAll();
  }

  document.querySelectorAll(".sec-btn").forEach(b=>{
    b.addEventListener("click", ()=>{
      const type = b.dataset.report;
      const me = tourists.find(t=>t.isSelf);
      if (type==="theft"){ me.status="alert"; me.score=Math.max(15,me.score-15); pushAlert(me,"theft","Theft reported by tourist. Nearest patrol notified.","danger"); }
      if (type==="accident"){ me.status="alert"; me.score=Math.max(15,me.score-20); pushAlert(me,"accident","Accident/injury reported. Medical response requested.","danger"); }
      if (type==="unsafe"){ me.status="caution"; pushAlert(me,"unsafe","Tourist reported feeling unsafe in current area.","caution"); }
      renderAll();
    });
  });

  // ---- View toggle ----
  document.querySelectorAll(".seg-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".seg-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      document.body.dataset.view = view;
      if (view==="tourist"){ phoneMapSlot.appendChild(mapFrame); }
      else { mapWrapOriginal.appendChild(mapFrame); }
      renderAll();
    });
  });

  // ---------- Simulation loop ----------
  function moveEntity(e, speed){
    const dx=e.tx-e.x, dy=e.ty-e.y;
    const dist=Math.hypot(dx,dy);
    if (dist>3){ e.x += dx*speed; e.y += dy*speed; }
    return dist;
  }

  function updateZoneStatus(t){
    const inRisk = pointInPoly({x:t.x,y:t.y}, RISK_POLY);
    const inBuffer = !inRisk && pointInPoly({x:t.x,y:t.y}, BUFFER_POLY);

    if (inRisk){
      if (t.status !== "alert"){
        t.status = "alert"; t.score = Math.max(15, t.score - 20);
        pushAlert(t, "geofence", "Geofence breach — entered Rapids restricted zone.", "danger");
      }
      t._warned = true;
    } else if (inBuffer){
      if (!t._warned && t.status !== "alert"){
        t.status = "caution";
        pushAlert(t, "geofence-early", "Approaching restricted zone — early warning issued.", "caution");
        t._warned = true;
      }
    } else {
      t._warned = false;
      if (t.status === "caution") t.status = "safe";
    }
  }

  function tickPatrols(){
    patrols.forEach(p=>{
      if (p.busy && p.target){
        const t = tourists.find(x=>x.id===p.target);
        if (t){ p.tx = t.x; p.ty = t.y; }
        const dist = moveEntity(p, 0.14);
        if (dist < 12){
          if (t){
            t.status = "safe"; t._warned = false;
            t.score = Math.min(95, t.score + 18);
            t.lastCheckIn = "Just now";
            pushAlert(t, "resolved", `${p.id} reached location. Tourist confirmed safe.`, "info");
            const a = alerts.find(al=>al.touristId===t.id && al.dispatched && !al.resolved);
            if (a) a.resolved = true;
          }
          p.busy = false; p.target = null;
          p.tx = 100 + Math.random()*600; p.ty = 100 + Math.random()*300;
        }
      } else {
        moveEntity(p, 0.03);
        if (Math.hypot(p.tx-p.x, p.ty-p.y) < 3){
          p.tx = 100 + Math.random()*600; p.ty = 100 + Math.random()*300;
        }
      }
    });
  }

  function tick(){
    tourists.forEach(t=>{
      const dx = t.tx - t.x, dy = t.ty - t.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4){
        const wander = Math.random();
        if (wander < 0.12){ t.tx = 500 + Math.random()*90; t.ty = 250 + Math.random()*70; }
        else {
          const wp = SAFE_WAYPOINTS[Math.floor(Math.random()*SAFE_WAYPOINTS.length)];
          t.tx = wp.x + (Math.random()*20-10); t.ty = wp.y + (Math.random()*20-10);
        }
      } else { t.x += dx * 0.08; t.y += dy * 0.08; }

      updateZoneStatus(t);

      if (t.status === "safe" && Math.random() < 0.01){
        t.status = "caution"; t.lastCheckIn = "4 min ago";
        pushAlert(t, "inactivity", "No motion detected for 12+ minutes. Flagged for check.", "caution");
        setTimeout(()=>{ if (t.status==="caution"){ t.status="safe"; t.lastCheckIn="Just now"; renderAll(); } }, 6000);
      }
      t.lastPing = timeNow();
    });
    tickPatrols();
    renderAll();
  }

  renderAll();
  setInterval(tick, 1800);

})();
