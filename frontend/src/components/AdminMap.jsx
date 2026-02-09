import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api.js'
import { statusEmoji, statusLabel } from '../utils/status.js'

// Fix icon paths for Vite builds
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const driverIcon = new L.DivIcon({
  className: 'driverPin',
  html: '<div class="pinBubble">🚚</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

const pkgIcon = new L.DivIcon({
  className: 'pkgPin',
  html: '<div class="pinBubble">📦</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

export default function AdminMap(){
  const [err, setErr] = useState('')
  const [drivers, setDrivers] = useState([])
  const [packages, setPackages] = useState([])

  const lastCenterRef = useRef(null)

  const load = async ()=>{
    try{
      setErr('')
      const data = await api.adminMapData()
      setDrivers(Array.isArray(data?.drivers) ? data.drivers : [])
      setPackages(Array.isArray(data?.packages) ? data.packages : [])
    }catch(e){
      setErr(String(e.message||e))
    }
  }

  useEffect(()=>{ load() }, [])

  // Poll cada 3 min como pediste
  useEffect(() => {
    const t = setInterval(load, 3 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Bonus: si hay SSE de ubicación, actualiza en vivo
  useEffect(() => {
    const es = new EventSource('/events')
    es.onmessage = (e) => {
      try{
        const msg = JSON.parse(e.data || '{}')
        if (msg.type !== 'DRIVER_LOCATION') return
        setDrivers(prev => {
          const idx = prev.findIndex(d => d.id === msg.driver_id)
          const next = [...prev]
          const item = {
            id: msg.driver_id,
            full_name: msg.full_name || '',
            username: msg.username || '',
            lat: msg.lat,
            lng: msg.lng,
            at: msg.at || null,
          }
          if (idx >= 0) next[idx] = item
          else next.unshift(item)
          return next
        })
      }catch{}
    }
    return () => es.close()
  }, [])

  const center = useMemo(() => {
    // Center inteligente: 1) primer driver con gps, 2) primer paquete con gps, 3) Lima
    const d = drivers.find(x => typeof x.lat === 'number' && typeof x.lng === 'number')
    if (d) return [d.lat, d.lng]
    const p = packages.find(x => typeof x.lat === 'number' && typeof x.lng === 'number')
    if (p) return [p.lat, p.lng]
    return [-12.0464, -77.0428] // Lima
  }, [drivers, packages])

  // Evita que el mapa “salte” si ya se centró una vez
  const initialCenter = useMemo(() => {
    if (!lastCenterRef.current) lastCenterRef.current = center
    return lastCenterRef.current
  }, [center])

  return (
    <div className="card" style={{marginTop:16}}>
      <div className="headerRow">
        <h2 style={{margin:0}}>Mapa (drivers + pedidos con GPS)</h2>
        <button className="btn secondary" onClick={load}>Actualizar</button>
      </div>
      <div className="small">
        Drivers se actualizan cada <b>3 minutos</b>. Los pedidos aparecen solo si el repartidor dio permiso de GPS al cerrar.
      </div>
      {err ? <div className="bad" style={{marginTop:10}}>{err}</div> : null}

      <div style={{marginTop:12, height: 360, borderRadius: 16, overflow:'hidden'}}>
        <MapContainer center={initialCenter} zoom={12} style={{height:'100%', width:'100%'}} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {drivers.map(d => (
            <Marker key={`d_${d.id}`} position={[d.lat, d.lng]} icon={driverIcon}>
              <Popup>
                <div style={{fontWeight:900}}>{d.full_name} <span className="tag">@{d.username}</span></div>
                <div className="small">Última señal: {d.at ? new Date(d.at).toLocaleString() : '—'}</div>
              </Popup>
            </Marker>
          ))}

          {packages.map(p => (
            <Marker key={`p_${p.id}`} position={[p.lat, p.lng]} icon={pkgIcon}>
              <Popup>
                <div style={{fontWeight:900}}>{p.code} {statusEmoji(p.status)} {statusLabel(p.status)}</div>
                <div className="small">{p.recipient_name}</div>
                {p.address ? <div className="small">📍 {p.address}</div> : null}
                <div className="small">GPS: {p.at ? new Date(p.at).toLocaleString() : '—'}</div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
