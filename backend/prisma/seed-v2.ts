import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding V2 Feature Flags...');

  // Delete existing global flag if any
  await prisma.featureFlag.deleteMany({
    where: { tenantId: null, key: 'feature.flows.enabled' }
  });

  await prisma.featureFlag.create({
    data: {
      tenantId: null,
      key: 'feature.flows.enabled',
      enabled: true,
      description: 'V2 Visual Flow Engine'
    }
  });

  console.log('V2 Feature Flags seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
