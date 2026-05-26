const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando seed...')
  const passwordHash = await bcrypt.hash('123456', 12)

  try {
    await prisma.usuario.create({
      data: {
        primerNombre: 'Admin', primerApellido: 'Warp',
        email: 'admin@warpfinance.co', usuario: 'admin',
        numDocumento: '000000001', passwordHash,
        rol: 'ADMIN', estado: 'ACTIVO',
        terminosAcept: true, datosAcept: true,
      }
    })
  } catch(e) { console.log('Admin ya existe') }

  try {
    await prisma.usuario.create({
      data: {
        primerNombre: 'Cliente', primerApellido: 'Demo',
        email: 'cliente@warpfinance.co', usuario: 'cliente',
        numDocumento: '000000002', passwordHash,
        rol: 'CLIENTE', estado: 'ACTIVO',
        terminosAcept: true, datosAcept: true,
      }
    })
  } catch(e) { console.log('Cliente ya existe') }

  console.log('Seed OK')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
