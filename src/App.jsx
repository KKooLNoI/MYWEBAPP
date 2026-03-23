import { useState, useEffect, useCallback, useRef } from "react";

/* ─── helpers ─── */
const pad = n => String(n).padStart(2, "0");
const toLocal = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toISO   = s => new Date(s).toISOString();
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

const DAYS_TH   = ["อา","จ","อ","พ","พฤ","ศ","ส"];
const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

const CAT = {
  work:    { label:"งาน",        color:"#60a5fa", icon:"💼" },
  study:   { label:"เรียน",      color:"#a78bfa", icon:"📚" },
  health:  { label:"สุขภาพ",     color:"#34d399", icon:"🏃" },
  personal:{ label:"ส่วนตัว",   color:"#fb923c", icon:"⭐" },
  other:   { label:"อื่นๆ",      color:"#94a3b8", icon:"📌" },
};

const PRIO = {
  high:   { label:"สูง",   color:"#f87171", dot:"🔴" },
  medium: { label:"กลาง",  color:"#fbbf24", dot:"🟡" },
  low:    { label:"ต่ำ",   color:"#4ade80", dot:"🟢" },
};

/* ─── Anthropic API wrapper (ผ่าน proxy /api/claude เพื่อซ่อน API key) ─── */
async function claudeAPI(userMsg, systemMsg = "", mcpServers = [], tools = []) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: systemMsg,
    messages: [{ role:"user", content: userMsg }],
  };
  if (mcpServers.length) body.mcp_servers = mcpServers;
  if (tools.length)      body.tools       = tools;
  const res = await fetch("/api/claude", {
    method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body),
  });
  return await res.json();
}

/* ─── gcal helpers ─── */
const GCAL_MCP = [{ type:"url", url:"https://gcal.mcp.claude.com/mcp", name:"gcal" }];

async function gcal(action, params) {
  const data = await claudeAPI(
    JSON.stringify({ action, params }),
    `You are a Google Calendar assistant. Use MCP tools to perform: ${action}.
Reply ONLY with valid JSON: {"success":bool,"events":[],"message":""}. No markdown.`,
    GCAL_MCP
  );
  const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "{}";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return { success:false, message: text }; }
}

/* ─── localStorage for todos ─── */
const LS_KEY = "myday_todos_v1";
const loadTodos = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const saveTodos = t => localStorage.setItem(LS_KEY, JSON.stringify(t));

/* ════════════════════════════════════════════════════════════ */
export default function MyDay() {
  const today = new Date();

  /* state */
  const [selectedDate, setSelectedDate]   = useState(today);
  const [calMonth,     setCalMonth]        = useState(new Date(today.getFullYear(), today.getMonth()));
  const [gcalEvents,   setGcalEvents]      = useState([]);
  const [todos,        setTodos]           = useState(loadTodos);
  const [loading,      setLoading]         = useState(false);
  const [tab,          setTab]             = useState("day");   // day | calendar | todos
  const [modal,        setModal]           = useState(null);    // null | "event" | "todo"
  const [editTarget,   setEditTarget]      = useState(null);
  const [notif,        setNotif]           = useState(null);
  const [aiOpen,       setAiOpen]          = useState(false);
  const [aiChat,       setAiChat]          = useState([]);
  const [aiInput,      setAiInput]         = useState("");
  const [aiLoading,    setAiLoading]       = useState(false);

  const [evForm, setEvForm] = useState({});
  const [todoForm, setTodoForm] = useState({});
  const aiEndRef = useRef(null);

  /* notify helper */
  const notify = (msg, type="ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3200);
  };

  /* ── load gcal events for selected date ── */
  const loadDay = useCallback(async (date) => {
    setLoading(true);
    const dk = dateKey(date);
    const res = await gcal("list_events", {
      timeMin: `${dk}T00:00:00`, timeMax: `${dk}T23:59:59`,
      timeZone:"Asia/Bangkok",
    });
    const raw = res?.events || [];
    const arr = Array.isArray(raw) ? raw : (raw?.items || []);
    setGcalEvents(arr);
    setLoading(false);
  }, []);

  useEffect(() => { loadDay(selectedDate); }, [selectedDate, loadDay]);

  /* ── todos persistence ── */
  useEffect(() => { saveTodos(todos); }, [todos]);

  /* ── ai chat scroll ── */
  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [aiChat]);

  /* ── calendar grid ── */
  const yr = calMonth.getFullYear(), mo = calMonth.getMonth();
  const firstDay   = new Date(yr, mo, 1).getDay();
  const daysInMo   = new Date(yr, mo+1, 0).getDate();

  const gcalByDate = (d) => {
    const dk = `${yr}-${pad(mo+1)}-${pad(d)}`;
    return gcalEvents.filter(e => (e.start?.dateTime||e.start?.date||"").startsWith(dk));
  };

  const todosForDate = (date) => {
    const dk = dateKey(date);
    return todos.filter(t => t.date === dk);
  };

  const todayTodos   = todosForDate(selectedDate);
  const incompleteCt = todos.filter(t => !t.done).length;

  /* ── Event form defaults ── */
  const openNewEvent = (date) => {
    const d = date || selectedDate;
    setEvForm({
      summary:"", description:"", location:"", colorId:"7",
      start: toLocal(new Date(d.setHours ? d.setHours(9,0,0,0) || d : d)),
      end:   toLocal(new Date(new Date(d).setHours(10,0,0,0))),
      allDay: false,
    });
    setEditTarget(null);
    setModal("event");
  };

  const openEditEvent = (ev) => {
    const s = ev.start?.dateTime||ev.start?.date||"";
    const e = ev.end?.dateTime||ev.end?.date||"";
    setEvForm({
      summary: ev.summary||"", description: ev.description||"",
      location: ev.location||"", colorId: ev.colorId||"7",
      start: s ? toLocal(new Date(s)) : toLocal(new Date()),
      end:   e ? toLocal(new Date(e)) : toLocal(new Date(Date.now()+3600000)),
      allDay: !!ev.allDay,
    });
    setEditTarget(ev);
    setModal("event");
  };

  const saveEvent = async () => {
    if (!evForm.summary.trim()) { notify("กรุณาใส่ชื่อกิจกรรม","err"); return; }
    setLoading(true);
    const payload = {
      summary: evForm.summary, description: evForm.description, location: evForm.location, colorId: evForm.colorId,
      start: evForm.allDay ? { date: evForm.start.split("T")[0] } : { dateTime: toISO(evForm.start), timeZone:"Asia/Bangkok" },
      end:   evForm.allDay ? { date: evForm.end.split("T")[0]   } : { dateTime: toISO(evForm.end),   timeZone:"Asia/Bangkok" },
    };
    const action = editTarget?.id ? "update_event" : "create_event";
    const params = editTarget?.id
      ? { calendarId:"primary", eventId: editTarget.id, event: payload }
      : { calendarId:"primary", event: payload };
    await gcal(action, params);
    notify(editTarget?.id ? "✅ แก้ไขแล้ว" : "✅ เพิ่มกิจกรรมแล้ว");
    setModal(null);
    await loadDay(selectedDate);
    setLoading(false);
  };

  const deleteEvent = async (ev) => {
    if (!confirm(`ลบ "${ev.summary}"?`)) return;
    setLoading(true);
    await gcal("delete_event", { calendarId:"primary", eventId: ev.id });
    notify("🗑️ ลบแล้ว");
    setModal(null);
    await loadDay(selectedDate);
    setLoading(false);
  };

  /* ── Todo helpers ── */
  const openNewTodo = () => {
    setTodoForm({ text:"", note:"", cat:"work", prio:"medium", date: dateKey(selectedDate), time:"", done:false });
    setEditTarget(null);
    setModal("todo");
  };
  const openEditTodo = (t) => { setTodoForm({...t}); setEditTarget(t); setModal("todo"); };

  const saveTodo = () => {
    if (!todoForm.text.trim()) { notify("กรุณาใส่ชื่องาน","err"); return; }
    if (editTarget) {
      setTodos(prev => prev.map(t => t.id===editTarget.id ? {...todoForm, id:t.id} : t));
      notify("✅ แก้ไขงานแล้ว");
    } else {
      setTodos(prev => [...prev, {...todoForm, id: Date.now().toString(), done:false}]);
      notify("✅ เพิ่มงานแล้ว");
    }
    setModal(null);
  };

  const toggleTodo = (id) => setTodos(prev => prev.map(t => t.id===id ? {...t, done:!t.done} : t));
  const deleteTodo = (id) => { if (confirm("ลบงานนี้?")) setTodos(prev => prev.filter(t => t.id!==id)); };

  /* ── AI chat ── */
  const sendAI = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    setAiChat(p => [...p, { role:"user", text: userMsg }]);
    setAiLoading(true);

    const evSummary = gcalEvents.slice(0,8).map(e=>`• ${e.summary} (${(e.start?.dateTime||e.start?.date||"").replace("T"," ").slice(0,16)})`).join("\n");
    const todoSum   = todayTodos.map(t=>`• [${t.done?"✓":"○"}] ${t.text} (${PRIO[t.prio]?.label||""} / ${CAT[t.cat]?.label||""})`).join("\n");

    const data = await claudeAPI(
      userMsg,
      `คุณเป็น AI ผู้ช่วยส่วนตัว ชื่อ "MyDay" ตอบภาษาไทย กระชับ เป็นมิตร
วันที่เลือก: ${selectedDate.toLocaleDateString("th-TH",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
กิจกรรมใน Google Calendar วันนี้:\n${evSummary||"ไม่มี"}
Todo วันนี้:\n${todoSum||"ไม่มี"}
ช่วยวิเคราะห์ตารางงาน แนะนำการจัดลำดับ หรือตอบคำถามเกี่ยวกับวันนี้`
    );
    const reply = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "...";
    setAiChat(p => [...p, { role:"ai", text: reply }]);
    setAiLoading(false);
  };

  /* ── color map ── */
  const GCAL_COLORS = { "1":"#7986CB","2":"#33B679","3":"#8E24AA","4":"#E67C73","5":"#F6BF26","6":"#F4511E","7":"#039BE5","8":"#616161","9":"#3F51B5","10":"#0B8043","11":"#D50000" };
  const evColor = ev => GCAL_COLORS[ev.colorId] || "#039BE5";

  const formatTime = (dt) => {
    if (!dt) return "";
    const d = new Date(dt);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  /* ═══════════════════════ RENDER ═══════════════════════════ */
  return (
    <div style={{ minHeight:"100vh", background:"#0a0a14", color:"#e2e2f0",
      fontFamily:"'Noto Sans Thai',Sarabun,sans-serif", display:"flex", flexDirection:"column" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&family=Sarabun:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#2a2a45;border-radius:3px}
        .btn{cursor:pointer;border:none;border-radius:10px;font-family:inherit;font-size:13px;padding:7px 14px;transition:all .18s}
        .btn-blue{background:#3b5eda;color:#fff}.btn-blue:hover{background:#2c4fc0;transform:translateY(-1px)}
        .btn-ghost{background:transparent;color:#888;border:1px solid #2a2a40}.btn-ghost:hover{background:#1a1a2e;color:#ddd}
        .btn-red{background:#c0392b;color:#fff}.btn-red:hover{background:#a93226}
        .btn-sm{padding:5px 10px;font-size:12px}
        .card{background:#111125;border:1px solid #1e1e38;border-radius:14px;padding:16px}
        .chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
        .tab{cursor:pointer;padding:8px 18px;border-radius:10px;font-size:13px;transition:all .15s;white-space:nowrap}
        .tab.active{background:#1e2555;color:#7b9ef7;font-weight:600}
        .tab:not(.active){color:#666}.tab:not(.active):hover{color:#aaa;background:#111128}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
        .modal{background:#0f0f20;border:1px solid #2a2a50;border-radius:18px;padding:28px;width:520px;max-width:96vw;max-height:92vh;overflow-y:auto}
        input,textarea,select{background:#181830;border:1px solid #2a2a45;border-radius:9px;color:#e2e2f0;font-family:inherit;font-size:13px;padding:9px 12px;width:100%;transition:border .18s}
        input:focus,textarea:focus,select:focus{outline:none;border-color:#4f6ef7}
        label{font-size:11px;color:#666;margin-bottom:4px;display:block}
        .day-slot{min-height:52px;border-bottom:1px solid #141428;padding:6px 10px;display:flex;align-items:flex-start;gap:8px}
        .ev-block{border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;transition:filter .15s;color:#fff;font-weight:500}
        .ev-block:hover{filter:brightness(1.2)}
        .todo-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:11px;transition:background .15s;border:1px solid transparent}
        .todo-row:hover{background:#111128;border-color:#1e1e38}
        .todo-check{width:20px;height:20px;border-radius:6px;border:2px solid #333;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
        .progress-bar{height:6px;background:#1e1e38;border-radius:3px;overflow:hidden}
        .progress-fill{height:100%;background:linear-gradient(90deg,#3b5eda,#7b9ef7);border-radius:3px;transition:width .5s}
        .notif{position:fixed;top:18px;right:18px;padding:12px 20px;border-radius:12px;font-size:13px;z-index:9999;animation:sIn .3s ease}
        @keyframes sIn{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}
        .ai-msg{padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.7;max-width:88%}
        .pulse{animation:pl 1.4s infinite}@keyframes pl{0%,100%{opacity:1}50%{opacity:.3}}
        .cal-cell{border:1px solid #1a1a30;border-radius:8px;padding:5px;cursor:pointer;min-height:64px;transition:background .15s}
        .cal-cell:hover{background:#141430}
        .today-ring{background:#1d2560;border-color:#4060d0}
        .selected-cell{background:#131340 !important;border-color:#4f6ef7 !important}
        .fade-in{animation:fi .3s ease}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      `}</style>

      {/* ── Notification ── */}
      {notif && (
        <div className="notif" style={{ background: notif.type==="err" ? "#7f1d1d" : "#14532d" }}>
          {notif.msg}
        </div>
      )}

      {/* ── Top Bar ── */}
      <div style={{ background:"#0d0d1e", borderBottom:"1px solid #1a1a30", padding:"12px 20px",
        display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
        <div style={{ fontSize:20, fontWeight:700, color:"#7b9ef7", letterSpacing:.5 }}>
          ✦ MyDay
        </div>
        <div style={{ display:"flex", gap:4, flex:1, flexWrap:"wrap" }}>
          {[["day","📅 วันนี้"],["calendar","🗓️ ปฏิทิน"],["todos","✅ งานทั้งหมด"]].map(([k,l])=>(
            <div key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{l}</div>
          ))}
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {incompleteCt > 0 && (
            <div className="chip" style={{ background:"#3b1f1f", color:"#f87171" }}>
              {incompleteCt} งานค้าง
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={()=>setAiOpen(v=>!v)}
            style={{ color: aiOpen?"#a78bfa":"#888" }}>🤖 AI</button>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ════ TAB: DAY ════ */}
        {tab==="day" && (
          <div style={{ flex:1, overflow:"auto", padding:16, display:"flex", flexDirection:"column", gap:14 }}>

            {/* Date nav */}
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button className="btn btn-ghost btn-sm" onClick={()=>{ const d=new Date(selectedDate); d.setDate(d.getDate()-1); setSelectedDate(d); }}>‹</button>
              <div style={{ flex:1, textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:700, color:"#c8d4ff" }}>
                  {selectedDate.toLocaleDateString("th-TH",{weekday:"long"})}
                </div>
                <div style={{ fontSize:13, color:"#666" }}>
                  {selectedDate.toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"})}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>{ const d=new Date(selectedDate); d.setDate(d.getDate()+1); setSelectedDate(d); }}>›</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setSelectedDate(new Date())}>วันนี้</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

              {/* Google Calendar events */}
              <div className="card fade-in">
                <div style={{ display:"flex", alignItems:"center", marginBottom:12, gap:8 }}>
                  <span style={{ fontSize:15, fontWeight:600, color:"#7b9ef7" }}>📅 กิจกรรมวันนี้</span>
                  <div style={{ flex:1 }} />
                  <button className="btn btn-blue btn-sm" onClick={()=>openNewEvent(selectedDate)}>+ เพิ่ม</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>loadDay(selectedDate)}>↻</button>
                </div>
                {loading ? <div className="pulse" style={{ color:"#444", fontSize:13 }}>กำลังโหลด...</div>
                  : gcalEvents.length === 0
                    ? <div style={{ color:"#333", fontSize:13, textAlign:"center", padding:"20px 0" }}>ไม่มีกิจกรรม<br/><span style={{fontSize:11}}>กดเพิ่มเพื่อสร้างกิจกรรม</span></div>
                    : gcalEvents.map((ev, i) => (
                      <div key={i} className="ev-block" style={{ background: evColor(ev)+"22", borderLeft:`3px solid ${evColor(ev)}`, marginBottom:6 }}
                        onClick={()=>openEditEvent(ev)}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{ev.summary}</div>
                        <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>
                          {ev.start?.dateTime ? `${formatTime(ev.start.dateTime)} – ${formatTime(ev.end?.dateTime)}` : "ทั้งวัน"}
                          {ev.location && ` · 📍${ev.location}`}
                        </div>
                      </div>
                    ))
                }
              </div>

              {/* Todos for today */}
              <div className="card fade-in">
                <div style={{ display:"flex", alignItems:"center", marginBottom:10, gap:8 }}>
                  <span style={{ fontSize:15, fontWeight:600, color:"#a78bfa" }}>✅ To-Do วันนี้</span>
                  <div style={{ flex:1 }} />
                  <button className="btn btn-blue btn-sm" onClick={openNewTodo}>+ งานใหม่</button>
                </div>

                {/* progress */}
                {todayTodos.length > 0 && (() => {
                  const done = todayTodos.filter(t=>t.done).length;
                  const pct = Math.round((done/todayTodos.length)*100);
                  return (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#555", marginBottom:4 }}>
                        <span>เสร็จ {done}/{todayTodos.length}</span><span>{pct}%</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%` }} /></div>
                    </div>
                  );
                })()}

                {todayTodos.length === 0
                  ? <div style={{ color:"#333", fontSize:13, textAlign:"center", padding:"20px 0" }}>ยังไม่มีงานวันนี้</div>
                  : todayTodos.map(t => (
                    <div key={t.id} className="todo-row">
                      <div className="todo-check" style={{ background: t.done?"#3b5eda":"transparent", borderColor: t.done?"#3b5eda":"#333" }}
                        onClick={()=>toggleTodo(t.id)}>
                        {t.done && <span style={{ color:"#fff", fontSize:12 }}>✓</span>}
                      </div>
                      <div style={{ flex:1, cursor:"pointer" }} onClick={()=>openEditTodo(t)}>
                        <div style={{ fontSize:13, fontWeight:500, textDecoration: t.done?"line-through":"none", color: t.done?"#444":"#ddd" }}>
                          {CAT[t.cat]?.icon} {t.text}
                        </div>
                        <div style={{ display:"flex", gap:6, marginTop:3, flexWrap:"wrap" }}>
                          <span className="chip" style={{ background: CAT[t.cat]?.color+"22", color: CAT[t.cat]?.color }}>
                            {CAT[t.cat]?.label}
                          </span>
                          <span style={{ fontSize:11, color: PRIO[t.prio]?.color }}>
                            {PRIO[t.prio]?.dot} {PRIO[t.prio]?.label}
                          </span>
                          {t.time && <span style={{ fontSize:11, color:"#666" }}>⏰ {t.time}</span>}
                        </div>
                        {t.note && <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{t.note}</div>}
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ padding:"3px 8px", color:"#555" }}
                        onClick={()=>deleteTodo(t.id)}>✕</button>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB: CALENDAR ════ */}
        {tab==="calendar" && (
          <div style={{ flex:1, overflow:"auto", padding:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setCalMonth(new Date(yr, mo-1))}>‹</button>
              <div style={{ flex:1, textAlign:"center", fontWeight:600, fontSize:16, color:"#c8d4ff" }}>
                {MONTHS_TH[mo]} {yr+543}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setCalMonth(new Date(yr, mo+1))}>›</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setCalMonth(new Date(today.getFullYear(),today.getMonth()))}>เดือนนี้</button>
              <button className="btn btn-blue btn-sm" onClick={()=>openNewEvent(selectedDate)}>+ เพิ่ม</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
              {DAYS_TH.map(d=><div key={d} style={{ textAlign:"center", fontSize:11, color:"#444", fontWeight:600 }}>{d}</div>)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
              {Array.from({length:firstDay}).map((_,i)=><div key={"e"+i}/>)}
              {Array.from({length:daysInMo},(_,i)=>i+1).map(d=>{
                const isToday = today.getDate()===d && today.getMonth()===mo && today.getFullYear()===yr;
                const selDk   = dateKey(selectedDate);
                const thisDk  = `${yr}-${pad(mo+1)}-${pad(d)}`;
                const isSel   = selDk === thisDk;
                const dayEvs  = gcalByDate(d);
                const dayTodos= todos.filter(t=>t.date===thisDk);
                return (
                  <div key={d} className={`cal-cell ${isToday?"today-ring":""} ${isSel?"selected-cell":""}`}
                    onClick={()=>{ setSelectedDate(new Date(yr,mo,d)); setTab("day"); }}>
                    <div style={{ fontSize:12, fontWeight:isSel||isToday?700:400, color:isToday?"#7b9ef7":isSel?"#a0b4ff":"#666", marginBottom:3 }}>
                      {d}
                    </div>
                    {dayEvs.slice(0,2).map((ev,i)=>(
                      <div key={i} style={{ fontSize:10, padding:"1px 5px", borderRadius:4, background:evColor(ev), color:"#fff",
                        marginBottom:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {ev.summary}
                      </div>
                    ))}
                    {dayTodos.filter(t=>!t.done).length>0 && (
                      <div style={{ fontSize:10, color:"#a78bfa", marginTop:1 }}>
                        ○ {dayTodos.filter(t=>!t.done).length}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════ TAB: ALL TODOS ════ */}
        {tab==="todos" && (
          <div style={{ flex:1, overflow:"auto", padding:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
              <span style={{ fontWeight:600, fontSize:16, color:"#a78bfa" }}>✅ งานทั้งหมด</span>
              <div style={{ flex:1 }} />
              <button className="btn btn-blue btn-sm" onClick={openNewTodo}>+ งานใหม่</button>
            </div>

            {/* stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
              {[
                ["ทั้งหมด", todos.length, "#3b5eda"],
                ["เสร็จแล้ว", todos.filter(t=>t.done).length, "#10b981"],
                ["ค้างอยู่", todos.filter(t=>!t.done).length, "#f87171"],
                ["วันนี้", todosForDate(today).length, "#fb923c"],
              ].map(([l,v,c])=>(
                <div key={l} className="card" style={{ textAlign:"center", borderColor: c+"44" }}>
                  <div style={{ fontSize:22, fontWeight:700, color:c }}>{v}</div>
                  <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>

            {/* group by date */}
            {(() => {
              const grouped = {};
              [...todos].sort((a,b)=>a.date>b.date?-1:1).forEach(t=>{
                if (!grouped[t.date]) grouped[t.date]=[];
                grouped[t.date].push(t);
              });
              return Object.entries(grouped).map(([dk, list])=>{
                const d = new Date(dk+"T00:00:00");
                const isToday = dk===dateKey(today);
                return (
                  <div key={dk} style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12, color: isToday?"#7b9ef7":"#555", fontWeight:600, marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      {isToday && <span className="chip" style={{ background:"#1d2555", color:"#7b9ef7" }}>วันนี้</span>}
                      {d.toLocaleDateString("th-TH",{weekday:"short",day:"numeric",month:"short"})}
                    </div>
                    <div className="card" style={{ padding:"8px 12px" }}>
                      {list.map(t=>(
                        <div key={t.id} className="todo-row">
                          <div className="todo-check" style={{ background:t.done?"#3b5eda":"transparent", borderColor:t.done?"#3b5eda":"#333" }}
                            onClick={()=>toggleTodo(t.id)}>
                            {t.done&&<span style={{ color:"#fff",fontSize:12 }}>✓</span>}
                          </div>
                          <div style={{ flex:1, cursor:"pointer" }} onClick={()=>openEditTodo(t)}>
                            <div style={{ fontSize:13, fontWeight:500, textDecoration:t.done?"line-through":"none", color:t.done?"#444":"#ddd" }}>
                              {CAT[t.cat]?.icon} {t.text}
                            </div>
                            <div style={{ display:"flex", gap:6, marginTop:2 }}>
                              <span className="chip" style={{ background:CAT[t.cat]?.color+"22", color:CAT[t.cat]?.color }}>{CAT[t.cat]?.label}</span>
                              <span style={{ fontSize:11, color:PRIO[t.prio]?.color }}>{PRIO[t.prio]?.dot} {PRIO[t.prio]?.label}</span>
                              {t.time && <span style={{ fontSize:11, color:"#555" }}>⏰ {t.time}</span>}
                            </div>
                          </div>
                          <button className="btn btn-ghost btn-sm" style={{ padding:"3px 8px", color:"#555" }}
                            onClick={()=>deleteTodo(t.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
            {todos.length===0 && <div style={{ textAlign:"center", color:"#333", padding:"40px 0" }}>ยังไม่มีงานใดๆ</div>}
          </div>
        )}

        {/* ════ AI SIDEBAR ════ */}
        {aiOpen && (
          <div style={{ width:300, background:"#0d0d1e", borderLeft:"1px solid #1a1a30",
            display:"flex", flexDirection:"column", flexShrink:0 }}>
            <div style={{ padding:"14px 16px", borderBottom:"1px solid #1a1a30", fontWeight:600, color:"#a78bfa", fontSize:14 }}>
              🤖 AI ผู้ช่วย MyDay
            </div>
            <div style={{ flex:1, overflow:"auto", padding:12, display:"flex", flexDirection:"column", gap:8 }}>
              {aiChat.length===0 && (
                <div style={{ color:"#333", fontSize:12, textAlign:"center", marginTop:30, lineHeight:1.8 }}>
                  ถามเรื่องตารางงานได้เลย<br/>เช่น "วันนี้ยุ่งแค่ไหน"<br/>"ช่วยจัดลำดับงานให้หน่อย"
                </div>
              )}
              {aiChat.map((m,i)=>(
                <div key={i} className="ai-msg" style={{
                  background: m.role==="user" ? "#1d2555" : "#131328",
                  alignSelf: m.role==="user" ? "flex-end" : "flex-start",
                  color: m.role==="user" ? "#c8d4ff" : "#d0d0e8",
                  border: m.role==="ai" ? "1px solid #1e1e38" : "none",
                  whiteSpace:"pre-wrap",
                }}>
                  {m.text}
                </div>
              ))}
              {aiLoading && <div className="ai-msg pulse" style={{ background:"#131328", color:"#444", alignSelf:"flex-start" }}>กำลังคิด...</div>}
              <div ref={aiEndRef} />
            </div>
            <div style={{ padding:10, borderTop:"1px solid #1a1a30" }}>
              <textarea value={aiInput} onChange={e=>setAiInput(e.target.value)}
                placeholder="ถาม AI... (Enter ส่ง)" rows={2}
                style={{ resize:"none", marginBottom:6, fontSize:13 }}
                onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendAI(); } }} />
              <button className="btn btn-blue" style={{ width:"100%", fontSize:13 }} onClick={sendAI} disabled={aiLoading}>
                {aiLoading ? "..." : "ส่ง"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ MODAL: EVENT ════ */}
      {modal==="event" && (
        <div className="modal-bg" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
              <span style={{ fontWeight:700, fontSize:17 }}>{editTarget?"✏️ แก้ไขกิจกรรม":"➕ เพิ่มกิจกรรมใหม่"}</span>
              <div style={{ flex:1 }}/><button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><label>ชื่อกิจกรรม *</label><input value={evForm.summary} onChange={e=>setEvForm(f=>({...f,summary:e.target.value}))} placeholder="เพิ่มชื่อ"/></div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}><label>เริ่ม</label><input type={evForm.allDay?"date":"datetime-local"} value={evForm.allDay?evForm.start?.split("T")[0]:evForm.start} onChange={e=>setEvForm(f=>({...f,start:e.target.value}))}/></div>
                <div style={{ flex:1 }}><label>สิ้นสุด</label><input type={evForm.allDay?"date":"datetime-local"} value={evForm.allDay?evForm.end?.split("T")[0]:evForm.end} onChange={e=>setEvForm(f=>({...f,end:e.target.value}))}/></div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="checkbox" id="allday" checked={evForm.allDay} onChange={e=>setEvForm(f=>({...f,allDay:e.target.checked}))} style={{ width:"auto" }}/>
                <label htmlFor="allday" style={{ margin:0, cursor:"pointer", color:"#bbb" }}>ทั้งวัน</label>
              </div>
              <div><label>สถานที่</label><input value={evForm.location} onChange={e=>setEvForm(f=>({...f,location:e.target.value}))} placeholder="เพิ่มสถานที่"/></div>
              <div><label>รายละเอียด</label><textarea value={evForm.description} onChange={e=>setEvForm(f=>({...f,description:e.target.value}))} rows={3} style={{ resize:"vertical" }} placeholder="รายละเอียด"/></div>
              <div>
                <label>สี</label>
                <div style={{ display:"flex", gap:6 }}>
                  {Object.entries({1:"#7986CB",2:"#33B679",3:"#8E24AA",4:"#E67C73",5:"#F6BF26",6:"#F4511E",7:"#039BE5",8:"#616161",9:"#3F51B5",10:"#0B8043",11:"#D50000"}).map(([id,c])=>(
                    <div key={id} onClick={()=>setEvForm(f=>({...f,colorId:id}))}
                      style={{ width:22,height:22,borderRadius:"50%",background:c,cursor:"pointer",
                        border: evForm.colorId===id?"3px solid #fff":"3px solid transparent",transform:evForm.colorId===id?"scale(1.15)":"none",transition:"all .15s" }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
              {editTarget && <button className="btn btn-red btn-sm" onClick={()=>deleteEvent(editTarget)}>🗑️ ลบ</button>}
              <div style={{ flex:1 }}/>
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>ยกเลิก</button>
              <button className="btn btn-blue" onClick={saveEvent} disabled={loading}>{loading?"กำลังบันทึก...":editTarget?"บันทึก":"เพิ่มลงปฏิทิน"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: TODO ════ */}
      {modal==="todo" && (
        <div className="modal-bg" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:20 }}>
              <span style={{ fontWeight:700, fontSize:17 }}>{editTarget?"✏️ แก้ไขงาน":"➕ เพิ่มงานใหม่"}</span>
              <div style={{ flex:1 }}/><button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div><label>ชื่องาน *</label><input value={todoForm.text} onChange={e=>setTodoForm(f=>({...f,text:e.target.value}))} placeholder="ต้องทำอะไร..."/></div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <label>วันที่</label>
                  <input type="date" value={todoForm.date} onChange={e=>setTodoForm(f=>({...f,date:e.target.value}))}/>
                </div>
                <div style={{ flex:1 }}>
                  <label>เวลา (ถ้ามี)</label>
                  <input type="time" value={todoForm.time} onChange={e=>setTodoForm(f=>({...f,time:e.target.value}))}/>
                </div>
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
            <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
              {editTarget && (
                <button className="btn btn-red btn-sm" onClick={()=>{ deleteTodo(editTarget.id); setModal(null); }}>🗑️ ลบ</button>
              )}
              <div style={{ flex:1 }}/>
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>ยกเลิก</button>
              <button className="btn btn-blue" onClick={saveTodo}>{editTarget?"บันทึก":"เพิ่มงาน"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
