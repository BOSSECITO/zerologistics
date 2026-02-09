import useIdleLogout from "./hooks/useIdleLogout";

import React, { useState } from 'react'
import Login from './pages/Login.jsx'
import Admin from './pages/Admin.jsx'
import Driver from './pages/Driver.jsx'
import { clearAuth, getRole } from './api.js'

export default function App(){
  const [tick, setTick] = useState(0)
  const role = getRole()

  const logout = ()=>{ clearAuth(); setTick(t=>t+1) }
  useIdleLogout({
    isActive: !!role,
    logout
  });

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="brandDot" />
          <h1 style={{margin:0}}>ZERO LOGÍSTICA</h1>
        </div>
        {role ? (
          <div className="row" style={{alignItems:'center'}}>
            <span className="tag">{role}</span>
            <button className="btn secondary" onClick={logout}>Salir</button>
          </div>
        ) : null}
      </div>

      <hr />

      {!role ? <Login onDone={()=>setTick(t=>t+1)} /> : null}
      {role === 'admin' ? <Admin key={`a-${tick}`} /> : null}
      {role === 'driver' ? <Driver key={`d-${tick}`} /> : null}
    </div>
  )
}
