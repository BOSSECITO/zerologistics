import React, { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function ScannerModal({ open, onClose, onResult }) {
  const regionId = useRef(`qr-${Math.random().toString(16).slice(2)}`)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    const scanner = new Html5Qrcode(regionId.current)

    const start = async () => {
      setErr('')
      try {
        const cams = await Html5Qrcode.getCameras()
        if (!cams?.length) throw new Error('No se detectó cámara')

        // ✅ Priorizar cámara trasera de forma fiable:
        // 1) intentamos por label (si existe)
        // 2) si labels vienen vacíos, elegimos la "última" (suele ser trasera en móviles)
        const labeledBack = cams.find(c => /back|rear|environment/i.test(c.label || ''))
        const fallbackBack = cams.length > 1 ? cams[cams.length - 1] : cams[0]
        const backCam = labeledBack || fallbackBack

        await scanner.start(
          { deviceId: { exact: backCam.id } },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            onResult(decodedText)
            onClose()
          },
          () => {}
        )
      } catch (e) {
        setErr(String(e.message || e))
      }
    }

    start()

    return () => {
      try {
        scanner.stop().then(() => scanner.clear()).catch(() => {})
      } catch {}
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Escanear</h3>
          <button className="btn secondary" onClick={onClose}>Cerrar</button>
        </div>
        <div className="small">
          Si falla: más luz, menos movimiento. Vida real 😅
        </div>
        {err ? <div className="bad">{err}</div> : null}
        <hr />
        <div id={regionId.current} />
      </div>
    </div>
  )
}
