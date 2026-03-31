import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc
} from "firebase/firestore";

const PEOPLE = ["Silvia", "Xavi"];
const PERSON_STYLE = {
  Silvia: { bg: "#fce4ec", accent: "#e91e8c", emoji: "👩" },
  Xavi:   { bg: "#e3f2fd", accent: "#1976d2", emoji: "👨" },
};

const TAREAS_BASE = [
  { title: "Aspirar suelo",  cat: "Suelo",  firstPerson: "Silvia" },
  { title: "Fregar suelo",   cat: "Suelo",  firstPerson: "Silvia" },
  { title: "Limpiar polvo",  cat: "Salón",  firstPerson: "Xavi"   },
  { title: "Limpiar cocina", cat: "Cocina", firstPerson: "Xavi"   },
  { title: "Limpiar baño",   cat: "Baño",   firstPerson: "Silvia" },
  { title: "Hacer lavadora", cat: "Ropa",   firstPerson: "Xavi"   },
  { title: "Tender ropa",    cat: "Ropa",   firstPerson: "Xavi"   },
  { title: "Barrer balcón",  cat: "Balcón", firstPerson: "Silvia" },
];

const CAT_ICON = {
  Suelo:"🧹", Salón:"🛋️", Cocina:"🍳", Baño:"🚿",
  Ropa:"👕", Balcón:"🌿", Ventanas:"🪟", Otro:"📦"
};

function generateSemanas(count = 20) {
  const semanas = [];
  let base = new Date(2025, 1, 6);
  for (let i = 0; i < count; i++) {
    const d = String(base.getDate()).padStart(2,"0");
    const m = String(base.getMonth()+1).padStart(2,"0");
    semanas.push({ label: `${d}/${m}`, date: new Date(base), idx: i });
    base = new Date(base.getTime() + 7*24*3600*1000);
  }
  return semanas;
}
const ALL_SEMANAS = generateSemanas(20);

function buildSemanaTaskIds(semanaLabel, semanaIdx) {
  const tasks = [];
  TAREAS_BASE.forEach((t, i) => {
    const person = semanaIdx % 2 === 0
      ? t.firstPerson
      : (t.firstPerson === "Silvia" ? "Xavi" : "Silvia");
    tasks.push({
      id: `${semanaLabel}-${i}`,
      title: t.title, cat: t.cat,
      person, semana: semanaLabel, done: false, extra: false
    });
  });
  if (semanaIdx % 5 === 0) {
    tasks.push({
      id: `${semanaLabel}-ventanas`,
      title: "Limpiar ventanas", cat: "Ventanas",
      person: "Ambos", semana: semanaLabel, done: false, extra: false
    });
  }
  return tasks;
}

function getSemanaActual() {
  const today = new Date();
  let closest = ALL_SEMANAS[0];
  let minDiff = Infinity;
  ALL_SEMANAS.forEach(s => {
    const diff = Math.abs(today - s.date);
    if (diff < minDiff) { minDiff = diff; closest = s; }
  });
  return closest.label;
}

export default function App() {
  const [semana, setSemana]           = useState(getSemanaActual);
  const [dbTasks, setDbTasks]         = useState({});   // { id: {done} } from Firestore
  const [extras, setExtras]           = useState([]);
  const [filterPerson, setFilterPerson] = useState(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [customTasks, setCustomTasks] = useState([]);   // extra obligatorias añadidas manualmente
  const [form, setForm]               = useState({ title:"", person:"Silvia", cat:"Suelo" });
  const [confetti, setConfetti]       = useState(false);
  const [extraInput, setExtraInput]   = useState({ Silvia:"", Xavi:"" });
  const [extraTab, setExtraTab]       = useState("Silvia");
  const [loading, setLoading]         = useState(true);

  const semIdx = ALL_SEMANAS.findIndex(s => s.label === semana);
  const prevSem = semIdx > 0 ? ALL_SEMANAS[semIdx-1].label : null;
  const nextSem = semIdx < ALL_SEMANAS.length-1 ? ALL_SEMANAS[semIdx+1].label : null;

  // Tareas base de esta semana
  const baseTasks = buildSemanaTaskIds(semana, semIdx);
  // Tareas custom de esta semana
  const semCustom = customTasks.filter(t => t.semana === semana);
  // Todas las tareas obligatorias de esta semana
  const allSemTasks = [...baseTasks, ...semCustom].map(t => ({
    ...t,
    done: dbTasks[t.id]?.done ?? false
  }));

  // Escuchar Firestore en tiempo real
  useEffect(() => {
    setLoading(true);
    // Tareas (estado done)
    const unsubTasks = onSnapshot(collection(db, "tasks"), snap => {
      const map = {};
      snap.forEach(d => { map[d.id] = d.data(); });
      setDbTasks(map);
      setLoading(false);
    });
    // Extras
    const unsubExtras = onSnapshot(collection(db, "extras"), snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      arr.sort((a,b) => (a.ts||0) - (b.ts||0));
      setExtras(arr);
    });
    // Custom tasks
    const unsubCustom = onSnapshot(collection(db, "customTasks"), snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      setCustomTasks(arr);
    });
    return () => { unsubTasks(); unsubExtras(); unsubCustom(); };
  }, []);

  // Toggle tarea en Firestore
  const toggle = async (taskId, currentDone) => {
    await setDoc(doc(db, "tasks", taskId), { done: !currentDone }, { merge: true });
    // Check si semana completada
    const updated = allSemTasks.map(t => t.id === taskId ? {...t, done: !currentDone} : t);
    if (updated.length > 0 && updated.every(t => t.done)) {
      setConfetti(true); setTimeout(() => setConfetti(false), 3500);
    }
  };

  // Borrar tarea custom
  const deleteCustomTask = async (id) => {
    await deleteDoc(doc(db, "customTasks", id));
    await deleteDoc(doc(db, "tasks", id));
  };

  // Añadir tarea custom
  const addTask = async () => {
    if (!form.title.trim()) return;
    const id = `custom-${Date.now()}`;
    await setDoc(doc(db, "customTasks", id), { ...form, semana, done: false, extra: false });
    setShowAdd(false);
    setForm({ title:"", person:"Silvia", cat:"Suelo" });
  };

  // Añadir extra
  const addExtra = async (person) => {
    const text = extraInput[person].trim();
    if (!text) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const id = `extra-${Date.now()}`;
    await setDoc(doc(db, "extras", id), { text, person, semana, time, ts: Date.now() });
    setExtraInput({ ...extraInput, [person]: "" });
  };

  const deleteExtra = async (id) => { await deleteDoc(doc(db, "extras", id)); };

  const semTasks = allSemTasks.filter(t =>
    !filterPerson || t.person === filterPerson || t.person === "Ambos"
  );
  const doneSem = allSemTasks.filter(t => t.done).length;
  const progSem = allSemTasks.length ? Math.round(doneSem / allSemTasks.length * 100) : 0;

  const semExtras = extras.filter(e => e.semana === semana);
  const semExtrasByPerson = (p) => semExtras.filter(e => e.person === p);

  const personStats = (p) => {
    const mine = allSemTasks.filter(t => t.person === p || t.person === "Ambos");
    const done = mine.filter(t => t.done).length;
    return { total: mine.length, done, pct: mine.length ? Math.round(done/mine.length*100) : 0 };
  };

  const byCategory = {};
  semTasks.forEach(t => {
    if (!byCategory[t.cat]) byCategory[t.cat] = [];
    byCategory[t.cat].push(t);
  });

  const Ring = ({ pct, color, size=50 }) => {
    const r = (size-8)/2, circ = 2*Math.PI*r, dash = (pct/100)*circ;
    return (
      <svg width={size} height={size} style={{flexShrink:0}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ffffff30" strokeWidth="6"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{transition:"stroke-dasharray 0.6s ease"}}/>
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em"
          fontSize={11} fontWeight="800" fill={color}>{pct}%</text>
      </svg>
    );
  };

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#f0f4f8",fontFamily:"'Nunito',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>🏠</div>
        <div style={{color:"#2563eb",fontWeight:800,fontSize:18}}>Cargando...</div>
        <div style={{color:"#94a3b8",fontSize:13,marginTop:4}}>Sincronizando con Firebase</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#f0f4f8",fontFamily:"'Nunito','Segoe UI',sans-serif",paddingBottom:60}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(140deg,#1a2e52 0%,#2563eb 100%)",
        padding:"26px 20px 22px",borderRadius:"0 0 30px 30px",boxShadow:"0 6px 32px #1a2e5250"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{color:"#93c5fd",fontSize:11,letterSpacing:2,fontWeight:700}}>TAREAS DEL HOGAR 🏠</div>
            <div style={{color:"white",fontSize:26,fontWeight:900,letterSpacing:-0.5}}>Silvia & Xavi</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{width:8,height:8,borderRadius:99,background:"#34d399",boxShadow:"0 0 6px #34d399"}}/>
            <span style={{color:"#a7f3d0",fontSize:11,fontWeight:700}}>En vivo</span>
            <button onClick={() => setShowAdd(true)} style={{
              background:"white",color:"#2563eb",border:"none",
              borderRadius:14,padding:"10px 18px",fontWeight:900,fontSize:20,
              cursor:"pointer",boxShadow:"0 2px 12px #0003",marginLeft:8
            }}>＋</button>
          </div>
        </div>

        {/* Nav semana */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          background:"#ffffff18",borderRadius:16,padding:"10px 16px",marginBottom:16}}>
          <button onClick={() => prevSem && setSemana(prevSem)} style={{
            background:"none",border:"none",color:prevSem?"white":"#ffffff30",
            fontSize:24,cursor:prevSem?"pointer":"default",padding:"0 4px"}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{color:"#93c5fd",fontSize:11,fontWeight:700,letterSpacing:1}}>SEMANA</div>
            <div style={{color:"white",fontWeight:900,fontSize:18}}>Viernes {semana}</div>
          </div>
          <button onClick={() => nextSem && setSemana(nextSem)} style={{
            background:"none",border:"none",color:nextSem?"white":"#ffffff30",
            fontSize:24,cursor:nextSem?"pointer":"default",padding:"0 4px"}}>›</button>
        </div>

        {/* Progreso */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",color:"#93c5fd",fontSize:12,marginBottom:5}}>
            <span>Progreso semanal</span>
            <span style={{fontWeight:700}}>{doneSem}/{allSemTasks.length} ✓</span>
          </div>
          <div style={{background:"#ffffff25",borderRadius:99,height:11,overflow:"hidden"}}>
            <div style={{width:`${progSem}%`,height:"100%",
              background:"linear-gradient(90deg,#60a5fa,#34d399)",
              borderRadius:99,transition:"width 0.5s ease"}}/>
          </div>
          <div style={{color:"white",fontWeight:900,fontSize:17,textAlign:"right",marginTop:2}}>{progSem}%</div>
        </div>

        {/* Cards persona */}
        <div style={{display:"flex",gap:10}}>
          {PEOPLE.map(p => {
            const s = personStats(p);
            const ps = PERSON_STYLE[p];
            const active = filterPerson === p;
            return (
              <div key={p} onClick={() => setFilterPerson(active ? null : p)} style={{
                flex:1,background:active?"white":"#ffffff18",
                borderRadius:18,padding:"10px 14px",
                display:"flex",alignItems:"center",gap:10,
                cursor:"pointer",border:`2px solid ${active?"white":"transparent"}`,transition:"all 0.2s"}}>
                <Ring pct={s.pct} color={active?ps.accent:"white"} size={46}/>
                <div>
                  <div style={{color:active?ps.accent:"white",fontWeight:800,fontSize:15}}>
                    {ps.emoji} {p}
                  </div>
                  <div style={{color:active?"#94a3b8":"#bfdbfe",fontSize:12}}>{s.done}/{s.total} hechas</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TAREAS */}
      <div style={{padding:"18px 16px 0"}}>
        {Object.keys(byCategory).length === 0 && (
          <div style={{textAlign:"center",padding:48,color:"#94a3b8",fontSize:15}}>🎉 ¡Sin tareas aquí!</div>
        )}

        {Object.entries(byCategory).map(([cat, catTasks]) => {
          const catDone = catTasks.filter(t => t.done).length;
          const allDone = catDone === catTasks.length;
          return (
            <div key={cat} style={{marginBottom:18}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                <span style={{fontSize:20}}>{CAT_ICON[cat]||"📦"}</span>
                <span style={{fontWeight:900,color:"#1a2e52",fontSize:15}}>{cat}</span>
                <div style={{flex:1,height:1,background:"#e2e8f0",marginLeft:4}}/>
                <span style={{
                  background:allDone?"#dcfce7":"#f1f5f9",
                  color:allDone?"#16a34a":"#94a3b8",
                  borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700
                }}>{catDone}/{catTasks.length}</span>
              </div>

              {catTasks.map(t => {
                const ps = t.person==="Ambos"
                  ? {bg:"#f3e8ff",accent:"#9333ea",emoji:"👫"}
                  : PERSON_STYLE[t.person];
                return (
                  <div key={t.id} style={{
                    background:"white",borderRadius:16,padding:"13px 14px",
                    marginBottom:8,display:"flex",alignItems:"center",gap:12,
                    boxShadow:"0 1px 8px #0000000a",
                    border:`1.5px solid ${t.done?"#e2e8f0":ps.accent+"28"}`,
                    opacity:t.done?0.55:1,transition:"all 0.2s"}}>
                    <button onClick={() => toggle(t.id, t.done)} style={{
                      width:30,height:30,borderRadius:9,flexShrink:0,
                      background:t.done?"#22c55e":"white",
                      border:`2.5px solid ${t.done?"#22c55e":"#d1d5db"}`,
                      cursor:"pointer",display:"flex",alignItems:"center",
                      justifyContent:"center",color:"white",fontSize:15,transition:"all 0.2s"
                    }}>{t.done?"✓":""}</button>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:"#0f172a",fontSize:14,
                        textDecoration:t.done?"line-through":"none"}}>{t.title}</div>
                    </div>
                    <span style={{background:ps.bg,color:ps.accent,
                      borderRadius:10,padding:"3px 11px",fontSize:12,fontWeight:800,flexShrink:0}}>
                      {ps.emoji} {t.person}
                    </span>
                    {t.id.startsWith("custom-") && (
                      <button onClick={() => deleteCustomTask(t.id)} style={{
                        background:"none",border:"none",color:"#cbd5e1",
                        fontSize:13,cursor:"pointer",padding:2,flexShrink:0}}>✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* EXTRAS */}
        <div style={{background:"white",borderRadius:22,boxShadow:"0 2px 16px #0000000d",
          overflow:"hidden",marginTop:8,marginBottom:20,border:"1.5px solid #f0f4f8"}}>
          <div style={{background:"linear-gradient(120deg,#f59e0b,#f97316)",
            padding:"14px 18px 12px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>⭐</span>
            <div>
              <div style={{color:"white",fontWeight:900,fontSize:16}}>Extras de la semana</div>
              <div style={{color:"#fef3c7",fontSize:11}}>
                Tareas de más que habéis hecho · {semExtras.length} anotadas
              </div>
            </div>
          </div>

          <div style={{display:"flex",borderBottom:"1.5px solid #f1f5f9"}}>
            {PEOPLE.map(p => {
              const ps = PERSON_STYLE[p];
              const count = semExtrasByPerson(p).length;
              const active = extraTab === p;
              return (
                <button key={p} onClick={() => setExtraTab(p)} style={{
                  flex:1,padding:"11px 8px",border:"none",
                  background:active?ps.bg:"white",
                  color:active?ps.accent:"#94a3b8",
                  fontWeight:active?800:600,fontSize:14,
                  cursor:"pointer",transition:"all 0.2s",
                  borderBottom:active?`3px solid ${ps.accent}`:"3px solid transparent"}}>
                  {ps.emoji} {p}
                  {count > 0 && (
                    <span style={{background:ps.accent,color:"white",
                      borderRadius:99,padding:"1px 7px",fontSize:10,
                      fontWeight:800,marginLeft:6}}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {(() => {
            const ps = PERSON_STYLE[extraTab];
            const myExtras = semExtrasByPerson(extraTab);
            return (
              <div style={{padding:"14px 16px 16px"}}>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <input
                    value={extraInput[extraTab]}
                    onChange={e => setExtraInput({...extraInput,[extraTab]:e.target.value})}
                    onKeyDown={e => e.key==="Enter" && addExtra(extraTab)}
                    placeholder={`${extraTab}, ¿qué has hecho de más?`}
                    style={{flex:1,padding:"10px 14px",borderRadius:12,
                      border:`1.5px solid ${ps.accent}40`,
                      fontSize:13,color:"#0f172a",outline:"none",
                      fontFamily:"inherit",background:"#fafafa"}}
                  />
                  <button onClick={() => addExtra(extraTab)} style={{
                    background:ps.accent,color:"white",border:"none",
                    borderRadius:12,padding:"10px 16px",fontWeight:800,
                    fontSize:16,cursor:"pointer",flexShrink:0}}>＋</button>
                </div>

                {myExtras.length === 0 ? (
                  <div style={{textAlign:"center",padding:"18px 10px",color:"#cbd5e1",fontSize:13}}>
                    Nada anotado aún · escribe arriba ↑
                  </div>
                ) : myExtras.map(e => (
                  <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,
                    background:ps.bg,borderRadius:12,padding:"10px 12px",marginBottom:7,
                    border:`1px solid ${ps.accent}20`}}>
                    <span style={{fontSize:16,flexShrink:0}}>⭐</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:"#0f172a",fontSize:13}}>{e.text}</div>
                      <div style={{color:ps.accent,fontSize:11,marginTop:1}}>
                        {ps.emoji} {e.person} · {e.time}
                      </div>
                    </div>
                    <button onClick={() => deleteExtra(e.id)} style={{
                      background:"none",border:"none",color:"#cbd5e1",
                      fontSize:13,cursor:"pointer",padding:2,flexShrink:0}}>✕</button>
                  </div>
                ))}

                {myExtras.length > 0 && (
                  <div style={{textAlign:"center",marginTop:10,
                    background:`${ps.accent}12`,borderRadius:10,
                    padding:"7px 10px",color:ps.accent,fontWeight:700,fontSize:12}}>
                    🏆 {extraTab} ha hecho {myExtras.length} tarea{myExtras.length>1?"s":""} extra
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Resumen */}
        <div style={{background:"white",borderRadius:20,padding:"16px 18px",
          boxShadow:"0 1px 8px #0000000a",marginBottom:8}}>
          <div style={{fontWeight:800,color:"#1a2e52",fontSize:13,marginBottom:12}}>⚖️ Reparto esta semana</div>
          <div style={{display:"flex",gap:10}}>
            {PEOPLE.map(p => {
              const mine = allSemTasks.filter(t => t.person === p);
              const ps = PERSON_STYLE[p];
              const xExtras = semExtrasByPerson(p).length;
              return (
                <div key={p} style={{flex:1,background:ps.bg,borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
                  <div style={{fontSize:26}}>{ps.emoji}</div>
                  <div style={{fontWeight:900,color:ps.accent,fontSize:15,marginTop:2}}>{p}</div>
                  <div style={{color:"#6b7280",fontSize:12}}>{mine.length} obligatorias</div>
                  <div style={{color:ps.accent,fontWeight:700,fontSize:12}}>
                    {mine.filter(t=>t.done).length} completadas
                  </div>
                  {xExtras > 0 && (
                    <div style={{background:ps.accent,color:"white",borderRadius:8,
                      padding:"2px 8px",fontSize:11,fontWeight:800,marginTop:6,display:"inline-block"}}>
                      ⭐ {xExtras} extra{xExtras>1?"s":""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{textAlign:"center",color:"#94a3b8",fontSize:11,marginTop:10}}>
            🔄 Rotación automática · 🔥 Sincronizado en tiempo real
          </div>
        </div>
      </div>

      {/* CELEBRACIÓN */}
      {confetti && (
        <div onClick={() => setConfetti(false)} style={{
          position:"fixed",inset:0,background:"#00000065",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:"white",borderRadius:28,padding:"38px 44px",
            textAlign:"center",boxShadow:"0 8px 40px #0005"}}>
            <div style={{fontSize:62}}>🎉</div>
            <div style={{fontWeight:900,fontSize:22,color:"#2563eb",marginTop:12}}>¡Semana completada!</div>
            <div style={{color:"#6b7280",marginTop:8}}>Silvia y Xavi son un equipazo 🏆</div>
            <div style={{color:"#cbd5e1",fontSize:12,marginTop:16}}>Toca para cerrar</div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {showAdd && (
        <div style={{position:"fixed",inset:0,background:"#00000055",
          display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:50}}>
          <div style={{background:"white",borderRadius:"28px 28px 0 0",
            padding:"28px 22px 48px",width:"100%",maxWidth:500,boxShadow:"0 -4px 30px #0003"}}>
            <div style={{fontWeight:900,fontSize:20,color:"#1a2e52",marginBottom:18}}>➕ Añadir tarea</div>
            <label style={L}>Nombre</label>
            <input value={form.title} onChange={e => setForm({...form,title:e.target.value})}
              placeholder="Ej: Limpiar nevera" style={I} autoFocus/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={L}>Persona</label>
                <select value={form.person} onChange={e => setForm({...form,person:e.target.value})} style={I}>
                  <option>Silvia</option><option>Xavi</option><option>Ambos</option>
                </select>
              </div>
              <div>
                <label style={L}>Categoría</label>
                <select value={form.cat} onChange={e => setForm({...form,cat:e.target.value})} style={I}>
                  {Object.keys(CAT_ICON).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={() => setShowAdd(false)} style={{
                flex:1,padding:14,borderRadius:14,border:"2px solid #e2e8f0",
                background:"white",color:"#64748b",fontWeight:700,cursor:"pointer",fontSize:15}}>Cancelar</button>
              <button onClick={addTask} style={{
                flex:2,padding:14,borderRadius:14,border:"none",
                background:"linear-gradient(120deg,#1a2e52,#2563eb)",
                color:"white",fontWeight:800,cursor:"pointer",fontSize:15}}>Añadir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const L = {display:"block",fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase",letterSpacing:0.5};
const I = {width:"100%",padding:"10px 12px",borderRadius:12,border:"1.5px solid #e2e8f0",fontSize:14,color:"#0f172a",outline:"none",marginBottom:12,boxSizing:"border-box",fontFamily:"inherit",background:"#f8fafc"};
