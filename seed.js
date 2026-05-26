const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando seed...')

  const passwordHash = await bcrypt.hash('123456', 12)

  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: {
      primerNombre: 'Admin',
      primerApellido: 'Warp',
      email: 'admin@warpfinance.co',
      usuario: 'admin',
      passwordHash,
      rol: 'ADMIN',
      estado: 'ACTIVO',
      terminosAcept: true,
      datosAcept: true,
    }
  })

  const cliente = await prisma.usuario.upsert({
    where: { usuario: 'cliente' },
    update: {},
    create: {
      primerNombre: 'Cliente',
      primerApellido: 'Demo',
      email: 'cliente@warpfinance.co',
      usuario: 'cliente',
      passwordHash,
      rol: 'CLIENTE',
      estado: 'ACTIVO',
      terminosAcept: true,
      datosAcept: true,
    }
  })

  console.log('Seed completado:', { admin: admin.usuario, cliente: cliente.usuario })
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
