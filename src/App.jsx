import { useState, useEffect, useCallback } from "react";

/* ─── helpers ─── */
const pad = n => String(n).padStart(2, "0");
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toLocal = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toISO = s => new Date(s).toISOString();

const DAYS_TH   = ["อา","จ","อ","พ","พฤ","ศ","ส"];
const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MONTHS_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

const CAT = {
  work:    { label:"งาน",      color:"#60a5fa", icon:"💼" },
  study:   { label:"เรียน",    color:"#a78bfa", icon:"📚" },
  health:  { label:"สุขภาพ",   color:"#34d399", icon:"🏃" },
  personal:{ label:"ส่วนตัว",  color:"#fb923c", icon:"⭐" },
  other:   { label:"อื่นๆ",    color:"#94a3b8", icon:"📌" },
};
const PRIO = {
  high:   { label:"สูง",  color:"#f87171", dot:"🔴" },
  medium: { label:"กลาง", color:"#fbbf24", dot:"🟡" },
  low:    { label:"ต่ำ",  color:"#4ade80", dot:"🟢" },
};

/* ─── localStorage ─── */
const ls = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } };
const lss = (key, val) => localStorage.setItem(key, JSON.stringify(val));

/* ─── Claude API ─── */
async function claudeAPI(userMsg, systemMsg = "", mcpServers = []) {
  const body = { model:"claude-sonnet-4-20250514", max_tokens:1000, system:systemMsg,
    messages:[{ role:"user", content:userMsg }] };
  if (mcpServers.length) body.mcp_servers = mcpServers;
  const res = await fetch("/api/claude", { method:"POST",
    headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  return res.json();
}
const GCAL_MCP = [{ type:"url", url:"https://gcal.mcp.claude.com/mcp", name:"gcal" }];
async function gcal(action, params) {
  const data = await claudeAPI(JSON.stringify({ action, params }),
    `You are a Google Calendar assistant. Use MCP tools to perform: ${action}. Reply ONLY with valid JSON: {"success":bool,"events":[],"message":""}. No markdown.`,
    GCAL_MCP);
  const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "{}";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return { success:false, message:text }; }
}

/* ─── Stock watchlist ─── */
const DEFAULT_WATCHLIST = ["PTT.BK","ADVANC.BK","SCB.BK","KBANK.BK","AOT.BK","GC=F","BTC-USD"];

/* ════════════════════════════════════════════════════════════ */
export default function App({ username = "", onLogout }) {
  const today = new Date();

  /* ── global state ── */
  const [tab, setTab]               = useState("home");   // home | finance | market
  const [notif, setNotif]           = useState(null);
  const [clock, setClock]           = useState(new Date());

  /* ── home / calendar ── */
  const [calMonth, setCalMonth]     = useState(new Date(today.getFullYear(), today.getMonth()));
  const [selectedDate, setSelectedDate] = useState(today);
  const [todos, setTodos]           = useState(() => ls("myday_todos_v2", []));
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [modal, setModal]           = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [evForm, setEvForm]         = useState({});
  const [todoForm, setTodoForm]     = useState({});

  /* ── finance ── */
  const [finDate, setFinDate]       = useState(dateKey(today));
  const [finItems, setFinItems]     = useState(() => ls("myday_finance_v1", []));
  const [finModal, setFinModal]     = useState(false);
  const [finForm, setFinForm]       = useState({ type:"expense", amount:"", label:"", cat:"food" });

  /* ── market ── */
  const [watchlist, setWatchlist]   = useState(() => ls("myday_watchlist_v1", DEFAULT_WATCHLIST));
  const [quotes, setQuotes]         = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [addTicker, setAddTicker]   = useState("");

  /* ── notifications ── */
  const [notifPerm, setNotifPerm]   = useState(typeof Notification !== "undefined" ? Notification.permission : "default");

  /* ─── clock tick ─── */
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ─── persist ─── */
  useEffect(() => { lss("myday_todos_v2", todos); }, [todos]);
  useEffect(() => { lss("myday_finance_v1", finItems); }, [finItems]);
  useEffect(() => { lss("myday_watchlist_v1", watchlist); }, [watchlist]);

  /* ─── notify helper ─── */
  const notify = (msg, type="ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3000);
  };

  /* ─── browser push permission ─── */
  const requestNotif = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
    if (p === "granted") {
      new Notification("MyDay", { body:"เปิดการแจ้งเตือนแล้ว ✅", icon:"/icon.png" });
      notify("เปิดการแจ้งเตือนแล้ว");
    }
  };

  /* ─── gcal load ─── */
  const loadGcal = useCallback(async (date) => {
    setGcalLoading(true);
    const dk = dateKey(date);
    const res = await gcal("list_events", { timeMin:`${dk}T00:00:00`, timeMax:`${dk}T23:59:59`, timeZone:"Asia/Bangkok" });
    const raw = res?.events || [];
    setGcalEvents(Array.isArray(raw) ? raw : (raw?.items || []));
    setGcalLoading(false);
  }, []);

  useEffect(() => { loadGcal(selectedDate); }, [selectedDate, loadGcal]);

  /* ─── market fetch ─── */
  const fetchMarket = useCallback(async () => {
    if (!watchlist.length) return;
    setMarketLoading(true);
    try {
      const res = await fetch(`/api/prices?symbols=${watchlist.join(",")}`);
      const data = await res.json();
      setQuotes(data.quotes || []);
    } catch { /* ignore */ }
    setMarketLoading(false);
  }, [watchlist]);

  useEffect(() => {
    if (tab === "market") fetchMarket();
  }, [tab, fetchMarket]);

  /* ─── calendar helpers ─── */
  const yr = calMonth.getFullYear(), mo = calMonth.getMonth();
  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMo = new Date(yr, mo+1, 0).getDate();

  const todosForDate = (date) => todos.filter(t => t.date === dateKey(date));
  const todayTodos   = todosForDate(selectedDate);
  const tomorrowDate = new Date(selectedDate); tomorrowDate.setDate(tomorrowDate.getDate()+1);
  const tomorrowTodos = todosForDate(tomorrowDate);

  const GCAL_COLORS = { "1":"#7986CB","2":"#33B679","3":"#8E24AA","4":"#E67C73","5":"#F6BF26","6":"#F4511E","7":"#039BE5","8":"#616161","9":"#3F51B5","10":"#0B8043","11":"#D50000" };
  const evColor = ev => GCAL_COLORS[ev.colorId] || "#039BE5";
  const formatTime = dt => { if (!dt) return ""; const d=new Date(dt); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  /* ─── event modal ─── */
  const openNewEvent = () => {
    const d = new Date(selectedDate);
    setEvForm({ summary:"", description:"", location:"", colorId:"7",
      start:toLocal(new Date(d.setHours(9,0,0,0))),
      end:toLocal(new Date(new Date(selectedDate).setHours(10,0,0,0))), allDay:false });
    setEditTarget(null); setModal("event");
  };
  const openEditEvent = (ev) => {
    const s = ev.start?.dateTime||ev.start?.date||"";
    const e = ev.end?.dateTime||ev.end?.date||"";
    setEvForm({ summary:ev.summary||"", description:ev.description||"", location:ev.location||"",
      colorId:ev.colorId||"7", start:s?toLocal(new Date(s)):toLocal(new Date()),
      end:e?toLocal(new Date(e)):toLocal(new Date(Date.now()+3600000)), allDay:!!ev.allDay });
    setEditTarget(ev); setModal("event");
  };
  const saveEvent = async () => {
    if (!evForm.summary.trim()) { notify("กรุณาใส่ชื่อกิจกรรม","err"); return; }
    setGcalLoading(true);
    const payload = { summary:evForm.summary, description:evForm.description, location:evForm.location, colorId:evForm.colorId,
      start:evForm.allDay?{date:evForm.start.split("T")[0]}:{dateTime:toISO(evForm.start),timeZone:"Asia/Bangkok"},
      end:evForm.allDay?{date:evForm.end.split("T")[0]}:{dateTime:toISO(evForm.end),timeZone:"Asia/Bangkok"} };
    const action = editTarget?.id ? "update_event" : "create_event";
    const params = editTarget?.id ? {calendarId:"primary",eventId:editTarget.id,event:payload} : {calendarId:"primary",event:payload};
    await gcal(action, params);
    notify(editTarget?.id ? "✅ แก้ไขแล้ว" : "✅ เพิ่มกิจกรรมแล้ว");
    setModal(null); await loadGcal(selectedDate); setGcalLoading(false);
  };
  const deleteEvent = async (ev) => {
    if (!confirm(`ลบ "${ev.summary}"?`)) return;
    setGcalLoading(true);
    await gcal("delete_event", {calendarId:"primary",eventId:ev.id});
    notify("🗑️ ลบแล้ว"); setModal(null); await loadGcal(selectedDate); setGcalLoading(false);
  };

  /* ─── todo helpers ─── */
  const openNewTodo = (date) => {
    setTodoForm({ text:"", note:"", cat:"work", prio:"medium", date:dateKey(date||selectedDate), time:"", done:false });
    setEditTarget(null); setModal("todo");
  };
  const openEditTodo = (t) => { setTodoForm({...t}); setEditTarget(t); setModal("todo"); };
  const saveTodo = () => {
    if (!todoForm.text.trim()) { notify("กรุณาใส่ชื่องาน","err"); return; }
    if (editTarget) setTodos(p => p.map(t => t.id===editTarget.id ? {...todoForm,id:t.id} : t));
    else setTodos(p => [...p, {...todoForm, id:Date.now().toString(), done:false}]);
    notify("✅ บันทึกแล้ว"); setModal(null);
  };
  const toggleTodo = (id) => setTodos(p => p.map(t => t.id===id ? {...t,done:!t.done} : t));
  const deleteTodo = (id) => { if (confirm("ลบงานนี้?")) setTodos(p => p.filter(t => t.id!==id)); };

  /* ─── finance helpers ─── */
  const finForDate = (dk) => finItems.filter(f => f.date === dk);
  const finIncome  = (dk) => finForDate(dk).filter(f=>f.type==="income").reduce((s,f)=>s+f.amount, 0);
  const finExpense = (dk) => finForDate(dk).filter(f=>f.type==="expense").reduce((s,f)=>s+f.amount, 0);
  const FIN_CATS = { food:"🍜 อาหาร", transport:"🚗 เดินทาง", shop:"🛍️ ช้อปปิ้ง", bill:"💡 ค่าบิล",
    health:"🏥 สุขภาพ", entertain:"🎮 บันเทิง", salary:"💼 เงินเดือน", other:"📦 อื่นๆ" };
  const saveFin = () => {
    const amt = parseFloat(finForm.amount);
    if (!amt || isNaN(amt) || amt <= 0) { notify("กรุณาใส่จำนวนเงิน","err"); return; }
    if (!finForm.label.trim()) { notify("กรุณาใส่รายการ","err"); return; }
    setFinItems(p => [...p, { id:Date.now().toString(), date:finDate, type:finForm.type,
      amount:amt, label:finForm.label, cat:finForm.cat }]);
    setFinForm({ type:"expense", amount:"", label:"", cat:"food" });
    setFinModal(false); notify("✅ บันทึกรายการแล้ว");
  };
  const deleteFin = (id) => { if (confirm("ลบรายการนี้?")) setFinItems(p => p.filter(f => f.id!==id)); };

  /* ─── market helpers ─── */
  const addToWatchlist = () => {
    const t = addTicker.trim().toUpperCase();
    if (!t || watchlist.includes(t)) return;
    setWatchlist(p => [...p, t]); setAddTicker("");
  };
  const removeFromWatchlist = (sym) => setWatchlist(p => p.filter(s=>s!==sym));

  const fmtPrice = (p, currency) => {
    if (p == null) return "-";
    const c = currency==="THB" ? "฿" : currency==="USD" ? "$" : "";
    return `${c}${p.toLocaleString("th-TH", {minimumFractionDigits:2,maximumFractionDigits:2})}`;
  };

  /* ═══════════════════════ RENDER ═══════════════════════════ */
  const h = clock.getHours(), m = clock.getMinutes(), s = clock.getSeconds();
  const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;
  const dateStr = today.toLocaleDateString("th-TH", {weekday:"long",day:"numeric",month:"long",year:"numeric"});

  return (
    <div style={{ minHeight:"100vh", maxWidth:480, margin:"0 auto", background:"#0a0a14",
      color:"#e2e2f0", fontFamily:"'Noto Sans Thai',Sarabun,sans-serif",
      display:"flex", flexDirection:"column", position:"relative" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a2a45;border-radius:2px}
        .btn{cursor:pointer;border:none;border-radius:10px;font-family:inherit;font-size:13px;padding:7px 14px;transition:all .15s}
        .btn-blue{background:#3b5eda;color:#fff}.btn-blue:hover{background:#2c4fc0}
        .btn-green{background:#059669;color:#fff}.btn-green:hover{background:#047857}
        .btn-red{background:#c0392b;color:#fff}.btn-red:hover{background:#a93226}
        .btn-ghost{background:transparent;color:#888;border:1px solid #2a2a40}.btn-ghost:hover{background:#1a1a2e;color:#ddd}
        .btn-sm{padding:5px 10px;font-size:12px}
        .card{background:#111125;border:1px solid #1e1e38;border-radius:14px;padding:14px}
        .chip{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:300;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px)}
        .modal{background:#0f0f22;border:1px solid #2a2a50;border-radius:18px 18px 0 0;padding:24px 20px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto}
        input,textarea,select{background:#181830;border:1px solid #2a2a45;border-radius:9px;color:#e2e2f0;font-family:inherit;font-size:14px;padding:10px 12px;width:100%;transition:border .15s}
        input:focus,textarea:focus,select:focus{outline:none;border-color:#4f6ef7}
        label{font-size:11px;color:#666;margin-bottom:4px;display:block}
        .todo-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #141428}
        .todo-row:last-child{border-bottom:none}
        .todo-check{width:20px;height:20px;border-radius:6px;border:2px solid #333;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
        .progress-bar{height:5px;background:#1e1e38;border-radius:3px;overflow:hidden}
        .progress-fill{height:100%;background:linear-gradient(90deg,#3b5eda,#7b9ef7);border-radius:3px;transition:width .5s}
        .notif{position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:11px 22px;border-radius:24px;font-size:13px;z-index:9999;animation:sIn .3s ease;white-space:nowrap}
        @keyframes sIn{from{transform:translateX(-50%) translateY(-20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        .cal-cell{border:1px solid #1a1a30;border-radius:8px;padding:4px;cursor:pointer;min-height:50px;transition:background .15s;text-align:center}
        .cal-cell:hover{background:#141430}
        .today-ring{background:#1d2560;border-color:#4060d0}
        .selected-cell{background:#131340!important;border-color:#4f6ef7!important}
        .bottom-nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:#0d0d1e;border-top:1px solid #1a1a30;display:flex;z-index:200}
        .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;padding:10px 4px 8px;cursor:pointer;gap:3px;transition:all .15s}
        .nav-item.active .nav-icon{color:#7b9ef7}.nav-item.active .nav-label{color:#7b9ef7}
        .nav-icon{font-size:22px;transition:transform .15s}.nav-label{font-size:10px;color:#555;transition:color .15s}
        .nav-item:hover .nav-icon{transform:translateY(-2px)}
        .section-title{font-size:15px;font-weight:600;margin-bottom:10px}
        .ev-block{border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;transition:filter .15s;color:#fff;font-weight:500;margin-bottom:5px}
        .ev-block:hover{filter:brightness(1.15)}
        .fade-in{animation:fi .25s ease}@keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
        .fin-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #141428}
        .fin-row:last-child{border-bottom:none}
        .market-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #141428}
        .market-row:last-child{border-bottom:none}
        .pulse{animation:pl 1.4s infinite}@keyframes pl{0%,100%{opacity:1}50%{opacity:.3}}
        .seg{display:flex;background:#111125;border-radius:10px;padding:3px}
        .seg-btn{flex:1;padding:6px;border-radius:8px;border:none;font-family:inherit;font-size:13px;cursor:pointer;transition:all .15s;background:transparent;color:#555}
        .seg-btn.active{background:#1e2555;color:#7b9ef7;font-weight:600}
      `}</style>

      {/* ── Notification toast ── */}
      {notif && (
        <div className="notif" style={{ background:notif.type==="err"?"#7f1d1d":"#14532d" }}>
          {notif.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background:"linear-gradient(135deg,#0d0d22 0%,#111135 100%)",
        borderBottom:"1px solid #1a1a35", padding:"16px 18px 14px", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:32, fontWeight:700, color:"#7b9ef7", letterSpacing:1, lineHeight:1 }}>
              {timeStr}
            </div>
            <div style={{ fontSize:13, color:"#555", marginTop:4 }}>{dateStr}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontSize:20, fontWeight:700, color:"#a78bfa" }}>✦ MyDay</div>
            </div>
            {username && (
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ fontSize:12, color:"#555" }}>👤 {username}</div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize:11, padding:"3px 8px", color:"#555" }}
                  onClick={()=>{ if(confirm("ออกจากระบบ?")) onLogout(); }}>
                  ออก
                </button>
              </div>
            )}
            {notifPerm !== "granted" && (
              <button className="btn btn-ghost btn-sm" onClick={requestNotif} style={{ fontSize:11 }}>
                🔔 เปิดแจ้งเตือน
              </button>
            )}
            {notifPerm === "granted" && (
              <div className="chip" style={{ background:"#14532d22", color:"#4ade80", fontSize:10 }}>🔔 แจ้งเตือนเปิดอยู่</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scroll content ── */}
      <div style={{ flex:1, overflowY:"auto", paddingBottom:72 }}>

        {/* ════ TAB: HOME ════ */}
        {tab === "home" && (
          <div className="fade-in" style={{ padding:"14px 14px 0" }}>

            {/* Mini Calendar */}
            <div className="card" style={{ marginBottom:14 }}>
              {/* Month nav */}
              <div style={{ display:"flex", alignItems:"center", marginBottom:10 }}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setCalMonth(new Date(yr,mo-1))}>‹</button>
                <div style={{ flex:1, textAlign:"center", fontWeight:600, fontSize:14, color:"#c8d4ff" }}>
                  {MONTHS_FULL[mo]} {yr+543}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={()=>setCalMonth(new Date(yr,mo+1))}>›</button>
              </div>
              {/* Day headers */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:3 }}>
                {DAYS_TH.map((d,i) => (
                  <div key={d} style={{ textAlign:"center", fontSize:11,
                    color: i===0?"#f87171": i===6?"#60a5fa":"#444", fontWeight:600 }}>{d}</div>
                ))}
              </div>
              {/* Days */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
                {Array.from({length:firstDay}).map((_,i)=><div key={"e"+i}/>)}
                {Array.from({length:daysInMo},(_,i)=>i+1).map(d => {
                  const dk = `${yr}-${pad(mo+1)}-${pad(d)}`;
                  const isToday = today.getDate()===d && today.getMonth()===mo && today.getFullYear()===yr;
                  const isSel   = dateKey(selectedDate) === dk;
                  const hasTodo = todos.some(t=>t.date===dk && !t.done);
                  return (
                    <div key={d} className={`cal-cell ${isToday?"today-ring":""} ${isSel?"selected-cell":""}`}
                      onClick={()=>setSelectedDate(new Date(yr,mo,d))}>
                      <div style={{ fontSize:12, fontWeight:isToday||isSel?700:400,
                        color:isToday?"#7b9ef7":isSel?"#a0b4ff":"#888" }}>{d}</div>
                      {hasTodo && <div style={{ width:5,height:5,borderRadius:"50%",background:"#a78bfa",margin:"2px auto 0" }}/>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Today's events (gcal) */}
            <div className="card" style={{ marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                <span className="section-title" style={{ color:"#7b9ef7", margin:0 }}>
                  📅 {selectedDate.toLocaleDateString("th-TH",{day:"numeric",month:"short"})} — กิจกรรม
                </span>
                <div style={{ flex:1 }}/>
                <button className="btn btn-blue btn-sm" onClick={openNewEvent}>+ เพิ่ม</button>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft:4 }} onClick={()=>loadGcal(selectedDate)}>↻</button>
              </div>
              {gcalLoading ? (
                <div className="pulse" style={{ color:"#444", fontSize:12, padding:"8px 0" }}>กำลังโหลด...</div>
              ) : gcalEvents.length === 0 ? (
                <div style={{ color:"#333", fontSize:12, textAlign:"center", padding:"12px 0" }}>ไม่มีกิจกรรม</div>
              ) : (
                gcalEvents.map((ev,i) => (
                  <div key={i} className="ev-block" style={{ background:evColor(ev)+"22", borderLeft:`3px solid ${evColor(ev)}` }}
                    onClick={()=>openEditEvent(ev)}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{ev.summary}</div>
                    <div style={{ fontSize:11, color:"#aaa", marginTop:1 }}>
                      {ev.start?.dateTime ? `${formatTime(ev.start.dateTime)} – ${formatTime(ev.end?.dateTime)}` : "ทั้งวัน"}
                      {ev.location && ` · 📍${ev.location}`}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Today's tasks */}
            <TaskList title={`✅ งานวันนี้ (${selectedDate.toLocaleDateString("th-TH",{day:"numeric",month:"short"})})`}
              color="#a78bfa" tasks={todayTodos}
              onAdd={()=>openNewTodo(selectedDate)}
              onToggle={toggleTodo} onEdit={openEditTodo} onDelete={deleteTodo} />

            {/* Tomorrow's tasks */}
            <div style={{ marginTop:14 }}>
              <TaskList title={`🌅 งานพรุ่งนี้ (${tomorrowDate.toLocaleDateString("th-TH",{day:"numeric",month:"short"})})`}
                color="#fb923c" tasks={tomorrowTodos}
                onAdd={()=>openNewTodo(tomorrowDate)}
                onToggle={toggleTodo} onEdit={openEditTodo} onDelete={deleteTodo} />
            </div>

            <div style={{ height:16 }}/>
          </div>
        )}

        {/* ════ TAB: FINANCE ════ */}
        {tab === "finance" && (
          <div className="fade-in" style={{ padding:"14px 14px 0" }}>

            {/* Date selector */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <button className="btn btn-ghost btn-sm" onClick={()=>{
                const d=new Date(finDate+"T00:00:00"); d.setDate(d.getDate()-1); setFinDate(dateKey(d));
              }}>‹</button>
              <input type="date" value={finDate} onChange={e=>setFinDate(e.target.value)}
                style={{ flex:1, textAlign:"center", fontSize:14 }} />
              <button className="btn btn-ghost btn-sm" onClick={()=>{
                const d=new Date(finDate+"T00:00:00"); d.setDate(d.getDate()+1); setFinDate(dateKey(d));
              }}>›</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setFinDate(dateKey(today))}>วันนี้</button>
            </div>

            {/* Summary cards */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
              {[
                ["รายรับ", finIncome(finDate), "#10b981"],
                ["รายจ่าย", finExpense(finDate), "#f87171"],
                ["คงเหลือ", finIncome(finDate)-finExpense(finDate), finIncome(finDate)-finExpense(finDate)>=0?"#7b9ef7":"#f87171"],
              ].map(([l,v,c]) => (
                <div key={l} className="card" style={{ textAlign:"center", padding:"12px 6px", borderColor:c+"33" }}>
                  <div style={{ fontSize:18, fontWeight:700, color:c }}>
                    {v.toLocaleString("th-TH",{minimumFractionDigits:0,maximumFractionDigits:0})}
                  </div>
                  <div style={{ fontSize:10, color:"#555", marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Monthly summary */}
            <FinMonthSummary finItems={finItems} finDate={finDate} />

            {/* Add button */}
            <button className="btn btn-blue" style={{ width:"100%", marginBottom:12, fontSize:14, padding:"12px" }}
              onClick={()=>setFinModal(true)}>
              + เพิ่มรายการ
            </button>

            {/* List */}
            <div className="card">
              <div className="section-title" style={{ color:"#e2e2f0" }}>
                รายการวันที่ {new Date(finDate+"T00:00:00").toLocaleDateString("th-TH",{day:"numeric",month:"long"})}
              </div>
              {finForDate(finDate).length === 0 ? (
                <div style={{ color:"#333", fontSize:13, textAlign:"center", padding:"16px 0" }}>ยังไม่มีรายการ</div>
              ) : (
                [...finForDate(finDate)].reverse().map(f => (
                  <div key={f.id} className="fin-row">
                    <div style={{ fontSize:20 }}>{FIN_CATS[f.cat]?.split(" ")[0] || "📦"}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{f.label}</div>
                      <div style={{ fontSize:11, color:"#555" }}>{FIN_CATS[f.cat]?.split(" ").slice(1).join(" ") || "อื่นๆ"}</div>
                    </div>
                    <div style={{ fontSize:15, fontWeight:700, color:f.type==="income"?"#10b981":"#f87171" }}>
                      {f.type==="income"?"+":"-"}฿{f.amount.toLocaleString("th-TH",{minimumFractionDigits:0})}
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ padding:"2px 7px", color:"#555", marginLeft:4 }}
                      onClick={()=>deleteFin(f.id)}>✕</button>
                  </div>
                ))
              )}
            </div>
            <div style={{ height:16 }}/>
          </div>
        )}

        {/* ════ TAB: MARKET ════ */}
        {tab === "market" && (
          <div className="fade-in" style={{ padding:"14px 14px 0" }}>

            {/* Refresh + Add */}
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <input value={addTicker} onChange={e=>setAddTicker(e.target.value.toUpperCase())}
                placeholder="เพิ่มหุ้น เช่น AAPL, PTT.BK"
                style={{ flex:1 }} onKeyDown={e=>e.key==="Enter"&&addToWatchlist()} />
              <button className="btn btn-blue btn-sm" onClick={addToWatchlist}>+ เพิ่ม</button>
              <button className="btn btn-ghost btn-sm" onClick={fetchMarket}
                style={{ color: marketLoading?"#555":"#7b9ef7" }}>
                {marketLoading ? "..." : "↻"}
              </button>
            </div>

            {/* Gold & BTC highlight */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              {quotes.filter(q=>["GC=F","BTC-USD"].includes(q.symbol)).map(q => (
                <div key={q.symbol} className="card" style={{ padding:"12px", borderColor: q.changePct>=0?"#10b98133":"#f8717133" }}>
                  <div style={{ fontSize:11, color:"#555", marginBottom:4 }}>
                    {q.symbol==="GC=F"?"🥇 ทองคำ (Gold)":"₿ Bitcoin"}
                  </div>
                  <div style={{ fontSize:18, fontWeight:700, color:"#e2e2f0" }}>
                    {fmtPrice(q.price, q.currency)}
                  </div>
                  <div style={{ fontSize:12, color: q.changePct>=0?"#10b981":"#f87171", marginTop:3 }}>
                    {q.changePct>=0?"▲":"▼"} {Math.abs(q.changePct||0).toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>

            {/* All quotes */}
            <div className="card">
              <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                <span className="section-title" style={{ color:"#e2e2f0", margin:0 }}>📈 Watchlist</span>
                <div style={{ flex:1 }}/>
                {marketLoading && <span className="pulse" style={{ fontSize:12, color:"#444" }}>กำลังโหลด...</span>}
              </div>
              {quotes.filter(q=>!["GC=F","BTC-USD"].includes(q.symbol)).length === 0 && !marketLoading ? (
                <div style={{ color:"#333", fontSize:13, textAlign:"center", padding:"16px 0" }}>
                  กด ↻ เพื่อโหลดราคา
                </div>
              ) : (
                quotes.filter(q=>!["GC=F","BTC-USD"].includes(q.symbol)).map(q => (
                  <div key={q.symbol} className="market-row">
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{q.symbol}</div>
                      <div style={{ fontSize:11, color:"#555" }}>{q.name}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:15, fontWeight:700 }}>{fmtPrice(q.price, q.currency)}</div>
                      <div style={{ fontSize:12, color: q.changePct>=0?"#10b981":"#f87171" }}>
                        {q.changePct>=0?"▲":"▼"} {Math.abs(q.changePct||0).toFixed(2)}%
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ padding:"2px 7px", color:"#555", marginLeft:8 }}
                      onClick={()=>removeFromWatchlist(q.symbol)}>✕</button>
                  </div>
                ))
              )}
            </div>

            {/* Watchlist symbols without price */}
            {watchlist.filter(s=>!quotes.find(q=>q.symbol===s)&&!["GC=F","BTC-USD"].includes(s)).map(s => (
              <div key={s} style={{ display:"flex", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #141428" }}>
                <span style={{ flex:1, color:"#444", fontSize:13 }}>{s}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding:"2px 7px", color:"#555" }}
                  onClick={()=>removeFromWatchlist(s)}>✕</button>
              </div>
            ))}

            <div style={{ fontSize:11, color:"#333", textAlign:"center", margin:"14px 0 4px" }}>
              ข้อมูลราคาจาก Yahoo Finance · อาจล่าช้า 15 นาที
            </div>
            <div style={{ height:16 }}/>
          </div>
        )}
      </div>

      {/* ── Bottom Navigation ── */}
      <div className="bottom-nav">
        {[
          ["home",    "🏠", "หน้าแรก"],
          ["finance", "💰", "การเงิน"],
          ["market",  "📈", "ตลาด"],
        ].map(([k, icon, label]) => (
          <div key={k} className={`nav-item ${tab===k?"active":""}`} onClick={()=>setTab(k)}>
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </div>
        ))}
      </div>

      {/* ════ MODAL: EVENT ════ */}
      {modal === "event" && (
        <div className="modal-bg" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:18 }}>
              <span style={{ fontWeight:700, fontSize:16 }}>{editTarget?"✏️ แก้ไขกิจกรรม":"➕ กิจกรรมใหม่"}</span>
              <div style={{ flex:1 }}/><button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><label>ชื่อกิจกรรม *</label><input value={evForm.summary} onChange={e=>setEvForm(f=>({...f,summary:e.target.value}))} placeholder="เพิ่มชื่อ" autoFocus/></div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}><label>เริ่ม</label><input type={evForm.allDay?"date":"datetime-local"} value={evForm.allDay?evForm.start?.split("T")[0]:evForm.start} onChange={e=>setEvForm(f=>({...f,start:e.target.value}))}/></div>
                <div style={{ flex:1 }}><label>สิ้นสุด</label><input type={evForm.allDay?"date":"datetime-local"} value={evForm.allDay?evForm.end?.split("T")[0]:evForm.end} onChange={e=>setEvForm(f=>({...f,end:e.target.value}))}/></div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="checkbox" id="allday" checked={evForm.allDay} onChange={e=>setEvForm(f=>({...f,allDay:e.target.checked}))} style={{ width:"auto" }}/>
                <label htmlFor="allday" style={{ margin:0, cursor:"pointer", color:"#bbb" }}>ทั้งวัน</label>
              </div>
              <div><label>สถานที่</label><input value={evForm.location} onChange={e=>setEvForm(f=>({...f,location:e.target.value}))} placeholder="เพิ่มสถานที่"/></div>
              <div><label>รายละเอียด</label><textarea value={evForm.description} onChange={e=>setEvForm(f=>({...f,description:e.target.value}))} rows={2} style={{ resize:"vertical" }}/></div>
              <div>
                <label>สี</label>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {Object.entries({"1":"#7986CB","2":"#33B679","3":"#8E24AA","4":"#E67C73","5":"#F6BF26","6":"#F4511E","7":"#039BE5","8":"#616161","9":"#3F51B5","10":"#0B8043","11":"#D50000"}).map(([id,c])=>(
                    <div key={id} onClick={()=>setEvForm(f=>({...f,colorId:id}))}
                      style={{ width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",
                        border:evForm.colorId===id?"3px solid #fff":"3px solid transparent",
                        transform:evForm.colorId===id?"scale(1.2)":"none",transition:"all .15s" }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:18 }}>
              {editTarget && <button className="btn btn-red btn-sm" onClick={()=>deleteEvent(editTarget)}>🗑️ ลบ</button>}
              <div style={{ flex:1 }}/>
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>ยกเลิก</button>
              <button className="btn btn-blue" onClick={saveEvent} disabled={gcalLoading}>
                {gcalLoading?"กำลังบันทึก...":editTarget?"บันทึก":"เพิ่ม"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: TODO ════ */}
      {modal === "todo" && (
        <div className="modal-bg" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:18 }}>
              <span style={{ fontWeight:700, fontSize:16 }}>{editTarget?"✏️ แก้ไขงาน":"➕ งานใหม่"}</span>
              <div style={{ flex:1 }}/><button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><label>ชื่องาน *</label><input value={todoForm.text} onChange={e=>setTodoForm(f=>({...f,text:e.target.value}))} placeholder="ต้องทำอะไร..." autoFocus/></div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}><label>วันที่</label><input type="date" value={todoForm.date} onChange={e=>setTodoForm(f=>({...f,date:e.target.value}))}/></div>
                <div style={{ flex:1 }}><label>เวลา</label><input type="time" value={todoForm.time} onChange={e=>setTodoForm(f=>({...f,time:e.target.value}))}/></div>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label>หมวดหมู่</label>
                  <select value={todoForm.cat} onChange={e=>setTodoForm(f=>({...f,cat:e.target.value}))}>
                    {Object.entries(CAT).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label>ความสำคัญ</label>
                  <select value={todoForm.prio} onChange={e=>setTodoForm(f=>({...f,prio:e.target.value}))}>
                    {Object.entries(PRIO).map(([k,v])=><option key={k} value={k}>{v.dot} {v.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label>หมายเหตุ</label><textarea value={todoForm.note} onChange={e=>setTodoForm(f=>({...f,note:e.target.value}))} rows={2} style={{ resize:"vertical" }} placeholder="รายละเอียดเพิ่มเติม..."/></div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:18 }}>
              {editTarget && <button className="btn btn-red btn-sm" onClick={()=>{deleteTodo(editTarget.id);setModal(null);}}>🗑️ ลบ</button>}
              <div style={{ flex:1 }}/>
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>ยกเลิก</button>
              <button className="btn btn-blue" onClick={saveTodo}>{editTarget?"บันทึก":"เพิ่มงาน"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: FINANCE ════ */}
      {finModal && (
        <div className="modal-bg" onClick={()=>setFinModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:18 }}>
              <span style={{ fontWeight:700, fontSize:16 }}>➕ เพิ่มรายการ</span>
              <div style={{ flex:1 }}/><button className="btn btn-ghost btn-sm" onClick={()=>setFinModal(false)}>✕</button>
            </div>
            {/* Type toggle */}
            <div className="seg" style={{ marginBottom:14 }}>
              <button className={`seg-btn ${finForm.type==="income"?"active":""}`}
                style={{ color:finForm.type==="income"?"#10b981":undefined }}
                onClick={()=>setFinForm(f=>({...f,type:"income"}))}>💚 รายรับ</button>
              <button className={`seg-btn ${finForm.type==="expense"?"active":""}`}
                style={{ color:finForm.type==="expense"?"#f87171":undefined }}
                onClick={()=>setFinForm(f=>({...f,type:"expense"}))}>❤️ รายจ่าย</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><label>จำนวนเงิน (฿) *</label>
                <input type="number" value={finForm.amount} onChange={e=>setFinForm(f=>({...f,amount:e.target.value}))}
                  placeholder="0.00" inputMode="decimal" autoFocus/></div>
              <div><label>รายการ *</label>
                <input value={finForm.label} onChange={e=>setFinForm(f=>({...f,label:e.target.value}))}
                  placeholder={finForm.type==="income"?"เช่น เงินเดือน":"เช่น ค่าอาหาร"}/></div>
              <div><label>หมวดหมู่</label>
                <select value={finForm.cat} onChange={e=>setFinForm(f=>({...f,cat:e.target.value}))}>
                  {finForm.type==="income"
                    ? [["salary","💼 เงินเดือน/รายได้"],["other","📦 อื่นๆ"]].map(([k,v])=><option key={k} value={k}>{v}</option>)
                    : Object.entries(FIN_CATS).filter(([k])=>k!=="salary").map(([k,v])=><option key={k} value={k}>{v}</option>)
                  }
                </select>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:18 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={()=>setFinModal(false)}>ยกเลิก</button>
              <button className={`btn ${finForm.type==="income"?"btn-green":"btn-red"}`} style={{ flex:2 }} onClick={saveFin}>
                {finForm.type==="income"?"+ บันทึกรายรับ":"+ บันทึกรายจ่าย"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── TaskList sub-component ─── */
function TaskList({ title, color, tasks, onAdd, onToggle, onEdit, onDelete }) {
  const done = tasks.filter(t=>t.done).length;
  const pct  = tasks.length ? Math.round((done/tasks.length)*100) : 0;
  return (
    <div className="card">
      <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:14, fontWeight:600, color }}>{title}</span>
        <div style={{ flex:1 }}/>
        <button className="btn btn-blue btn-sm" onClick={onAdd}>+ งาน</button>
      </div>
      {tasks.length > 0 && (
        <div style={{ marginBottom:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#555", marginBottom:3 }}>
            <span>เสร็จ {done}/{tasks.length}</span><span>{pct}%</span>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%` }}/></div>
        </div>
      )}
      {tasks.length === 0 ? (
        <div style={{ color:"#333", fontSize:12, textAlign:"center", padding:"10px 0" }}>ยังไม่มีงาน</div>
      ) : (
        tasks.map(t => (
          <div key={t.id} className="todo-row">
            <div className="todo-check" style={{ background:t.done?"#3b5eda":"transparent", borderColor:t.done?"#3b5eda":"#333" }}
              onClick={()=>onToggle(t.id)}>
              {t.done && <span style={{ color:"#fff", fontSize:11 }}>✓</span>}
            </div>
            <div style={{ flex:1, cursor:"pointer" }} onClick={()=>onEdit(t)}>
              <div style={{ fontSize:13, fontWeight:500, textDecoration:t.done?"line-through":"none", color:t.done?"#444":"#ddd" }}>
                {CAT[t.cat]?.icon} {t.text}
              </div>
              <div style={{ display:"flex", gap:5, marginTop:2, flexWrap:"wrap" }}>
                <span className="chip" style={{ background:CAT[t.cat]?.color+"22", color:CAT[t.cat]?.color }}>
                  {CAT[t.cat]?.label}
                </span>
                <span style={{ fontSize:11, color:PRIO[t.prio]?.color }}>{PRIO[t.prio]?.dot}</span>
                {t.time && <span style={{ fontSize:11, color:"#555" }}>⏰ {t.time}</span>}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ padding:"2px 7px", color:"#555" }}
              onClick={()=>onDelete(t.id)}>✕</button>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── FinMonthSummary sub-component ─── */
function FinMonthSummary({ finItems, finDate }) {
  const mo = finDate.slice(0, 7); // "YYYY-MM"
  const moItems = finItems.filter(f => f.date.startsWith(mo));
  const income  = moItems.filter(f=>f.type==="income").reduce((s,f)=>s+f.amount, 0);
  const expense = moItems.filter(f=>f.type==="expense").reduce((s,f)=>s+f.amount, 0);
  const d = new Date(finDate+"T00:00:00");
  const label = `${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()]} ${d.getFullYear()+543}`;
  if (!moItems.length) return null;
  return (
    <div className="card" style={{ marginBottom:14, padding:"10px 14px" }}>
      <div style={{ fontSize:11, color:"#555", marginBottom:6 }}>สรุปเดือน {label}</div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:12, color:"#555" }}>รายรับรวม</div>
          <div style={{ fontSize:16, fontWeight:600, color:"#10b981" }}>฿{income.toLocaleString("th-TH",{minimumFractionDigits:0})}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:12, color:"#555" }}>รายจ่ายรวม</div>
          <div style={{ fontSize:16, fontWeight:600, color:"#f87171" }}>฿{expense.toLocaleString("th-TH",{minimumFractionDigits:0})}</div>
        </div>
      </div>
      {expense > 0 && (
        <div style={{ marginTop:8 }}>
          <div style={{ height:4, background:"#1e1e38", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${Math.min(100,(expense/(income||expense))*100).toFixed(0)}%`,
              background:"linear-gradient(90deg,#10b981,#f87171)", borderRadius:2 }}/>
          </div>
          <div style={{ fontSize:10, color:"#555", marginTop:3, textAlign:"center" }}>
            ใช้จ่ายไปแล้ว {income>0?((expense/income)*100).toFixed(0):"100"}% ของรายรับเดือนนี้
          </div>
        </div>
      )}
    </div>
  );
}
