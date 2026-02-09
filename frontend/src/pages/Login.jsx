import React, { useState } from 'react'
import { api, setAuth } from '../api.js'

export default function Login({ onDone }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const auth = await api.login(username, password)
      setAuth(auth)
      onDone()
    } catch (e) { setErr(String(e.message || e)) }
    finally { setLoading(false) }
  }

  return (
    <div className="container">
      <div className="card authCard">
        <h2>Iniciar sesión</h2>
        {err ? <div className="bad">{err}</div> : null}
        <form onSubmit={submit}>
          <label>Usuario</label>
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="off" />
          <label>Contraseña</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off" />
          <div style={{marginTop:12}}>
            <button className="btn" style={{width:'100%'}} disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
