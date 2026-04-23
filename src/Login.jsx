import { useState } from "react";

const LS_AUTH = "myday_auth_v1";

/* SHA-256 via Web Crypto (built-in browser API) */
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function loadAuth() {
  try { return JSON.parse(localStorage.getItem(LS_AUTH)); } catch { return null; }
}
function saveAuth(data) { localStorage.setItem(LS_AUTH, JSON.stringify(data)); }
export function clearAuth() { localStorage.removeItem(LS_AUTH); }

/* ── hook ที่ใช้ใน main ── */
export function useAuth() {
  const stored = loadAuth();
  return { isRegistered: !!stored, username: stored?.username || "" };
}

/* ════════════════════════════════════ */
export default function Login({ onLogin }) {
  const stored   = loadAuth();
  const isNew    = !stored;

  const [mode,     setMode]     = useState(isNew ? "register" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);

    if (mode === "register") {
      if (!username.trim())         { setError("กรุณาใส่ชื่อผู้ใช้"); setLoading(false); return; }
      if (password.length < 4)      { setError("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร"); setLoading(false); return; }
      if (password !== confirm)     { setError("รหัสผ่านไม่ตรงกัน"); setLoading(false); return; }
      const hash = await sha256(password);
      saveAuth({ username: username.trim(), hash });
      onLogin(username.trim());
    } else {
      if (!stored) { setError("ยังไม่มีบัญชี กรุณาสมัครก่อน"); setLoading(false); return; }
      const hash = await sha256(password);
      if (hash !== stored.hash) { setError("รหัสผ่านไม่ถูกต้อง"); setLoading(false); return; }
      onLogin(stored.username);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a14", display:"flex", alignItems:"center",
      justifyContent:"center", fontFamily:"'Noto Sans Thai',Sarabun,sans-serif", padding:20 }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        * { -webkit-tap-highlight-color: transparent; }
        .login-input{background:#181830;border:1px solid #2a2a45;border-radius:12px;color:#e2e2f0;
          font-family:inherit;font-size:15px;padding:14px 16px;width:100%;transition:border .15s;outline:none}
        .login-input:focus{border-color:#4f6ef7}
        .login-btn{width:100%;padding:14px;border:none;border-radius:12px;font-family:inherit;
          font-size:15px;font-weight:600;cursor:pointer;transition:all .15s}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
      `}</style>

      <div style={{ width:"100%", maxWidth:360, animation:"fadeUp .35s ease" }}>

        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>✦</div>
          <div style={{ fontSize:28, fontWeight:700, color:"#7b9ef7", letterSpacing:1 }}>MyDay</div>
          <div style={{ fontSize:13, color:"#444", marginTop:4 }}>ปฏิทิน · การเงิน · ตลาดหุ้น</div>
        </div>

        {/* Card */}
        <div style={{ background:"#111125", border:"1px solid #1e1e38", borderRadius:20, padding:"28px 24px" }}>

          {/* Tab toggle — แสดงเฉพาะเมื่อมีบัญชีแล้ว */}
          {!isNew && (
            <div style={{ display:"flex", background:"#0d0d1e", borderRadius:10, padding:3, marginBottom:22 }}>
              {[["login","เข้าสู่ระบบ"],["register","สมัครใหม่"]].map(([m,l]) => (
                <button key={m} onClick={()=>{ setMode(m); setError(""); }}
                  style={{ flex:1, padding:"8px", border:"none", borderRadius:8, fontFamily:"inherit",
                    fontSize:13, cursor:"pointer", transition:"all .15s",
                    background: mode===m ? "#1e2555" : "transparent",
                    color: mode===m ? "#7b9ef7" : "#555", fontWeight: mode===m ? 600 : 400 }}>
                  {l}
                </button>
              ))}
            </div>
          )}

          <div style={{ fontSize:16, fontWeight:600, color:"#e2e2f0", marginBottom:18 }}>
            {mode === "register" ? (isNew ? "สร้างบัญชีของคุณ" : "สมัครสมาชิกใหม่") : `ยินดีต้อนรับกลับ${stored?.username ? `, ${stored.username}` : ""}`}
          </div>

          <form onSubmit={handle} style={{ display:"flex", flexDirection:"column", gap:12 }}>

            {/* Username — แสดงเมื่อ register หรือ login ครั้งแรก */}
            {(mode === "register") && (
              <div>
                <label style={{ fontSize:12, color:"#555", display:"block", marginBottom:6 }}>ชื่อผู้ใช้</label>
                <input className="login-input" value={username} onChange={e=>setUsername(e.target.value)}
                  placeholder="ตั้งชื่อผู้ใช้ของคุณ" autoComplete="username" />
              </div>
            )}

            {/* Password */}
            <div>
              <label style={{ fontSize:12, color:"#555", display:"block", marginBottom:6 }}>รหัสผ่าน</label>
              <div style={{ position:"relative" }}>
                <input className="login-input" type={showPw?"text":"password"} value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder={mode==="register" ? "ตั้งรหัสผ่าน (อย่างน้อย 4 ตัว)" : "ใส่รหัสผ่าน"}
                  autoComplete={mode==="register"?"new-password":"current-password"}
                  style={{ paddingRight:44 }} />
                <button type="button" onClick={()=>setShowPw(v=>!v)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#444" }}>
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            {mode === "register" && (
              <div>
                <label style={{ fontSize:12, color:"#555", display:"block", marginBottom:6 }}>ยืนยันรหัสผ่าน</label>
                <input className="login-input" type={showPw?"text":"password"} value={confirm}
                  onChange={e=>setConfirm(e.target.value)} placeholder="ใส่รหัสผ่านอีกครั้ง"
                  autoComplete="new-password" />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ background:"#7f1d1d44", border:"1px solid #7f1d1d", borderRadius:10,
                padding:"10px 14px", fontSize:13, color:"#fca5a5" }}>
                ⚠️ {error}
              </div>
            )}

            {/* Submit */}
            <button type="submit" className="login-btn" disabled={loading}
              style={{ background: loading ? "#1e1e38" : "linear-gradient(135deg,#3b5eda,#6b4ef7)",
                color: loading ? "#444" : "#fff", marginTop:4 }}>
              {loading ? "กำลังตรวจสอบ..." : mode === "register" ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
            </button>

          </form>
        </div>

        <div style={{ textAlign:"center", fontSize:11, color:"#2a2a40", marginTop:20, lineHeight:1.8 }}>
          ข้อมูลทั้งหมดเก็บบนอุปกรณ์ของคุณเท่านั้น<br/>ไม่มีการส่งข้อมูลออกไปยังเซิร์ฟเวอร์
        </div>
      </div>
    </div>
  );
}
