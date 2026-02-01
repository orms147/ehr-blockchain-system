import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const cid = '0x09e8aafa08a07b424f76f99b2704c1e07f85c36b2d5c2028b9a66f6ae31114d1';

async function main() {
    console.log(`Checking record: ${cid}`);
    const record = await prisma.recordMetadata.findUnique({
        where: { cidHash: cid }
    });
    console.log('RECORD:', JSON.stringify(record, null, 2));

    if (record && record.parentCidHash) {
        console.log(`Checking Parent: ${record.parentCidHash}`);
        const parent = await prisma.recordMetadata.findUnique({
            where: { cidHash: record.parentCidHash }
        });
        console.log('PARENT:', JSON.stringify(parent, null, 2));

        if (parent && parent.parentCidHash) {
            console.log(`Checking GrandParent: ${parent.parentCidHash}`);
            const grandparent = await prisma.recordMetadata.findUnique({
                where: { cidHash: parent.parentCidHash }
            });
            console.log('GRANDPARENT:', JSON.stringify(grandparent, null, 2));
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
