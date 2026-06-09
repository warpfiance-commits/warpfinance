// ─── Warp Finance API ─────────────────────────────────────────────────────────
// Express puro — sin TypeScript, sin compilación, listo para Railway
const express  = require('express')
const cors     = require('cors')
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const app    = express()
const prisma = new PrismaClient()
const SECRET = process.env.JWT_SECRET || 'warpfinance-dev-2026'
const PORT   = process.env.PORT || 8080

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}))
app.use(express.json())

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'Warp Finance API',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}))

// ─── Auth middleware ──────────────────────────────────────────────────────────
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

// ─── Amortización francesa ────────────────────────────────────────────────────
function calcAmort(capital, tasaMensual, meses) {
  const t = tasaMensual / 100
  const cuota = t === 0
    ? capital / meses
    : capital * (t * Math.pow(1+t,meses)) / (Math.pow(1+t,meses)-1)
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
  return {
    cuota: Math.round(cuota*100)/100,
    totalPagar:    Math.round(tabla.reduce((s,r)=>s+r.cuotaTotal,0)*100)/100,
    totalIntereses:Math.round(tabla.reduce((s,r)=>s+r.interes,0)*100)/100,
    tea: Math.round((Math.pow(1+t,12)-1)*10000)/100,
    tabla,
  }
}

// ─── Audit helper ─────────────────────────────────────────────────────────────
async function audit(data) {
  try {
    await prisma.auditLog.create({ data: { ...data, hash: Date.now().toString(36) } })
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/registro
app.post('/api/v1/auth/registro', async (req, res) => {
  try {
    const { primerNombre, primerApellido, segundoNombre, segundoApellido,
            tipoDocumento, numDocumento, email, telefono, fechaNacimiento,
            direccion, usuario, password } = req.body

    if (!primerNombre || !primerApellido || !email || !usuario || !password)
      return res.status(400).json({ message: 'Faltan campos obligatorios' })

    const existe = await prisma.usuario.findFirst({
      where: { OR: [{ email }, { usuario }, { numDocumento }] }
    })
    if (existe) return res.status(400).json({ message: 'Email, usuario o documento ya registrado' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.usuario.create({
      data: {
        primerNombre, primerApellido, segundoNombre, segundoApellido,
        tipoDocumento: tipoDocumento || 'CEDULA',
        numDocumento:  numDocumento  || Date.now().toString(),
        email, telefono: telefono || '', direccion: direccion || '',
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : new Date('1990-01-01'),
        usuario, passwordHash,
        terminosAcept: true, datosAcept: true,
      }
    })

    const token = jwt.sign({ sub: user.id, rol: user.rol }, SECRET, { expiresIn: '7d' })
    await audit({ usuarioId: user.id, accion: 'REGISTRO', modulo: 'AUTH', detalle: `Registro: ${email}` })

    const { passwordHash: _, ...safe } = user
    res.json({ token, usuario: safe, mensaje: 'Registro exitoso' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message || 'Error interno' })
  }
})

// POST /api/v1/auth/login
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body
    const user = await prisma.usuario.findFirst({
      where: { OR: [{ usuario }, { email: usuario }] }
    })
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    if (user.estado === 'BLOQUEADO')
      return res.status(401).json({ message: 'Cuenta bloqueada. Contacta soporte.' })

    const token = jwt.sign({ sub: user.id, rol: user.rol }, SECRET, { expiresIn: '7d' })
    await audit({ usuarioId: user.id, accion: 'LOGIN', modulo: 'AUTH', detalle: 'Login exitoso', ip: req.ip })

    const { passwordHash: _, ...safe } = user
    res.json({ token, usuario: safe })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// POST /api/v1/auth/perfil-test
app.post('/api/v1/auth/perfil-test', authMiddleware, async (req, res) => {
  try {
    const { respuestas } = req.body
    const total   = Object.values(respuestas).reduce((s, v) => s + v, 0)
    const perfil  = total <= 20 ? 'CONSERVADOR' : total <= 32 ? 'MODERADO' : 'AGRESIVO'
    const user    = await prisma.usuario.update({
      where: { id: req.userId },
      data:  { perfilInversion: perfil, scoreTest: total, estado: 'ACTIVO' }
    })
    const { passwordHash: _, ...safe } = user
    res.json({ perfil, score: total, usuario: safe })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// GET /api/v1/auth/perfil
app.get('/api/v1/auth/perfil', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.userId },
      select: {
        id:true, primerNombre:true, primerApellido:true, email:true,
        usuario:true, rol:true, estado:true, perfilInversion:true, scoreTest:true,
        solicitudes:{ orderBy:{ createdAt:'desc' }, take:5 },
        obligaciones:{ orderBy:{ proximoVenc:'asc' } },
        notificaciones:{ where:{ leida:false }, take:10 },
        inversion:true,
      }
    })
    if (!user) return res.status(401).json({ message: 'No encontrado' })
    res.json(user)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/usuarios/dashboard
app.get('/api/v1/usuarios/dashboard', authMiddleware, async (req, res) => {
  try {
    const [obligs, sols, notifs, inv] = await Promise.all([
      prisma.obligacion.findMany({ where:{ usuarioId: req.userId }, orderBy:{ proximoVenc:'asc' } }),
      prisma.solicitud.findMany({ where:{ usuarioId: req.userId }, orderBy:{ createdAt:'desc' }, take:5 }),
      prisma.notificacion.findMany({ where:{ usuarioId: req.userId, leida:false }, take:10 }),
      prisma.inversion.findUnique({ where:{ usuarioId: req.userId } }),
    ])
    res.json({ obligaciones:obligs, solicitudes:sols, notificaciones:notifs, inversion:inv })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// GET /api/v1/usuarios — admin
app.get('/api/v1/usuarios', authMiddleware, async (req, res) => {
  try {
    if (!['ADMIN','ANALISTA'].includes(req.userRol))
      return res.status(403).json({ message: 'Sin permiso' })
    const users = await prisma.usuario.findMany({
      select:{
        id:true, primerNombre:true, primerApellido:true, email:true,
        numDocumento:true, rol:true, estado:true, perfilInversion:true,
        scoreTest:true, kycValidado:true, createdAt:true,
        _count:{ select:{ solicitudes:true, obligaciones:true } }
      },
      orderBy:{ createdAt:'desc' }
    })
    res.json(users)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// PUT /api/v1/usuarios/:id/estado
app.put('/api/v1/usuarios/:id/estado', authMiddleware, async (req, res) => {
  try {
    if (req.userRol !== 'ADMIN') return res.status(403).json({ message: 'Sin permiso' })
    const user = await prisma.usuario.update({
      where:{ id: req.params.id },
      data:{ estado: req.body.estado },
      select:{ id:true, email:true, estado:true }
    })
    await audit({ usuarioId: req.userId, accion:'CAMBIO_ESTADO', modulo:'USUARIOS', detalle:`${user.email} → ${req.body.estado}` })
    res.json(user)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SOLICITUDES
// ═══════════════════════════════════════════════════════════════════════════════

const RAD = () => `RAD-${new Date().getFullYear()}-${String(Math.floor(Math.random()*90000)+10000)}`

// POST /api/v1/solicitudes
app.post('/api/v1/solicitudes', authMiddleware, async (req, res) => {
  try {
    const { tipo, monto, cuotaInicial, plazo, tasaMensual, vehiculoId, inmuebleId, destino, consentimientoCR } = req.body

    let cuotaEstimada = null, totalPagar = null
    if (monto && plazo && tasaMensual) {
      const capital = monto - (cuotaInicial || 0)
      const calc    = calcAmort(capital, tasaMensual, plazo)
      cuotaEstimada = calc.cuota
      totalPagar    = calc.totalPagar
    }

    const sol = await prisma.solicitud.create({
      data: {
        radicado: RAD(), usuarioId: req.userId,
        tipo, estado:'RADICADA',
        monto, cuotaInicial, plazo, tasaMensual,
        cuotaEstimada, totalPagar,
        vehiculoId, inmuebleId, destino,
        consentimientoCR: consentimientoCR || false,
      },
      include: { vehiculo:true, inmueble:true }
    })

    // Seguro vida obligatorio
    await prisma.seguroSolicitud.create({
      data:{ solicitudId:sol.id, tipo:'VIDA_DEUDORES', pct:0.3, primaEstimada:monto*0.003, obligatorio:true, activo:true }
    })

    // Asignar analista
    const analistas = await prisma.usuario.findMany({ where:{ rol:{ in:['ANALISTA','ADMIN'] } }, select:{ id:true } })
    if (analistas.length) {
      await prisma.solicitud.update({
        where:{ id:sol.id },
        data:{ analistaId: analistas[Math.floor(Math.random()*analistas.length)].id, estado:'EN_ANALISIS' }
      })
    }

    await audit({ usuarioId:req.userId, solicitudId:sol.id, accion:'SOLICITUD_CREADA', modulo:'SOLICITUDES', detalle:`${sol.radicado} · ${tipo} · $${monto}` })

    // Notificación
    await prisma.notificacion.create({
      data:{ usuarioId:req.userId, tipo:'SOLICITUD', titulo:'Solicitud radicada',
        mensaje:`${sol.radicado} radicada. Analista asignado. Respuesta en 24–48h.`, canal:['EMAIL','APP'] }
    })

    res.json(sol)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

// GET /api/v1/solicitudes/mias
app.get('/api/v1/solicitudes/mias', authMiddleware, async (req, res) => {
  try {
    const sols = await prisma.solicitud.findMany({
      where:{ usuarioId: req.userId },
      include:{ vehiculo:true, inmueble:true },
      orderBy:{ createdAt:'desc' }
    })
    res.json(sols)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// GET /api/v1/solicitudes — admin
app.get('/api/v1/solicitudes', authMiddleware, async (req, res) => {
  try {
    if (!['ADMIN','ANALISTA'].includes(req.userRol)) {
      const sols = await prisma.solicitud.findMany({ where:{ usuarioId:req.userId }, orderBy:{ createdAt:'desc' } })
      return res.json(sols)
    }
    const sols = await prisma.solicitud.findMany({
      include:{
        usuario:{ select:{ id:true, primerNombre:true, primerApellido:true, email:true, numDocumento:true } },
        vehiculo:{ select:{ nombre:true, valor:true } },
         inmueble:{ select:{ nombre:true, valor:true } },
      },
      orderBy:{ createdAt:'desc' }
    })
    res.json(sols)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

// PUT /api/v1/solicitudes/:id/decision
app.put('/api/v1/solicitudes/:id/decision', authMiddleware, async (req, res) => {
  try {
    if (!['ADMIN','ANALISTA'].includes(req.userRol))
      return res.status(403).json({ message: 'Sin permiso' })

    const { decision, montoAprobado, tasaAprobada, plazoAprobado, motivo } = req.body
    const estadoMap = {
      ap:'APROBADA', ac:'APROBADA_CON_CONDICIONES',
      rec:'RECHAZADA', doc:'DOCUMENTACION_PENDIENTE'
    }

    const sol = await prisma.solicitud.update({
      where:{ id: req.params.id },
      data:{
        estado: estadoMap[decision] || decision,
        analistaId: req.userId,
        motivoDecision: motivo,
        ...(montoAprobado && { monto: montoAprobado }),
        ...(tasaAprobada  && { tasaMensual: tasaAprobada }),
        ...(plazoAprobado && { plazo: plazoAprobado }),
      },
      include:{ usuario:true }
    })

    // Si aprobada → crear obligación automáticamente
    if (['ap','ac'].includes(decision) && sol.monto && sol.plazo && sol.tasaMensual) {
      const capital = Number(sol.monto) - Number(sol.cuotaInicial || 0)
      const calc    = calcAmort(capital, Number(sol.tasaMensual), sol.plazo)

      const obl = await prisma.obligacion.create({
        data:{
          usuarioId: sol.usuarioId,
          solicitudId: sol.id,
          tipo: sol.tipo,
          descripcion: `${sol.tipo} · ${sol.radicado}`,
          saldo: capital,
          cuota: calc.cuota,
          tasaMensual: Number(sol.tasaMensual),
          plazoTotal: sol.plazo,
          proximoVenc: new Date(Date.now() + 30*24*60*60*1000),
          estado: 'AL_DIA',
        }
      })

      await prisma.cuotaAmortizacion.createMany({
        data: calc.tabla.map(c => ({
          obligacionId: obl.id,
          numeroCuota:  c.numeroCuota,
          saldoInicial: c.saldoInicial,
          cuotaTotal:   c.cuotaTotal,
          interes:      c.interes,
          capital:      c.capital,
          saldoFinal:   c.saldoFinal,
          fechaVenc:    new Date(Date.now() + c.numeroCuota*30*24*60*60*1000),
        }))
      })
    }

    // Notificar al cliente
    await prisma.notificacion.create({
      data:{
        usuarioId: sol.usuarioId,
        tipo:'SOLICITUD',
        titulo:`Decisión: ${sol.radicado}`,
        mensaje:`Tu solicitud fue ${estadoMap[decision]?.toLowerCase()?.replace(/_/g,' ')}. ${motivo||''}`,
        canal:['EMAIL','SMS','APP']
      }
    })

    await audit({ usuarioId:req.userId, solicitudId:sol.id, accion:`DECISION_${decision}`, modulo:'SOLICITUDES', detalle:motivo||'' })
    res.json(sol)
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: e.message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// OBLIGACIONES
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/v1/obligaciones/mias', authMiddleware, async (
