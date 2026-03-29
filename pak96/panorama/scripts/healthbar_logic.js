'use strict';
(function () {

  // ── Config (IDs must match menuConfig element IDs below) ────────────────────
  var CONFIG = {
    ENABLED:       true,
    MODE:          1,        // 0 = Fixed, 1 = Gradient
    LOW:           25,
    HIGH:          65,
    COLOR_LOW:     "#E16161",
    COLOR_MID:     "#FF7B00",
    COLOR_HIGH:    "#00FF00",
    COLOR_NEUTRAL: "#5BEFB5",
    TEAM_COLORS:   false
  };

  // ── Color helpers ────────────────────────────────────────────────────────────
  var TEAM1_HIGH = "rgb(255,201,97)";
  var TEAM2_HIGH = "rgb(100,133,252)";
  var LP = 'low_hp_bar_pulse', LTX = 'low_hp_text_large', LS = 'low_hp_ult_static';

  function hexToRgb(s) {
    if (!s) return [255,255,255];
    if (s.charAt(0) === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    }
    var m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return [+m[1], +m[2], +m[3]];
    return [255,255,255];
  }

  function rg(c) { return 'rgb('+c[0]+','+c[1]+','+c[2]+')'; }
  function lerp(a,b,t) { return (a+(b-a)*t)|0; }
  function ip(c1,c2,t) { return [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t)]; }
  function darkOf(c) { return [(c[0]*0.37)|0, (c[1]*0.29)|0, (c[2]*0.29)|0]; }
  function getHighColor() {
    if (!CONFIG.TEAM_COLORS) return CONFIG.COLOR_HIGH;
    return tid === 2 ? TEAM2_HIGH : TEAM1_HIGH;
  }

  // ── Panel cache ──────────────────────────────────────────────────────────────
  var ctx = $.GetContextPanel();
  var us=null,hc=null,pl=null,lb=null,lbp=null,rb=null,cp=null,ui=null;
  var cached=0, att=0;

  function fRB() {
    return ctx.FindChildTraverse('unit_healthbar_lagging') ||
           ctx.FindChildTraverse('health_bar') ||
           ctx.FindChildTraverse('unit_health');
  }

  function tryCache() {
    if (cached) return 1;
    if (att >= 10) return 0;
    att++;
    if (!us||!us.IsValid()) us=ctx.FindChildTraverse('UnitStatus');
    if (!us) return 0;
    if (!hc||!hc.IsValid()) hc=us.FindChildTraverse('hp_counter');
    if (!pl||!pl.IsValid()) pl=us.FindChildTraverse('unit_healthbar_pip_label');
    if (!lb||!lb.IsValid()) lb=us.FindChildTraverse('unit_healthbar_lagging');
    if (lb&&(!lbp||!lbp.IsValid())) lbp=lb.GetParent();
    if (pl&&lb&&lbp) { cached=1; return 1; }
    return 0;
  }

  // ── Team scan ────────────────────────────────────────────────────────────────
  var tid=0, fl=0, lAT=0;

  function scan(p) {
    var t=0,f=0,d=0,c=p;
    while (c&&d<10) {
      if (c.BHasClass) {
        if (!t) { if (c.BHasClass('team2')) t=2; else if (c.BHasClass('team1')) t=1; }
        if (!(f&1)&&c.BHasClass('enemy')) f|=1;
        if (!(f&2)&&(c.BHasClass('team_neutral')||c.BHasClass('neutral'))) f|=2;
        if (t&&(f&3)) break;
      }
      if (!c.GetParent) break;
      c=c.GetParent(); d++;
    }
    tid=t; fl=f;
  }

  // ── Setters ──────────────────────────────────────────────────────────────────
  var lCol=null,lUlt=null,lTxt=null,lSH=-1,lSM=-1,lVis=null,lTx=null,cMax=0;

  function sBC(c) { if (lCol!==c&&rb) { rb.style.washColor=c; lCol=c; } }
  function sUC(c) {
    if (!ui||!ui.IsValid()) ui=ctx.FindChildTraverse('unit_ult_ready_icon')||ctx.FindChildTraverse('ult_icon');
    if (!ui||!ui.style) return;
    if (lUlt!==c) { ui.style.washColor=c; lUlt=c; }
  }
  function sTC(c) { if (!hc||!hc.style) return; if (lTxt!==c) { hc.style.washColor=c; lTxt=c; } }

  function pMax(t) {
    if (t===lTx) return cMax;
    lTx=t; var p=0,q=0,li=t.lastIndexOf('|');
    for (var i=0;i<t.length;i++) { var c=t.charCodeAt(i); if (c===124) p++; else if ((c===34||c===39)&&(li===-1||i>li)) q++; }
    cMax=p*500+q*100; return cMax;
  }

  function uHT(cu,mx) {
    if (!hc||(cu===lSH&&mx===lSM)) return;
    if (lVis!=='visible') { hc.style.visibility='visible'; lVis='visible'; }
    var s=cu+' / '+mx;
    try { if (hc.text!==s) hc.text=s; } catch(e) { try { hc.SetAttributeString('text',s); } catch(e2) {} }
    lSH=cu; lSM=mx;
  }

  // ── Pulse ────────────────────────────────────────────────────────────────────
  var pulse=0, gp=0, gq=1;

  function clearPulse() {
    if (!pulse) return;
    if (rb) rb.RemoveClass(LP); if (hc) hc.RemoveClass(LTX); if (ui) ui.RemoveClass(LS);
    pulse=0; lTxt=lUlt=null;
  }

  // ── Poll ─────────────────────────────────────────────────────────────────────
  var lUT=0, lW=-1, lPW=-1, lHp=-1, pPct=-1, sFC=0;

  function gL() {
    try {
      if (!CONFIG.ENABLED) {
        clearPulse();
        if (rb) { rb.style.washColor=''; lCol=null; }
        if (ui) { ui.style.washColor=''; lUlt=null; }
        $.Schedule(1.0, gL); return;
      }

      var now=Date.now();
      if (!rb) { rb=fRB(); if (!rb) { $.Schedule(0.15,gL); return; } }
      if (!cached&&!tryCache()) { $.Schedule(0.15,gL); return; }
      if (rb.GetParent) { var p=rb.GetParent(); if (cp!==p) cp=p; }
      if (now-lAT>2000) { lAT=now; scan(rb); }

      if (fl&2) { clearPulse(); sBC(CONFIG.COLOR_NEUTRAL); sTC('#ffffff'); lUT=now; $.Schedule(1.5,gL); return; }
      if (!(fl&1)) { lUT=now; $.Schedule(0.4,gL); return; }

      var w=rb.actuallayoutwidth|0;
      var pw=cp&&cp.actuallayoutwidth!==undefined?cp.actuallayoutwidth|0:0;
      if (w===lW&&pw===lPW) { if (now-lUT>2000) { $.Schedule(1,gL); return; } $.Schedule(0.15,gL); return; }
      lW=w; lPW=pw; lUT=now;
      if (pw<=0) { $.Schedule(0.18,gL); return; }

      var hp=(w/pw*100)|0;
      var low=CONFIG.LOW|0, high=CONFIG.HIGH|0;
      if (Math.abs(hp-lHp)<3&&hp>low) { $.Schedule(0.15,gL); return; }
      if (hp===pPct) sFC++; else { sFC=0; pPct=hp; }
      lHp=hp;

      var txt='';
      if (pl) { try { txt=pl.text||pl.GetAttributeString('text','')||''; } catch(e) { txt=''; } }
      if (lb&&lbp) {
        var bw=lb.actuallayoutwidth||0, bpw=lbp.actuallayoutwidth||0, mx=pMax(txt);
        var ratio=bpw>0?bw/bpw:0;
        uHT(ratio>=0.97?mx:Math.round(mx*ratio), mx);
      }

      var sc=0.15, cl;
      var dMid=Math.max(1,high-low), dHigh=Math.max(1,100-high);

      if (hp<=low) {
        if (CONFIG.MODE===1) {
          clearPulse();
          gp+=gq*0.1; if (gp>=1||gp<=0) gq*=-1;
          var cL=hexToRgb(CONFIG.COLOR_LOW); cl=rg(ip(cL,darkOf(cL),gp));
          sBC(cl); sUC(cl); sTC(cl); sc=0.04;
        } else {
          if (!pulse) { rb.AddClass(LP); if (hc) hc.AddClass(LTX); if (ui) ui.AddClass(LS); pulse=1; lCol=lUlt=lTxt=null; }
          sTC(CONFIG.COLOR_LOW); sUC(CONFIG.COLOR_LOW);
        }
      } else {
        clearPulse();
        var hCol=getHighColor();
        if (hp<=high) {
          cl=CONFIG.MODE===1 ? rg(ip(hexToRgb(CONFIG.COLOR_LOW),hexToRgb(CONFIG.COLOR_MID),(hp-low)/dMid)) : CONFIG.COLOR_MID;
        } else {
          cl=CONFIG.MODE===1 ? rg(ip(hexToRgb(CONFIG.COLOR_MID),hexToRgb(hCol),(hp-high)/dHigh)) : hCol;
          if (sFC>=5) sc=Math.min(0.15*Math.pow(2,Math.floor(sFC/5)),1);
        }
        sBC(cl); sUC(cl); sTC('#ffffff');
      }

      $.Schedule(sc, gL);
    } catch(e) {
      $.Schedule(0.5, gL);
    }
  }

  // ── Level tier ───────────────────────────────────────────────────────────────
  var LT_=[11,19,27,35], LC_=['level_tier2','level_tier3','level_tier4','level_tier5'];
  var ll=null, lc=null, wr=null, lLv=-1;

  function pLv(t) { var v=0; for(var i=0;i<t.length;i++){var c=t.charCodeAt(i)-48;if(c>=0&&c<=9)v=v*10+c;}return v; }
  function fER(p) { var c=p; while(c){if(c.BHasClass&&c.BHasClass('enemy'))return c;if(!c.GetParent)break;c=c.GetParent();}return null; }
  function cLU() {
    if (!ll||!ll.IsValid()) ll=ctx.FindChildTraverse('unit_level_label');
    if (!lc||!lc.IsValid()) lc=ctx.FindChildTraverse('LevelContainer');
    if (lc&&(!wr||!wr.IsValid())) wr=fER(lc);
    return ll&&lc&&wr;
  }
  function uLT() {
    if (!cLU()) return;
    var t=''; try{t=ll.text||ll.GetAttributeString('text','')||'';}catch(e){t='';}
    if (!t||t.charCodeAt(0)===123) return;
    var lv=pLv(t); if(lv===lLv||!lv)return; lLv=lv;
    for(var i=0;i<4;i++) wr.RemoveClass(LC_[i]);
    for(var i=3;i>=0;i--){if(lv>=LT_[i]){wr.AddClass(LC_[i]);break;}}
  }
  function lL() { uLT(); $.Schedule(0.5,lL); }

  gL();
  lL();

  // ── Anita-UI live updates ────────────────────────────────────────────────────
  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function(payload) {
    try {
      var data = JSON.parse(payload);
      if (data.magic_word === "ANITA_UPDATE" && data.mod_title === "HP Colors") {
        if (CONFIG.hasOwnProperty(data.setting_id)) {
          var val = data.value;
          if (typeof CONFIG[data.setting_id] === "number" && typeof val === "boolean") val = val ? 1 : 0;
          CONFIG[data.setting_id] = val;
        }
      }
    } catch(e) {}
  });

})();
