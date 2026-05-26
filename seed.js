const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando seed...')

  const passwordHash = await bcrypt.hash('123456', 12)

  await prisma.usuario.upsert({
    where: { email: 'admin@warpfinance.co' },
    update: {},
    create: {
      primerNombre: 'Admin',
      primerApellido: 'Warp',
      email: 'admin@warpfinance.co',
      usuario: 'admin',
      numDocumento: '000000001',
      passwordHash,
      rol: 'ADMIN',
      estado: 'ACTIVO',
      terminosAcept: true,
      datosAcept: true,
    }
  })

  await prisma.usuario.upsert({
    where: { email: 'cliente@warpfinance.co' },
    update: {},
    create: {
      primerNombre: 'Cliente',
      primerApellido: 'Demo',
      email: 'cliente@warpfinance.co',
      usuario: 'cliente',
      numDocumento: '000000002',
      passwordHash,
      rol: 'CLIENTE',
      estado: 'ACTIVO',
      terminosAcept: true,
      datosAcept: true,
    }
  })

  console.log('Seed completado OK')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
