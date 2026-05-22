import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed de Warp Finance...')

  // ─── Usuarios demo ──────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('123456', 12)
  const clienteHash = await bcrypt.hash('123456', 12)

  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@warpfinance.com' },
    update: {},
    create: {
      primerNombre: 'Carlos',
      primerApellido: 'Morales',
      segundoApellido: 'Ríos',
      tipoDocumento: 'CEDULA',
      numDocumento: '71234890',
      email: 'admin@warpfinance.com',
      telefono: '+57 314 5678901',
      fechaNacimiento: new Date('1985-03-15'),
      usuario: 'admin',
      passwordHash: adminHash,
      rol: 'ADMIN',
      estado: 'ACTIVO',
      kycValidado: true,
      sarlaftOk: true,
      terminosAcept: true,
      datosAcept: true,
      direccion: 'Calle 10 #43-50 El Poblado, Medellín',
    },
  })

  const analista = await prisma.usuario.upsert({
    where: { email: 'r.ospina@warpfinance.com' },
    update: {},
    create: {
      primerNombre: 'Rosa',
      primerApellido: 'Ospina',
      tipoDocumento: 'CEDULA',
      numDocumento: '43112902',
      email: 'r.ospina@warpfinance.com',
      telefono: '+57 300 1234567',
      fechaNacimiento: new Date('1990-07-22'),
      usuario: 'r.ospina',
      passwordHash: adminHash,
      rol: 'ANALISTA',
      estado: 'ACTIVO',
      kycValidado: true,
      sarlaftOk: true,
      terminosAcept: true,
      datosAcept: true,
      direccion: 'Cra 43A #1-50, Medellín',
    },
  })

  const cliente = await prisma.usuario.upsert({
    where: { email: 'm.garcia@correo.com' },
    update: {},
    create: {
      primerNombre: 'María',
      segundoNombre: 'Isabel',
      primerApellido: 'García',
      segundoApellido: 'López',
      tipoDocumento: 'CEDULA',
      numDocumento: '52841304',
      email: 'm.garcia@correo.com',
      telefono: '+57 310 4521890',
      fechaNacimiento: new Date('1992-05-14'),
      usuario: 'cliente',
      passwordHash: clienteHash,
      rol: 'CLIENTE',
      estado: 'ACTIVO',
      perfilInversion: 'MODERADO',
      scoreTest: 26,
      kycValidado: true,
      sarlaftOk: true,
      terminosAcept: true,
      datosAcept: true,
      direccion: 'Calle 8 Sur #42-30 El Poblado, Medellín',
    },
  })

  const inversionista = await prisma.usuario.upsert({
    where: { email: 'r.perez@email.com' },
    update: {},
    create: {
      primerNombre: 'Roberto',
      primerApellido: 'Pérez',
      segundoApellido: 'Arango',
      tipoDocumento: 'CEDULA',
      numDocumento: '71234891',
      email: 'r.perez@email.com',
      telefono: '+57 314 5678902',
      fechaNacimiento: new Date('1975-11-08'),
      usuario: 'r.perez',
      passwordHash: clienteHash,
      rol: 'INVERSIONISTA',
      estado: 'ACTIVO',
      perfilInversion: 'AGRESIVO',
      scoreTest: 42,
      kycValidado: true,
      sarlaftOk: true,
      terminosAcept: true,
      datosAcept: true,
      direccion: 'Av Las Vegas #63-50, Medellín',
    },
  })

  console.log('✅ Usuarios creados:', admin.email, analista.email, cliente.email, inversionista.email)

  // ─── Inventario vehicular ────────────────────────────────────────────────────
  const vehiculos = await Promise.all([
    prisma.vehiculo.upsert({
      where: { vin: '3GNAXHEV5PL000121' },
      update: {},
      create: {
        nombre: 'Chevrolet Spark GT 2023',
        marca: 'Chevrolet', linea: 'Spark GT', anio: 2023,
        color: 'Blanco', vin: '3GNAXHEV5PL000121', km: 0,
        valor: 19000000, tipo: 'PARTICULAR', estado: 'DISPONIBLE',
      },
    }),
    prisma.vehiculo.upsert({
      where: { vin: 'JM3KFADM0N0503211' },
      update: {},
      create: {
        nombre: 'Mazda CX-5 Touring 2022',
        marca: 'Mazda', linea: 'CX-5', anio: 2022,
        color: 'Gris', vin: 'JM3KFADM0N0503211', km: 28400,
        valor: 35000000, tipo: 'SUV', estado: 'DISPONIBLE',
      },
    }),
    prisma.vehiculo.upsert({
      where: { vin: 'MR0FB3CD1P0742901' },
      update: {},
      create: {
        nombre: 'Toyota Hilux 4x4 2024',
        marca: 'Toyota', linea: 'Hilux', anio: 2024,
        color: 'Negro', vin: 'MR0FB3CD1P0742901', km: 0,
        valor: 52000000, tipo: 'CAMIONETA', estado: 'DISPONIBLE',
      },
    }),
    prisma.vehiculo.upsert({
      where: { vin: 'KNADH4A34N6012384' },
      update: {},
      create: {
        nombre: 'Kia Picanto 2022',
        marca: 'Kia', linea: 'Picanto', anio: 2022,
        color: 'Rojo', vin: 'KNADH4A34N6012384', km: 15200,
        valor: 38000000, tipo: 'PARTICULAR', estado: 'DISPONIBLE',
      },
    }),
    prisma.vehiculo.upsert({
      where: { vin: '3VWF17AT5FM000998' },
      update: {},
      create: {
        nombre: 'Volkswagen Tiguan 2024',
        marca: 'Volkswagen', linea: 'Tiguan', anio: 2024,
        color: 'Plateado', vin: '3VWF17AT5FM000998', km: 0,
        valor: 115000000, tipo: 'SUV', estado: 'DISPONIBLE',
      },
    }),
  ])
  console.log(`✅ Vehículos creados: ${vehiculos.length}`)

  // ─── Inventario inmuebles ────────────────────────────────────────────────────
  const inmuebles = await Promise.all([
    prisma.inmueble.upsert({
      where: { matricula: '050-123456' },
      update: {},
      create: {
        nombre: 'Apartamento 302 · El Poblado',
        direccion: 'Cra 43A #34-15 Apto 302',
        municipio: 'Medellín',
        matricula: '050-123456',
        area: 85, areaPrivada: 78,
        estrato: '6', tipo: 'VIVIENDA',
        valor: 480000000, estado: 'DISPONIBLE',
      },
    }),
    prisma.inmueble.upsert({
      where: { matricula: '050-234567' },
      update: {},
      create: {
        nombre: 'Local 12 · CC Santafé',
        direccion: 'Autopista Sur #50-50 Local 12',
        municipio: 'Medellín',
        matricula: '050-234567',
        area: 48, areaPrivada: 45,
        estrato: 'Comercial', tipo: 'LOCAL_COMERCIAL',
        valor: 320000000, estado: 'DISPONIBLE',
      },
    }),
    prisma.inmueble.upsert({
      where: { matricula: '050-345678' },
      update: {},
      create: {
        nombre: 'Oficina 801 · Milla de Oro',
        direccion: 'Calle 7 #43-100 Of. 801',
        municipio: 'Medellín',
        matricula: '050-345678',
        area: 120, areaPrivada: 112,
        estrato: 'Comercial', tipo: 'OFICINA',
        valor: 650000000, estado: 'DISPONIBLE',
      },
    }),
  ])
  console.log(`✅ Inmuebles creados: ${inmuebles.length}`)

  // ─── Solicitudes demo ────────────────────────────────────────────────────────
  const sol1 = await prisma.solicitud.upsert({
    where: { radicado: 'RAD-2026-00241' },
    update: {},
    create: {
      radicado: 'RAD-2026-00241',
      usuarioId: cliente.id,
      tipo: 'CREDITO_VEHICULAR',
      estado: 'DESEMBOLSADA',
      monto: 19000000,
      cuotaInicial: 3800000,
      plazo: 12,
      tasaMensual: 2.0,
      cuotaEstimada: 1908780,
      totalPagar: 22905360,
      vehiculoId: vehiculos[0].id,
      analistaId: admin.id,
      ingresosMes: 8500000,
      egresosMes: 3200000,
      consentimientoCR: true,
      scoreCredito: 742,
      sarlaftOk: true,
    },
  })

  const sol2 = await prisma.solicitud.upsert({
    where: { radicado: 'RAD-2026-00287' },
    update: {},
    create: {
      radicado: 'RAD-2026-00287',
      usuarioId: cliente.id,
      tipo: 'PRESTAMO_LIBRE_INVERSION',
      estado: 'EN_ANALISIS',
      monto: 5000000,
      plazo: 18,
      tasaMensual: 3.5,
      cuotaEstimada: 379084,
      analistaId: analista.id,
      ingresosMes: 8500000,
      egresosMes: 3200000,
      consentimientoCR: true,
      scoreCredito: 742,
      sarlaftOk: true,
    },
  })
  console.log('✅ Solicitudes demo creadas')

  // ─── Obligaciones demo ───────────────────────────────────────────────────────
  const obl1 = await prisma.obligacion.upsert({
    where: { solicitudId: sol1.id },
    update: {},
    create: {
      usuarioId: cliente.id,
      solicitudId: sol1.id,
      tipo: 'CREDITO_VEHICULAR',
      descripcion: 'Crédito vehicular · Chevrolet Spark GT 2023',
      saldo: 11003418,
      cuota: 1908780,
      tasaMensual: 2.0,
      plazoTotal: 12,
      cuotasPagadas: 9,
      proximoVenc: new Date('2026-06-13'),
      estado: 'AL_DIA',
      diasMora: 0,
    },
  })
  console.log('✅ Obligaciones demo creadas')

  // ─── Inversión demo ──────────────────────────────────────────────────────────
  await prisma.inversion.upsert({
    where: { usuarioId: inversionista.id },
    update: {},
    create: {
      usuarioId: inversionista.id,
      perfil: 'AGRESIVO',
      modalidad: 'VARIABLE',
      montoInicial: 120000000,
      saldoActual: 120000000,
      tasaFija: 2.7,
      plazoMeses: 12,
      pctDelegada: 70,
      pctDirigida: 30,
      reinversion: false,
      estado: 'ACTIVA',
      rendAcumulado: 9720000,
    },
  })
  console.log('✅ Inversión demo creada')

  // ─── Config sistema ──────────────────────────────────────────────────────────
  const configs = [
    { clave: 'CUOTA_INICIAL_MIN_VEHICULO', valor: '20', descripcion: 'Cuota inicial mínima vehículo (%)' },
    { clave: 'CUOTA_INICIAL_MIN_INMUEBLE', valor: '20', descripcion: 'Cuota inicial mínima inmueble (%)' },
    { clave: 'MAX_ENDEUDAMIENTO_PRESTAMO', valor: '40', descripcion: 'Máx. endeudamiento préstamo (%)' },
    { clave: 'MAX_ENDEUDAMIENTO_LEASING', valor: '35', descripcion: 'Máx. endeudamiento leasing (%)' },
    { clave: 'SLA_APROBACION_HORAS', valor: '48', descripcion: 'SLA máximo de aprobación (horas)' },
    { clave: 'TASA_MAXIMA_MENSUAL', valor: '4.2', descripcion: 'Tasa máxima mensual (%)' },
    { clave: 'COMISION_REND_FIJO', valor: '15', descripcion: 'Comisión rendimiento fijo (%)' },
    { clave: 'COMISION_REND_VARIABLE', valor: '20', descripcion: 'Comisión rendimiento variable (%)' },
    { clave: 'DIA_CORTE_MENSUAL', valor: '1', descripcion: 'Día de corte mensual del fondo' },
  ]

  for (const cfg of configs) {
    await prisma.configSistema.upsert({
      where: { clave: cfg.clave },
      update: { valor: cfg.valor },
      create: cfg,
    })
  }
  console.log('✅ Configuración del sistema cargada')

  console.log('\n🎉 Seed completado exitosamente!')
  console.log('\n📋 Credenciales de acceso:')
  console.log('  admin      / 123456  → Backoffice completo')
  console.log('  r.ospina   / 123456  → Analista de crédito')
  console.log('  cliente    / 123456  → Portal cliente (María García)')
  console.log('  r.perez    / 123456  → Inversionista (Roberto Pérez)')
}

main()
  .catch(e => { console.error('❌ Error en seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
