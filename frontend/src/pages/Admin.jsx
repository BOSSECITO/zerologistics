import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import ScannerModal from '../components/ScannerModal.jsx'
import AdminMap from '../components/AdminMap.jsx'
import { statusEmoji, statusLabel, effColor } from '../utils/status.js'

function EffBadge({ eff }){
  const pct = Math.round((eff||0)*100)
  const c = effColor(eff)
  return <span className={`pill ${c}`}>{pct}%</span>
}

function ProofGallery({ proofs }){
  if (!proofs?.length) return <div className="small">Sin evidencias.</div>
  return (
    <div className="thumbRow">
      {proofs.map(p => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.proof_type}>
          <img className="thumb" src={p.url} alt={p.proof_type} />
        </a>
      ))}
    </div>
  )
}

export default function Admin(){
  const [err, setErr] = useState('')
  const [drivers, setDrivers] = useState([])
  const [selectedDriver, setSelectedDriver] = useState(null) // driver obj with stats
  const [driverTab, setDriverTab] = useState('ASSIGNED')
  const [driverPkgs, setDriverPkgs] = useState([])

  const [newD, setNewD] = useState({username:'driver1', full_name:'Repartidor 1', password:'driver123'})
  const [newP, setNewP] = useState({recipient_name:'', address:'', phone:'', driver_id:''})

  const [searchCode, setSearchCode] = useState('')
  const [assignDriverId, setAssignDriverId] = useState('')
  const [scanOpen, setScanOpen] = useState(false)

  const [pkgModal, setPkgModal] = useState(null)

  // ✅ Refs para que SSE siempre tenga el estado "actual" (sin bugs de closure)
  const selectedDriverRef = useRef(null)
  const driverTabRef = useRef('ASSIGNED')
  const pkgModalRef = useRef(null)

  useEffect(()=>{ selectedDriverRef.current = selectedDriver }, [selectedDriver])
  useEffect(()=>{ driverTabRef.current = driverTab }, [driverTab])
  useEffect(()=>{ pkgModalRef.current = pkgModal }, [pkgModal])

  const load = async ()=>{
    try{
      setErr('')
      const d = await api.driversStats()
      setDrivers(d)

      if (!newP.driver_id && d[0]) setNewP(v=>({...v, driver_id:String(d[0].id)}))
      if (!assignDriverId && d[0]) setAssignDriverId(String(d[0].id))

      // keep selectedDriver fresh
      if (selectedDriverRef.current){
        const sd = d.find(x => x.id === selectedDriverRef.current.id)
        if (sd) setSelectedDriver(sd)
      }
      return d
    }catch(e){
      setErr(String(e.message||e))
      return null
    }
  }

  const loadDriverPackages = async (driver, tab)=>{
    try{
      setErr('')
      const pk = await api.driverPackagesAdmin(driver.id, tab)
      setDriverPkgs(pk)
      return pk
    }catch(e){
      setErr(String(e.message||e))
      return null
    }
  }

  useEffect(()=>{ load() }, [])

  useEffect(()=>{
    if (selectedDriver) loadDriverPackages(selectedDriver, driverTab)
  }, [selectedDriver, driverTab])

  // ✅ SSE: tiempo real (admin sin refrescar)
  useEffect(() => {
    // Mismo dominio: Nginx debe proxyear /events al backend
    const es = new EventSource('/events')

    const handle = async (e) => {
      try{
        const msg = JSON.parse(e.data || '{}')
        if (msg.type !== 'PACKAGE_CLOSED') return

        // 1) refresca lista principal
        await load()

        // 2) si estás viendo un driver, refresca su tab actual
        const sd = selectedDriverRef.current
        if (sd){
          const pk = await loadDriverPackages(sd, driverTabRef.current)

          // 3) si hay modal abierto, intenta actualizarlo con data nueva
          const pm = pkgModalRef.current
          if (pm && Array.isArray(pk)){
            const updated = pk.find(x => x.id === pm.id)
            if (updated) setPkgModal(updated)
          }
        }
      }catch{
        // ignora mensajes raros
      }
    }

    es.onmessage = handle
    es.onerror = () => {
      // EventSource reintenta solo, no hacemos drama
    }

    return () => es.close()
  }, [])

  const createDriver = async ()=>{
    try{
      setErr('')
      await api.createDriver(newD.username, newD.full_name, newD.password)
      await load()
    }catch(e){ setErr(String(e.message||e)) }
  }

  const createPackage = async ()=>{
    try{
      setErr('')
      await api.createPackage(newP.recipient_name, newP.address, newP.phone, Number(newP.driver_id))
      setNewP(v=>({...v, recipient_name:'', address:'', phone:''}))
      await load()
      if (selectedDriver && Number(newP.driver_id) === selectedDriver.id){
        await loadDriverPackages(selectedDriver, driverTab)
      }
    }catch(e){ setErr(String(e.message||e)) }
  }

  const assignByCode = async ()=>{
    try{
      setErr('')
      if (!searchCode.trim()) throw new Error('Ingresa o escanea un código')
      await api.assignByCode(searchCode.trim(), Number(assignDriverId))
      await load()
    }catch(e){ setErr(String(e.message||e)) }
  }

  const listView = (
    <div className="card">
      <h2>Repartidores</h2>
      <div className="small">Efectividad = Entregados / (Entregados + Fallidos). Pendientes no cuentan.</div>
      {err ? <div className="bad">{err}</div> : null}
      <hr />
      <div style={{display:'grid', gap:10}}>
        {drivers.map(d => (
          <div key={d.id} className="card" style={{cursor:'pointer'}} onClick={()=>{setSelectedDriver(d); setDriverTab('ASSIGNED')}}>
            <div className="listCard">
              <div>
                <div style={{fontWeight:950, fontSize:18}}>{d.full_name} <span className="tag">@{d.username}</span></div>
                <div className="small">Cerrados: <span className="kbd">{d.closed}</span> • 🟩 {d.delivered} • 🟥 {d.failed}</div>
              </div>
              <div className="row" style={{alignItems:'center'}}>
                <EffBadge eff={d.effectiveness} />
                <button className="btn secondary" onClick={(e)=>{e.stopPropagation(); setSelectedDriver(d); setDriverTab('ASSIGNED')}}>Ver pedidos</button>
              </div>
            </div>
          </div>
        ))}
        {drivers.length===0 ? <div className="small">Aún no hay repartidores. Crea uno abajo.</div> : null}
      </div>

      <hr />
      <h3>Crear repartidor</h3>
      <div className="grid2">
        <div>
          <label>Usuario</label>
          <input className="input" value={newD.username} onChange={e=>setNewD(v=>({...v, username:e.target.value}))}/>
        </div>
        <div>
          <label>Nombre</label>
          <input className="input" value={newD.full_name} onChange={e=>setNewD(v=>({...v, full_name:e.target.value}))}/>
        </div>
        <div>
          <label>Contraseña</label>
          <input className="input" value={newD.password} onChange={e=>setNewD(v=>({...v, password:e.target.value}))}/>
        </div>
        <div style={{display:'flex', alignItems:'end'}}>
          <button className="btn" style={{width:'100%'}} onClick={createDriver}>Crear</button>
        </div>
      </div>

      <hr />
      <h3>Cargar pedido (manual) y asignar</h3>
      <div className="grid2">
        <div>
          <label>Cliente</label>
          <input className="input" value={newP.recipient_name} onChange={e=>setNewP(v=>({...v, recipient_name:e.target.value}))}/>
          <label>Dirección</label>
          <input className="input" value={newP.address} onChange={e=>setNewP(v=>({...v, address:e.target.value}))}/>
          <label>Teléfono</label>
          <input className="input" value={newP.phone} onChange={e=>setNewP(v=>({...v, phone:e.target.value}))}/>
        </div>
        <div>
          <label>Repartidor</label>
          <select className="input" value={newP.driver_id} onChange={e=>setNewP(v=>({...v, driver_id:e.target.value}))}>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name} (@{d.username})</option>)}
          </select>
          <div style={{marginTop:12}}>
            <button className="btn" style={{width:'100%'}} onClick={createPackage}>Crear pedido</button>
          </div>

          <hr />
          <h3>Asignar por código</h3>
          <div className="small">Escanea o escribe y asigna al driver.</div>
          <label>Buscar código</label>
          <div className="row">
            <input className="input" value={searchCode} onChange={e=>setSearchCode(e.target.value)} placeholder="ZERO0007" />
            <button className="btn secondary" onClick={()=>setScanOpen(true)}>Escanear</button>
          </div>
          <label>Asignar a</label>
          <select className="input" value={assignDriverId} onChange={e=>setAssignDriverId(e.target.value)}>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name} (@{d.username})</option>)}
          </select>
          <div style={{marginTop:12}}>
            <button className="btn" style={{width:'100%'}} onClick={assignByCode}>Asignar</button>
          </div>
        </div>
      </div>
      <AdminMap />
      <ScannerModal open={scanOpen} onClose={()=>setScanOpen(false)} onResult={(t)=>setSearchCode(t)} />
    </div>
  )

  const driverView = selectedDriver ? (
    <div className="card">
      <div className="headerRow">
        <div>
          <h2 style={{margin:0}}>{selectedDriver.full_name} <span className="tag">@{selectedDriver.username}</span></h2>
          <div className="small">Efectividad: <EffBadge eff={selectedDriver.effectiveness} /> • Cerrados <span className="kbd">{selectedDriver.closed}</span></div>
        </div>
        <button className="btn secondary" onClick={()=>{setSelectedDriver(null); setDriverPkgs([]);}}>Volver</button>
      </div>

      {err ? <div className="bad">{err}</div> : null}

      <hr />
      <div className="navTabs">
        <button className={`btn ${driverTab==='DELIVERED'?'':'secondary'}`} onClick={()=>setDriverTab('DELIVERED')}>Pedidos exitosos</button>
        <button className={`btn ${driverTab==='NOT_DELIVERED'?'danger':'secondary'}`} onClick={()=>setDriverTab('NOT_DELIVERED')}>Pedidos fallidos</button>
        <button className={`btn ${driverTab==='ASSIGNED'?'':'secondary'}`} onClick={()=>setDriverTab('ASSIGNED')}>Pendientes</button>
      </div>

      <hr />
      <div style={{display:'grid', gap:10}}>
        {driverPkgs.map(p => (
          <div key={p.id} className="card" style={{cursor:'pointer'}} onClick={()=>setPkgModal(p)}>
            <div className="listCard">
              <div style={{minWidth:0}}>
                <div style={{fontWeight:950, fontSize:16}}>
                  {statusEmoji(p.status)} {p.recipient_name} <span className="tag">{p.code}</span>
                </div>
                <div className="small">{p.address}</div>
                <div className="small">Estado: {statusLabel(p.status)} {p.non_delivery_reason ? `• Motivo: ${p.non_delivery_reason}` : ''}</div>
              </div>
              <span className="pill gray">{p.status}</span>
            </div>
          </div>
        ))}
        {driverPkgs.length===0 ? <div className="small">No hay pedidos en esta categoría.</div> : null}
      </div>

      {pkgModal ? (
        <div className="modalBackdrop" onClick={()=>setPkgModal(null)}>
          <div className="card modal" onClick={(e)=>e.stopPropagation()}>
            <div className="headerRow">
              <h3>Resumen • {pkgModal.code}</h3>
              <button className="btn secondary" onClick={()=>setPkgModal(null)}>Cerrar</button>
            </div>
            <div className="small">{statusEmoji(pkgModal.status)} {statusLabel(pkgModal.status)} • {pkgModal.recipient_name}</div>
            <hr />
            <div className="small"><b>Dirección:</b> {pkgModal.address}</div>
            <div className="small"><b>Teléfono:</b> {pkgModal.phone || '—'}</div>
            <div className="small"><b>Notas:</b> {pkgModal.pod_notes || '—'}</div>
            {pkgModal.non_delivery_reason ? <div className="small"><b>Motivo:</b> {pkgModal.non_delivery_reason}</div> : null}
            <hr />
            <h3>Evidencias</h3>
            <ProofGallery proofs={pkgModal.proofs} />
          </div>
        </div>
      ) : null}
    </div>
  ) : null

  return (
    <div className="container">
      {selectedDriver ? driverView : listView}
    </div>
  )
}
