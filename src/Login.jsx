import { useState } from "react";
import { api, setToken } from "./api.js";

export default function Login({ onLogin }) {
  const [mode,     setMode]     = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "register") {
        if (!username.trim())     throw new Error("กรุณาใส่ชื่อผู้ใช้");
        if (password.length < 4)  throw new Error("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
        if (password !== confirm)  throw new Error("รหัสผ่านไม่ตรงกัน");
        const data = await api.auth.register(username.trim(), password);
        setToken(data.token);
        onLogin(data.username);
      } else {
        if (!username.trim())     throw new Error("กรุณาใส่ชื่อผู้ใช้");
        if (!password)            throw new Error("กรุณาใส่รหัสผ่าน");
        const data = await api.auth.login(username.trim(), password);
        setToken(data.token);
        onLogin(data.username);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a14", display:"flex",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Noto Sans Thai',Sarabun,sans-serif", padding:"20px 16px" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        *{-webkit-tap-highlight-color:transparent}
        .li{background:#181830;border:1px solid #2a2a45;border-radius:12px;color:#e2e2f0;
          font-family:inherit;font-size:15px;padding:14px 16px;width:100%;transition:border .15s;outline:none}
        .li:focus{border-color:#4f6ef7}
        .lb{width:100%;padding:14px;border:none;border-radius:12px;font-family:inherit;
          font-size:15px;font-weight:600;cursor:pointer;transition:all .15s}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
      `}</style>

      <div style={{ width:"100%", maxWidth:400, animation:"fadeUp .35s ease" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:52, marginBottom:8 }}>✦</div>
          <div style={{ fontSize:30, fontWeight:700, color:"#7b9ef7", letterSpacing:1 }}>MyDay</div>
          <div style={{ fontSize:13, color:"#444", marginTop:5 }}>ปฏิทิน · การเงิน · ตลาดหุ้น</div>
        </div>

        <div style={{ background:"#111125", border:"1px solid #1e1e38", borderRadius:20, padding:"28px 24px" }}>
          {/* Tab */}
          <div style={{ display:"flex", background:"#0d0d1e", borderRadius:10, padding:3, marginBottom:22 }}>
            {[["login","เข้าสู่ระบบ"],["register","สมัครสมาชิก"]].map(([m,l]) => (
              <button key={m} onClick={()=>{ setMode(m); setError(""); }}
                style={{ flex:1, padding:"9px", border:"none", borderRadius:8, fontFamily:"inherit",
                  fontSize:13, cursor:"pointer", transition:"all .15s",
                  background: mode===m ? "#1e2555" : "transparent",
                  color: mode===m ? "#7b9ef7" : "#555", fontWeight: mode===m ? 600 : 400 }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ fontSize:16, fontWeight:600, color:"#e2e2f0", marginBottom:18 }}>
            {mode === "register" ? "สร้างบัญชีของคุณ" : "ยินดีต้อนรับกลับ"}
          </div>

          <form onSubmit={handle} style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <label style={{ fontSize:12, color:"#555", display:"block", marginBottom:6 }}>ชื่อผู้ใช้</label>
              <input className="li" value={username} onChange={e=>setUsername(e.target.value)}
                placeholder="ชื่อผู้ใช้" autoComplete="username" autoCapitalize="none" />
            </div>

            <div>
              <label style={{ fontSize:12, color:"#555", display:"block", marginBottom:6 }}>รหัสผ่าน</label>
              <div style={{ position:"relative" }}>
                <input className="li" type={showPw?"text":"password"} value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder={mode==="register" ? "อย่างน้อย 4 ตัวอักษร" : "รหัสผ่าน"}
                  autoComplete={mode==="register" ? "new-password" : "current-password"}
                  style={{ paddingRight:48 }} />
                <button type="button" onClick={()=>setShowPw(v=>!v)}
                  style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#444" }}>
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label style={{ fontSize:12, color:"#555", display:"block", marginBottom:6 }}>ยืนยันรหัสผ่าน</label>
                <input className="li" type={showPw?"text":"password"} value={confirm}
                  onChange={e=>setConfirm(e.target.value)} placeholder="ยืนยันรหัสผ่านอีกครั้ง"
                  autoComplete="new-password" />
              </div>
            )}

            {error && (
              <div style={{ background:"#7f1d1d44", border:"1px solid #7f1d1d", borderRadius:10,
                padding:"10px 14px", fontSize:13, color:"#fca5a5" }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" className="lb" disabled={loading}
              style={{ background: loading ? "#1e1e38" : "linear-gradient(135deg,#3b5eda,#6b4ef7)",
                color: loading ? "#444" : "#fff", marginTop:4 }}>
              {loading ? "กำลังดำเนินการ..." : mode === "register" ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
            </button>
          </form>
        </div>

        <div style={{ textAlign:"center", fontSize:11, color:"#2a2a40", marginTop:20, lineHeight:1.8 }}>
          ข้อมูลของคุณถูกเก็บบน Server อย่างปลอดภัย<br/>
          รหัสผ่านถูก Hash ด้วย bcrypt ก่อนบันทึก
        </div>
      </div>
    </div>
  );
}
