const express  = require('express')
const cors     = require('cors')
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const app    = express()
const prisma = new PrismaClient()
const SECRET = process.env.JWT_SECRET || 'warpfinance-dev-2026'
const PORT   = process.env.PORT || 8080

app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }))
app.use(express.json())

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Middleware de autenticación
function authMiddleware(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ message: 'No autorizado' })
  try {
    const payload = jwt.verify(h.slice(7), SECRET)
    req.userId = payload.sub
    req.userRol = payload.rol
    next()
  } catch {
    res.status(401).json({ message: 'Token inválido' })
  }
}

// Amortización francesa
function calcAmort(capital, tasaMensual, meses) {
  const t = tasaMensual / 100
  const cuota = t === 0 ? capital / meses : capital * (t * Math.pow(1+t,meses)) / (Math.pow(1+t,meses)-1)
  const tabla = []
  let saldo = capital
  for (let i = 1; i <= meses; i++) {
    const interes   = saldo * t
    const capitalP  = i === meses ? saldo : cuota - interes
    const saldoFin  = Math.max(0, saldo - capitalP)
    tabla.push({
      numeroCuota: i,
      saldoInicial: Math.round(saldo*100)/100,
      cuotaTotal:   Math.round(cuota*100)/100,
      interes:      Math.round(interes*100)/100,
      capital:      Math.round(capitalP*100)/100,
      saldoFinal:   Math.round(saldoFin*100)/100,
    })
    saldo = saldoFin
  }
  return { cuota: Math.round(cuota*100)/100, tabla }
}

// --- RUTAS DE AUTENTICACIÓN ---
app.post('/api/v1/auth/registro', async (req, res) => {
  try {
    const { primerNombre, primerApellido, email, usuario, password } = req.body
    if (!primerNombre || !primerApellido || !email || !usuario || !password)
      return res.status(400).json({ message: 'Faltan campos obligatorios' })

    const existe = await prisma.usuario.findFirst({ where: { OR: [{ email }, { usuario }] } })
    if (existe) return res.status(400).json({ message: 'Email o usuario ya registrado' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.usuario.create({
      data: { primerNombre, primerApellido, email, usuario, passwordHash, tipoDocumento: 'CEDULA', numDocumento: Date.now().toString() }
    })
    const token = jwt.sign({ sub: user.id, rol: user.rol }, SECRET, { expiresIn: '7d' })
    res.json({ token, mensaje: 'Registro exitoso' })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body
    const user = await prisma.usuario.findFirst({ where: { OR: [{ usuario }, { email: usuario }] } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ message: 'Credenciales incorrectas' })

    const token = jwt.sign({ sub: user.id, rol: user.rol }, SECRET, { expiresIn: '7d' })
    res.json({ token, usuario: { id: user.id, usuario: user.usuario, rol: user.rol } })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// --- RUTAS DE SOLICITUDES ---
app.post('/api/v1/solicitudes', authMiddleware, async (req, res) => {
  try {
    const { tipo, monto, cuotaInicial, plazo, tasaMensual, vehiculoId, destino } = req.body
    const capital = monto - (cuotaInicial || 0)
    const calc = calcAmort(capital, tasaMensual, plazo)

    const sol = await prisma.solicitud.create({
      data: {
        radicado: `RAD-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
        usuarioId: req.userId, tipo, estado: 'RADICADA',
        monto, cuotaInicial, plazo, tasaMensual, cuotaEstimada: calc.cuota, totalPagar: calc.cuota * plazo,
        vehiculoId, destino, consentimientoCR: true
      }
    })
    res.json(sol)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// --- INVENTARIO DE VEHÍCULOS ---
app.get('/api/v1/inventario/vehiculos-disponibles', authMiddleware, async (req, res) => {
  try {
    const vehiculos = await prisma.vehiculo.findMany({
      where: { estado: 'DISPONIBLE' },
      select: { id: true, marca: true, linea: true, anio: true, valor: true }
    })
    res.json({ success: true, data: vehiculos })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
})

// Inicialización
async function start() {
  await prisma.$connect()
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor listo en puerto ${PORT}`))
}
start().catch(e => console.error(e))
