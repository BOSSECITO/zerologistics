const API = '/api';

export function getToken(){ return localStorage.getItem('zero_token') || ''; }
export function getRole(){ return localStorage.getItem('zero_role') || ''; }
export function getName(){ return localStorage.getItem('zero_name') || ''; }

export function setAuth(auth){
  localStorage.setItem('zero_token', auth.access_token);
  localStorage.setItem('zero_role', auth.role);
  localStorage.setItem('zero_name', auth.full_name);
}
export function clearAuth(){
  localStorage.removeItem('zero_token');
  localStorage.removeItem('zero_role');
  localStorage.removeItem('zero_name');
}

async function req(path, opts={}){
  const headers = opts.headers || {};
  const t = getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${API}${path}`, {...opts, headers});
  if (!res.ok){
    const txt = await res.text();
    throw new Error(txt || res.statusText);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  login: (username, password) => req('/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username, password})
  }),

  // Admin
  driversStats: () => req('/admin/drivers_stats'),
  createDriver: (username, full_name, password) => req('/admin/drivers', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username, full_name, password})
  }),
  createPackage: (recipient_name, address, phone, driver_id) => req('/admin/packages', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({recipient_name, address, phone, driver_id})
  }),
  assignByCode: (code, driver_id) => req('/admin/packages/assign_by_code', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({code, driver_id})
  }),
  driverPackagesAdmin: (driver_id, status) => req(`/admin/drivers/${driver_id}/packages?status=${encodeURIComponent(status)}`),
  adminMapData: () => req('/admin/map_data'),

  // Driver
  myPackages: () => req('/driver/packages'),
  reasons: () => req('/driver/reasons'),
  closeDelivered: (id, pod_notes, images, coords) => {
    const fd = new FormData();
    fd.append('pod_notes', pod_notes);
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number'){
      fd.append('lat', String(coords.lat));
      fd.append('lng', String(coords.lng));
    }
    images.forEach(f => fd.append('images', f));
    return req(`/driver/packages/${id}/close_delivered`, {method:'POST', body: fd});
  },
  closeNotDelivered: (id, pod_notes, reason, images, coords) => {
    const fd = new FormData();
    fd.append('pod_notes', pod_notes);
    fd.append('reason', reason);
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number'){
      fd.append('lat', String(coords.lat));
      fd.append('lng', String(coords.lng));
    }
    images.forEach(f => fd.append('images', f));
    return req(`/driver/packages/${id}/close_not_delivered`, {method:'POST', body: fd});
  },

  // Driver location (para mapa admin)
  updateMyLocation: (lat, lng) => req('/driver/location', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({lat, lng})
  })
};
