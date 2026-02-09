# ZERO LOGÍSTICA — COMPLETO (según todo lo anotado)

## Levantar (Windows / PowerShell)
```powershell
docker compose down -v
docker compose up --build
```

## Abrir
- Web: http://localhost:8080
- API docs: http://localhost:8000/docs

## Login
- Admin: `admin` / `admin123`
- Drivers: los crea el Admin (pantalla Admin → Crear repartidor)

## Driver (flujo)
- Lista con botones:
  - Pendientes ⬜
  - Entregas exitosas 🟩
  - Entregas fallidas 🟥
- Cada pedido: nombre cliente + Llamar/WhatsApp/Maps + emoji por estado
- Click en nombre → detalle:
  - Si está cerrado: 🔒 solo lectura + evidencias
  - Si está pendiente: botones Entregar / Reportar
- Entregar: mínimo 2 fotos → habilita cerrar
- Reportar: 8 motivos → mínimo 2 fotos → habilita cerrar
- Al cerrar: se bloquea y se mueve a Exitosas o Fallidas

## Admin (flujo)
- Lista de repartidores con % de efectividad:
  - 🟢 >= 90%
  - 🟡 70–89%
  - 🔴 < 70%
  - Efectividad = Entregados / (Entregados + Fallidos)
- Click en repartidor → ver pedidos:
  - Pendientes / Exitosos / Fallidos
  - Click pedido → resumen + evidencias (fotos)
- Crear repartidores
- Cargar pedidos (manual) asignando a repartidor
- Asignar por código (manual o escaneo)

## Notas
- Evidencias se guardan en volumen `uploads` y se sirven por `/uploads/...`
