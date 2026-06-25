const express  = require('express')
const cors     = require('cors')
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const https    = require('https')
const crypto   = require('crypto')
const { PrismaClient } = require('@prisma/client')

const app    = express()
const prisma = new PrismaClient()
const SECRET = process.env.JWT_SECRET || 'warpfinance-dev-2026'
const PORT   = process.env.PORT || 8080

// ─── CLOUDINARY (misma cuenta de Warp-consultas) ────────────────────────────
const CLOUD_NAME  = process.env.CLOUDINARY_CLOUD_NAME || 'dtoq5nbz4'
const API_KEY      = process.env.CLOUDINARY_API_KEY    || '985348958691353'
const API_SECRET   = process.env.CLOUDINARY_API_SECRET || 'N8mnqMCA_xVtSzxL4p13YVvhnLM'

app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }))
app.use(express.json({ limit: '10mb' }))

// resourceType: 'auto' deja que Cloudinary detecte si es imagen, PDF, etc.
async function uploadImageToCloudinary(base64Data, fileName, folder, resourceType = 'auto') {
  const mimeMatch = base64Data.match(/data:([^;]+);/)
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
  const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
  const timestamp = Math.floor(Date.now() / 1000)
  const publicId = `warpfinance-inventario/${folder}/${Date.now()}_${(fileName||'img').replace(/[^a-zA-Z0-9._-]/g,'_')}`
  const signature = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`).digest('hex')
  const boundary = '----WarpBoundary' + Math.random().toString(36).substr(2)
  const fileData = Buffer.from(base64, 'base64')
  let body = ''
  const addField = (n, v) => { body += `--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n` }
  addField('api_key', API_KEY); addField('timestamp', timestamp)
  addField('signature', signature); addField('public_id', publicId)
  const bodyBefore = Buffer.from(body, 'utf8')
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName||'image'}"\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8')
  const bodyAfter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const requestBody = Buffer.concat([bodyBefore, fileHeader, fileData, bodyAfter])
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': requestBody.length }
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.secure_url) resolve(json.secure_url)
          else reject(new Error(json.error?.message || 'Upload failed'))
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject); req.write(requestBody); req.end()
  })
}

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }))

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
function auth(req, res, next) {
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

function adminOnly(req, res, next) {
  if (req.userRol !== 'ADMIN' && req.userRol !== 'ANALISTA')
    return res.status(403).json({ message: 'Acceso restringido' })
  next()
}

// ─── AMORTIZACIÓN FRANCESA ───────────────────────────────────────────────────
function calcAmort(capital, tasaMensual, meses) {
  const t = tasaMensual / 100
  const cuota = t === 0 ? capital / meses : capital * (t * Math.pow(1+t,meses)) / (Math.pow(1+t,meses)-1)
  const tabla = []
  let saldo = capital
  for (let i = 1; i <= meses; i++) {
    const interes  = saldo * t
    const capitalP = i === meses ? saldo : cuota - interes
    const saldoFin = Math.max(0, saldo - capitalP)
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

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/v1/auth/registro', async (req, res) => {
  try {
    const { primerNombre, primerApellido, email, usuario, password,
            segundoNombre, segundoApellido, tipoDocumento, numDocumento,
            telefono, direccion, fechaNacimiento } = req.body
    if (!primerNombre || !primerApellido || !email || !usuario || !password)
      return res.status(400).json({ message: 'Faltan campos obligatorios' })

    const existe = await prisma.usuario.findFirst({ where: { OR: [{ email }, { usuario }] } })
    if (existe) return res.status(400).json({ message: 'Email o usuario ya registrado' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.usuario.create({
      data: {
        primerNombre, segundoNombre, primerApellido, segundoApellido,
        email, usuario, passwordHash,
        tipoDocumento: tipoDocumento || 'CEDULA',
        numDocumento: numDocumento || Date.now().toString(),
        telefono: telefono || '0000000000',
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : new Date('1990-01-01'),
        direccion, estado: 'ACTIVO'
      }
    })
    const token = jwt.sign({ sub: user.id, rol: user.rol }, SECRET, { expiresIn: '7d' })
    res.json({ token, usuario: { id: user.id, usuario: user.usuario, rol: user.rol, primerNombre: user.primerNombre, primerApellido: user.primerApellido, email: user.email } })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body
    const user = await prisma.usuario.findFirst({ where: { OR: [{ usuario }, { email: usuario }] } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ message: 'Credenciales incorrectas' })
    if (user.estado === 'BLOQUEADO') return res.status(403).json({ message: 'Usuario bloqueado' })

    const token = jwt.sign({ sub: user.id, rol: user.rol }, SECRET, { expiresIn: '7d' })
    res.json({ token, usuario: { id: user.id, usuario: user.usuario, rol: user.rol, primerNombre: user.primerNombre, primerApellido: user.primerApellido, email: user.email, perfilInversion: user.perfilInversion, scoreTest: user.scoreTest } })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/auth/perfil', auth, async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({ where: { id: req.userId } })
    res.json({ usuario: user })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.post('/api/v1/auth/perfil-test', auth, async (req, res) => {
  try {
    const { respuestas } = req.body
    const score = Object.values(respuestas).reduce((a, b) => a + b, 0)
    const perfil = score <= 20 ? 'CONSERVADOR' : score <= 32 ? 'MODERADO' : 'AGRESIVO'
    const user = await prisma.usuario.update({
      where: { id: req.userId },
      data: { perfilInversion: perfil, scoreTest: score }
    })
    res.json({ perfil, score, usuario: user })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── USUARIOS (ADMIN) ────────────────────────────────────────────────────────
app.get('/api/v1/usuarios', auth, adminOnly, async (req, res) => {
  try {
    const { estado, rol, q } = req.query
    const where = {}
    if (estado) where.estado = estado
    if (rol) where.rol = rol
    if (q) where.OR = [
      { primerNombre: { contains: q, mode: 'insensitive' } },
      { primerApellido: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { numDocumento: { contains: q } }
    ]
    const usuarios = await prisma.usuario.findMany({
      where,
      select: { id: true, primerNombre: true, primerApellido: true, email: true, usuario: true, rol: true, estado: true, perfilInversion: true, scoreTest: true, kycValidado: true, sarlaftOk: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json({ usuarios, total: usuarios.length })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/usuarios/dashboard', auth, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.userId } })
    const solicitudes = await prisma.solicitud.findMany({
      where: { usuarioId: req.userId },
      orderBy: { createdAt: 'desc' }
    })
    const obligaciones = await prisma.obligacion.findMany({
      where: { usuarioId: req.userId },
      orderBy: { proximoVenc: 'asc' }
    })
    const notificaciones = await prisma.notificacion.findMany({
      where: { usuarioId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
    res.json({ usuario, solicitudes, obligaciones, notificaciones })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/usuarios/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      include: { solicitudes: true, obligaciones: true }
    })
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.json(user)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/usuarios/:id/estado', auth, adminOnly, async (req, res) => {
  try {
    const { estado } = req.body
    const user = await prisma.usuario.update({ where: { id: req.params.id }, data: { estado } })
    res.json(user)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/usuarios/:id', auth, adminOnly, async (req, res) => {
  try {
    const { primerNombre, segundoNombre, primerApellido, segundoApellido, email, telefono, direccion } = req.body
    const user = await prisma.usuario.update({
      where: { id: req.params.id },
      data: { primerNombre, segundoNombre, primerApellido, segundoApellido, email, telefono, direccion }
    })
    res.json(user)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/usuarios/:id/kyc', auth, adminOnly, async (req, res) => {
  try {
    const { kycValidado, sarlaftOk } = req.body
    const user = await prisma.usuario.update({
      where: { id: req.params.id },
      data: { kycValidado, sarlaftOk }
    })
    res.json(user)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── SOLICITUDES ──────────────────────────────────────────────────────────────
app.post('/api/v1/solicitudes', auth, async (req, res) => {
  try {
    const { tipo, monto, cuotaInicial, plazo, tasaMensual, vehiculoId, inmuebleId, destino, valorResidual } = req.body
    const capital = monto - (cuotaInicial || 0)
    const calc = tasaMensual && plazo ? calcAmort(capital, tasaMensual, plazo) : { cuota: 0 }

    const sol = await prisma.solicitud.create({
      data: {
        radicado: `RAD-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
        usuarioId: req.userId, tipo, estado: 'RADICADA',
        monto, cuotaInicial, plazo, tasaMensual,
        cuotaEstimada: calc.cuota,
        totalPagar: calc.cuota && plazo ? calc.cuota * plazo : null,
        vehiculoId, inmuebleId, destino, valorResidual, consentimientoCR: true
      }
    })
    res.json(sol)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/solicitudes/mias', auth, async (req, res) => {
  try {
    const solicitudes = await prisma.solicitud.findMany({
      where: { usuarioId: req.userId },
      include: { vehiculo: true, inmueble: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(solicitudes)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/solicitudes', auth, adminOnly, async (req, res) => {
  try {
    const { estado, tipo } = req.query
    const where = {}
    if (estado) where.estado = estado
    if (tipo) where.tipo = tipo
    const solicitudes = await prisma.solicitud.findMany({
      where,
      include: { usuario: { select: { primerNombre: true, primerApellido: true, email: true, numDocumento: true } }, vehiculo: true, inmueble: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(solicitudes)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/solicitudes/:id', auth, async (req, res) => {
  try {
    const sol = await prisma.solicitud.findUnique({
      where: { id: req.params.id },
      include: { usuario: true, vehiculo: true, inmueble: true, documentos: true }
    })
    if (!sol) return res.status(404).json({ message: 'No encontrada' })
    if (req.userRol === 'CLIENTE' && sol.usuarioId !== req.userId)
      return res.status(403).json({ message: 'Sin acceso' })
    res.json(sol)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/solicitudes/:id/decision', auth, adminOnly, async (req, res) => {
  try {
    const { tipo, monto, tasa, plazo, obs } = req.body
    const estadoMap = {
      ap: 'APROBADA', ac: 'APROBADA_CON_CONDICIONES',
      rec: 'RECHAZADA', doc: 'DOCUMENTACION_PENDIENTE'
    }
    const estado = estadoMap[tipo]
    if (!estado) return res.status(400).json({ message: 'Tipo de decisión inválido' })

    const updateData = { estado, analistaId: req.userId, motivoDecision: obs || null }
    if (monto) updateData.monto = monto
    if (tasa) updateData.tasaMensual = tasa
    if (plazo) updateData.plazo = plazo

    const sol = await prisma.solicitud.update({ where: { id: req.params.id }, data: updateData })

    // Audit log
    await prisma.auditLog.create({
      data: { usuarioId: req.userId, solicitudId: sol.id, accion: `DECISION_${estado}`, modulo: 'SOLICITUDES', detalle: `Decisión: ${estado}. ${obs || ''}` }
    }).catch(() => {})

    res.json(sol)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── OBLIGACIONES ────────────────────────────────────────────────────────────
app.get('/api/v1/obligaciones/mias', auth, async (req, res) => {
  try {
    const obligaciones = await prisma.obligacion.findMany({
      where: { usuarioId: req.userId },
      orderBy: { proximoVenc: 'asc' }
    })
    res.json(obligaciones)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/obligaciones', auth, adminOnly, async (req, res) => {
  try {
    const { estado } = req.query
    const where = estado ? { estado } : {}
    const obligaciones = await prisma.obligacion.findMany({
      where,
      include: { usuario: { select: { primerNombre: true, primerApellido: true, numDocumento: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(obligaciones)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/obligaciones/:id', auth, async (req, res) => {
  try {
    const obl = await prisma.obligacion.findUnique({
      where: { id: req.params.id },
      include: { cuotasAmort: true, pagos: true }
    })
    if (!obl) return res.status(404).json({ message: 'No encontrada' })
    res.json(obl)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/obligaciones/:id/extrajudicial', auth, adminOnly, async (req, res) => {
  try {
    const obl = await prisma.obligacion.update({
      where: { id: req.params.id },
      data: { estado: 'EN_COBRO_JUDICIAL' }
    })
    res.json(obl)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── PAGOS ───────────────────────────────────────────────────────────────────
app.post('/api/v1/pagos', auth, async (req, res) => {
  try {
    const { obligacionId, monto, medio } = req.body
    const pago = await prisma.pago.create({
      data: {
        usuarioId: req.userId, obligacionId, monto,
        montoCap: monto * 0.7, montoInt: monto * 0.3, montoMora: 0,
        medio, estado: 'CONFIRMADO', confirmedAt: new Date()
      }
    })
    res.json(pago)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/pagos/historial', auth, async (req, res) => {
  try {
    const pagos = await prisma.pago.findMany({
      where: { usuarioId: req.userId },
      orderBy: { createdAt: 'desc' }
    })
    res.json(pagos)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.post('/api/v1/pagos/manual', auth, adminOnly, async (req, res) => {
  try {
    const { obligacionId, monto, medio } = req.body
    const obligacion = await prisma.obligacion.findUnique({ where: { id: obligacionId } })
    if (!obligacion) return res.status(404).json({ message: 'Obligación no encontrada' })
    const pago = await prisma.pago.create({
      data: {
        usuarioId: obligacion.usuarioId, obligacionId, monto,
        montoCap: monto * 0.7, montoInt: monto * 0.3, montoMora: 0,
        medio: medio || 'TRANSFERENCIA', estado: 'CONFIRMADO', confirmedAt: new Date()
      }
    })
    const nuevoSaldo = Number(obligacion.saldo) - Number(pago.montoCap)
    await prisma.obligacion.update({
      where: { id: obligacionId },
      data: {
        saldo: nuevoSaldo > 0 ? nuevoSaldo : 0,
        cuotasPagadas: obligacion.cuotasPagadas + 1,
        estado: nuevoSaldo <= 0 ? 'CANCELADA' : obligacion.estado
      }
    })
    res.json(pago)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── INVENTARIO ───────────────────────────────────────────────────────────────
app.post('/api/v1/inventario/upload-imagen', auth, adminOnly, async (req, res) => {
  try {
    const { base64, nombre, carpeta } = req.body
    if (!base64) return res.status(400).json({ message: 'Falta la imagen (base64)' })
    const url = await uploadImageToCloudinary(base64, nombre || 'imagen', carpeta || 'general')
    res.json({ url })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/inventario/vehiculos', auth, async (req, res) => {
  try {
    const { estado } = req.query
    const where = estado ? { estado } : {}
    const vehiculos = await prisma.vehiculo.findMany({ where, orderBy: { createdAt: 'desc' } })
    res.json(vehiculos)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.post('/api/v1/inventario/vehiculos', auth, adminOnly, async (req, res) => {
  try {
    const v = await prisma.vehiculo.create({ data: req.body })
    res.json(v)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/inventario/vehiculos/:id/reservar', auth, async (req, res) => {
  try {
    const v = await prisma.vehiculo.update({ where: { id: req.params.id }, data: { estado: 'RESERVADO' } })
    res.json(v)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/inventario/vehiculos/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, marca, linea, anio, color, vin, km, valor, tipo, imagenes } = req.body
    const v = await prisma.vehiculo.update({
      where: { id: req.params.id },
      data: { nombre, marca, linea, anio: anio?+anio:undefined, color, vin, km: km!==undefined?+km:undefined, valor: valor!==undefined?+valor:undefined, tipo, imagenes }
    })
    res.json(v)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.delete('/api/v1/inventario/vehiculos/:id', auth, adminOnly, async (req, res) => {
  try {
    await prisma.vehiculo.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/inventario/inmuebles', auth, async (req, res) => {
  try {
    const { estado } = req.query
    const where = estado ? { estado } : {}
    const inmuebles = await prisma.inmueble.findMany({ where, orderBy: { createdAt: 'desc' } })
    res.json(inmuebles)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.post('/api/v1/inventario/inmuebles', auth, adminOnly, async (req, res) => {
  try {
    const i = await prisma.inmueble.create({ data: req.body })
    res.json(i)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/inventario/inmuebles/:id/reservar', auth, async (req, res) => {
  try {
    const i = await prisma.inmueble.update({ where: { id: req.params.id }, data: { estado: 'RESERVADO' } })
    res.json(i)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/inventario/inmuebles/:id', auth, adminOnly, async (req, res) => {
  try {
    const { nombre, direccion, municipio, matricula, area, areaPrivada, estrato, tipo, valor, imagenes } = req.body
    const i = await prisma.inmueble.update({
      where: { id: req.params.id },
      data: { nombre, direccion, municipio, matricula, area: area!==undefined?+area:undefined, areaPrivada: areaPrivada!==undefined?+areaPrivada:undefined, estrato, tipo, valor: valor!==undefined?+valor:undefined, imagenes }
    })
    res.json(i)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.delete('/api/v1/inventario/inmuebles/:id', auth, adminOnly, async (req, res) => {
  try {
    await prisma.inmueble.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── FONDO ────────────────────────────────────────────────────────────────────
app.get('/api/v1/fondo/mi-inversion', auth, async (req, res) => {
  try {
    const inv = await prisma.inversion.findUnique({
      where: { usuarioId: req.userId },
      include: { rendimientos: { orderBy: { createdAt: 'desc' }, take: 12 } }
    })
    res.json(inv || null)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.post('/api/v1/fondo/invertir', auth, async (req, res) => {
  try {
    const { modalidad, montoInicial, plazoMeses, pctDelegada, tasaFija } = req.body
    const inv = await prisma.inversion.upsert({
      where: { usuarioId: req.userId },
      update: { modalidad, saldoActual: montoInicial, montoInicial, plazoMeses, pctDelegada, pctDirigida: 100 - pctDelegada, tasaFija, estado: 'ACTIVA' },
      create: { usuarioId: req.userId, perfil: 'MODERADO', modalidad, montoInicial, saldoActual: montoInicial, plazoMeses, pctDelegada: pctDelegada || 70, pctDirigida: 100 - (pctDelegada || 70), tasaFija, estado: 'ACTIVA' }
    })
    res.json(inv)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/fondo/admin/todas', auth, adminOnly, async (req, res) => {
  try {
    const inversiones = await prisma.inversion.findMany({
      include: { usuario: { select: { primerNombre: true, primerApellido: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    })
    res.json(inversiones)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.get('/api/v1/fondo/admin/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const inversiones = await prisma.inversion.findMany({ where: { estado: 'ACTIVA' } })
    const totalFondo = inversiones.reduce((s, i) => s + Number(i.saldoActual), 0)
    res.json({ totalFondo, totalInversionistas: inversiones.length, inversiones })
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── NOTIFICACIONES ──────────────────────────────────────────────────────────
app.get('/api/v1/notificaciones', auth, async (req, res) => {
  try {
    const notifs = await prisma.notificacion.findMany({
      where: { usuarioId: req.userId },
      orderBy: { createdAt: 'desc' }
    })
    res.json(notifs)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/notificaciones/:id/leer', auth, async (req, res) => {
  try {
    const n = await prisma.notificacion.update({ where: { id: req.params.id }, data: { leida: true } })
    res.json(n)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
app.get('/api/v1/auditoria', auth, adminOnly, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      include: { usuario: { select: { primerNombre: true, primerApellido: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
    res.json(logs)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── CONFIG SISTEMA ───────────────────────────────────────────────────────────
app.get('/api/v1/config', auth, adminOnly, async (req, res) => {
  try {
    const config = await prisma.configSistema.findMany()
    res.json(config)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

app.put('/api/v1/config/:clave', auth, adminOnly, async (req, res) => {
  try {
    const { valor } = req.body
    const c = await prisma.configSistema.upsert({
      where: { clave: req.params.clave },
      update: { valor, updatedBy: req.userId },
      create: { clave: req.params.clave, valor, updatedBy: req.userId }
    })
    res.json(c)
  } catch (e) { res.status(500).json({ message: e.message }) }
})

// ─── START ────────────────────────────────────────────────────────────────────
async function start() {
  await prisma.$connect()
  app.listen(PORT, '0.0.0.0', () => console.log(`Servidor listo en puerto ${PORT}`))
}
start().catch(e => { console.error(e); process.exit(1) })
