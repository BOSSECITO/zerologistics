import React, { useEffect, useMemo, useState } from 'react'
import { api, getName } from '../api.js'
import ScannerModal from '../components/ScannerModal.jsx'
import { statusEmoji, statusLabel } from '../utils/status.js'

function openWhatsApp(phone, text){
  const p = (phone||'').replace(/[^0-9]/g,'')
  const msg = encodeURIComponent(text||'Hola, soy tu repartidor de ZERO LOGÍSTICA.')
  const url = p ? `https://wa.me/${p}?text=${msg}` : `https://wa.me/?text=${msg}`
  window.open(url, '_blank')
}
function openMaps(address){
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address||'')}`
  window.open(url, '_blank')
}
function callPhone(phone){
  const p = (phone||'').trim()
  window.location.href = `tel:${p}`
}

export default function Driver(){
  const [err, setErr] = useState('')
  const [pkgs, setPkgs] = useState([])
  const [search, setSearch] = useState('')
  const [scanOpen, setScanOpen] = useState(false)

  const [view, setView] = useState({screen:'list', pkg:null}) // list/detail/deliver/report
  const [reasons, setReasons] = useState([])
  const [selectedReason, setSelectedReason] = useState('')
  const [podNotes, setPodNotes] = useState('')
  const [files, setFiles] = useState([])

  // Acumula selecciones (por si el usuario elige 1 foto, luego otra) y evita duplicados.
  const handlePickImages = (e)=>{
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    setFiles(prev => {
      const all = [...prev, ...picked]
      const seen = new Map()
      for (const f of all){
        const key = `${f.name}_${f.size}_${f.lastModified}`
        if (!seen.has(key)) seen.set(key, f)
      }
      return Array.from(seen.values())
    })
    // permite volver a seleccionar el mismo archivo si hace falta
    e.target.value = ''
  }

  const removePicked = (idx)=> setFiles(prev => prev.filter((_, i)=> i !== idx))

  const [tab, setTab] = useState('PENDING') // PENDING/SUCCESS/FAILED

  // ✅ GPS: manda ubicación del driver cada 3 minutos (para mapa admin)
  useEffect(() => {
    let timer = null
    const send = () => {
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(
        (pos)=>{
          const { latitude, longitude } = pos.coords || {}
          if (typeof latitude === 'number' && typeof longitude === 'number'){
            api.updateMyLocation(latitude, longitude).catch(()=>{})
          }
        },
        ()=>{},
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 }
      )
    }

    // primer envío
    send()
    timer = setInterval(send, 3 * 60 * 1000)
    return () => { if (timer) clearInterval(timer) }
  }, [])

  const load = async ()=>{
    try{
      setErr('')
      const [p, rs] = await Promise.all([api.myPackages(), api.reasons()])
      setPkgs(p); setReasons(rs)
      if (!selectedReason && rs[0]) setSelectedReason(rs[0])
    }catch(e){ setErr(String(e.message||e)) }
  }
  useEffect(()=>{ load() }, [])

  const filtered = useMemo(()=>{
    const q = search.trim().toUpperCase()
    const byText = (p)=> !q || (p.code||'').toUpperCase().includes(q) || (p.recipient_name||'').toUpperCase().includes(q)
    const byTab = (p)=>{
      const s = (p.status||'').toUpperCase()
      if (tab === 'PENDING') return s === 'ASSIGNED'
      if (tab === 'SUCCESS') return s === 'DELIVERED'
      return s === 'NOT_DELIVERED'
    }
    return pkgs.filter(p => byText(p) && byTab(p))
  }, [pkgs, search, tab])

  const pendingCount = pkgs.filter(p => (p.status||'').toUpperCase()==='ASSIGNED').length
  const successCount = pkgs.filter(p => (p.status||'').toUpperCase()==='DELIVERED').length
  const failedCount = pkgs.filter(p => (p.status||'').toUpperCase()==='NOT_DELIVERED').length

  const openDetail = (p)=> setView({screen:'detail', pkg:p})
  const goList = ()=> { setView({screen:'list', pkg:null}); setPodNotes(''); setFiles([]); }
  const goDeliver = ()=> { setView(v=>({screen:'deliver', pkg:v.pkg})); setPodNotes(''); setFiles([]); }
  const goReport = ()=> { setView(v=>({screen:'report', pkg:v.pkg})); setPodNotes(''); setFiles([]); }

  const canClose = files.length >= 2

  // intenta capturar GPS una sola vez para adjuntarlo al cierre (si el usuario lo permite)
  const getCoords = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        const { latitude, longitude } = pos.coords || {}
        if (typeof latitude === 'number' && typeof longitude === 'number'){
          return resolve({ lat: latitude, lng: longitude })
        }
        resolve(null)
      },
      ()=> resolve(null),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 }
    )
  })

  const closeDelivered = async ()=>{
    try{
      setErr('')
      if (!canClose) throw new Error('Mínimo 2 fotos.')
      const coords = await getCoords()
      await api.closeDelivered(view.pkg.id, podNotes || 'Entregado', files, coords)
      await load()
      goList()
      setTab('SUCCESS')
    }catch(e){ setErr(String(e.message||e)) }
  }
  const closeNotDelivered = async ()=>{
    try{
      setErr('')
      if (!canClose) throw new Error('Mínimo 2 fotos.')
      if (!selectedReason) throw new Error('Selecciona un motivo.')
      const coords = await getCoords()
      await api.closeNotDelivered(view.pkg.id, podNotes || 'No entregado', selectedReason, files, coords)
      await load()
      goList()
      setTab('FAILED')
    }catch(e){ setErr(String(e.message||e)) }
  }

  if (view.screen === 'detail' && view.pkg){
    const p = view.pkg
    const s = (p.status||'').toUpperCase()
    const locked = (s === 'DELIVERED' || s === 'NOT_DELIVERED')
    return (
      <div className="container">
        <div className="card">
          <div className="headerRow">
            <h2 style={{margin:0}}>{p.recipient_name}</h2>
            <button className="btn secondary" onClick={goList}>Volver</button>
          </div>
          {err ? <div className="bad">{err}</div> : null}
          <div className="small"><span className="kbd">{p.code}</span> • {statusEmoji(p.status)} {statusLabel(p.status)}</div>
          <hr />
          <div className="small">📍 {p.address}</div>
          <div className="row" style={{marginTop:10}}>
            <button className="btn secondary" onClick={()=>callPhone(p.phone)}>Llamar</button>
            <button className="btn secondary" onClick={()=>openWhatsApp(p.phone, `Hola ${p.recipient_name}, soy tu repartidor de ZERO LOGÍSTICA.`)}>WhatsApp</button>
            <button className="btn secondary" onClick={()=>openMaps(p.address)}>Maps</button>
          </div>

          <hr />
          {locked ? (
            <div className="small">🔒 Pedido cerrado. Solo lectura.</div>
          ) : (
            <div className="row">
              <button className="btn" onClick={goDeliver}>Entregar</button>
              <button className="btn danger" onClick={goReport}>Reportar / No entregado</button>
            </div>
          )}

          {locked ? (
            <>
              <hr />
              <h3>Evidencias</h3>
              <div className="thumbRow">
                {(p.proofs||[]).map(pr => (
                  <a key={pr.id} href={pr.url} target="_blank" rel="noreferrer" title={pr.proof_type}>
                    <img className="thumb" src={pr.url} alt={pr.proof_type} />
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  if ((view.screen === 'deliver' || view.screen === 'report') && view.pkg){
    const p = view.pkg
    const isReport = view.screen === 'report'
    return (
      <div className="container">
        <div className="card">
          <div className="headerRow">
            <h2 style={{margin:0}}>{isReport ? 'Reportar / No entregado' : 'Entregar'}</h2>
            <button className="btn secondary" onClick={()=>setView({screen:'detail', pkg:p})}>Volver</button>
          </div>
          {err ? <div className="bad">{err}</div> : null}
          <div className="small"><span className="kbd">{p.code}</span> • {p.recipient_name}</div>

          <hr />
          <div className="card">
            <h3>Evidencia (obligatoria)</h3>
            <div className="small">Para cerrar: <b>mínimo 2 fotos</b>. {isReport ? 'No entregado: fachada + evidencia.' : 'Entregado: persona + fachada.'}</div>

            <label>Seleccionar fotos (mínimo 2)</label>
            <input className="input" type="file" accept="image/*" multiple onChange={handlePickImages} />
            <div className="small">Seleccionadas: <span className="kbd">{files.length}</span></div>

            {files.length ? (
              <div className="card" style={{marginTop:10}}>
                <div className="small" style={{marginBottom:8}}>📸 Tus evidencias (puedes quitar alguna si te equivocaste)</div>
                <div style={{display:'grid', gap:8}}>
                  {files.map((f, i) => (
                    <div key={`${f.name}_${f.size}_${f.lastModified}`} className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
                      <div className="small" style={{minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        {i+1}. {f.name}
                      </div>
                      <button className="btn secondary" type="button" onClick={()=>removePicked(i)}>Quitar</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isReport ? (
              <>
                <label>Motivo (8 opciones)</label>
                <select className="input" value={selectedReason} onChange={e=>setSelectedReason(e.target.value)}>
                  {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </>
            ) : null}

            <label>Notas (opcional)</label>
            <textarea className="input" rows="3" value={podNotes} onChange={e=>setPodNotes(e.target.value)} placeholder="Notas..." />
          </div>

          <hr />
          <h3>Cerrar paquete</h3>
          <div className="small">El botón se habilita solo cuando hay <b>2 fotos o más</b>.</div>
          <div className="row" style={{marginTop:10}}>
            {isReport ? (
              <button className="btn danger" disabled={!canClose} onClick={closeNotDelivered}>
                Cerrar (No entregado)
              </button>
            ) : (
              <button className="btn" disabled={!canClose} onClick={closeDelivered}>
                Cerrar (Entregado)
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // list
  return (
    <div className="container">
      <div className="card">
        <div className="headerRow">
          <h2 style={{margin:0}}>Repartidor</h2>
          <span className="tag">{getName() || 'Driver'}</span>
        </div>

        {err ? <div className="bad">{err}</div> : null}

        <hr />
        <div className="navTabs">
          <button className={`btn ${tab==='PENDING'?'':'secondary'}`} onClick={()=>setTab('PENDING')}>Pendientes ⬜ <span className="kbd">{pendingCount}</span></button>
          <button className={`btn ${tab==='SUCCESS'?'':'secondary'}`} onClick={()=>setTab('SUCCESS')}>Entregas exitosas 🟩 <span className="kbd">{successCount}</span></button>
          <button className={`btn ${tab==='FAILED'?'danger':'secondary'}`} onClick={()=>setTab('FAILED')}>Entregas fallidas 🟥 <span className="kbd">{failedCount}</span></button>
        </div>

        <hr />
        <div className="row">
          <div style={{flex:'1 1 260px'}}>
            <label>Buscar código</label>
            <input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ZERO0003 / Marina..." />
          </div>
          <div style={{flex:'0 0 160px', display:'flex', alignItems:'end'}}>
            <button className="btn secondary" style={{width:'100%'}} onClick={()=>setScanOpen(true)}>Escanear</button>
          </div>
        </div>
        <ScannerModal open={scanOpen} onClose={()=>setScanOpen(false)} onResult={(t)=>setSearch(t)} />

        <hr />
        <div style={{display:'grid', gap:10}}>
          {filtered.map(p => (
            <div className="card" key={p.id}>
              <div className="listCard">
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:950, fontSize:18, cursor:'pointer'}} onClick={()=>openDetail(p)}>
                    {statusEmoji(p.status)} {p.recipient_name}
                  </div>
                  <div className="small"><span className="kbd">{p.code}</span> • {p.address}</div>
                </div>
                <div className="row" style={{alignItems:'center'}}>
                  <span className="pill gray">{statusLabel(p.status)}</span>
                  <button className="btn secondary" onClick={()=>callPhone(p.phone)}>Llamar</button>
                  <button className="btn secondary" onClick={()=>openWhatsApp(p.phone, `Hola ${p.recipient_name}, soy tu repartidor de ZERO LOGÍSTICA.`)}>WhatsApp</button>
                  <button className="btn secondary" onClick={()=>openMaps(p.address)}>Maps</button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? <div className="small">Nada por aquí. (Eso es bueno 😌)</div> : null}
        </div>
      </div>
    </div>
  )
}
