
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const childCid = process.argv[2];
    if (!childCid) {
        console.error("Please provide child CID hash");
        process.exit(1);
    }

    console.log(`Checking DB for Record: ${childCid}`);

    const record = await prisma.recordMetadata.findUnique({
        where: { cidHash: childCid.toLowerCase() }
    });

    if (!record) {
        console.log("Record NOT FOUND in DB.");
    } else {
        console.log("Record Found:");
        console.log("ID:", record.id);
        console.log("CID:", record.cidHash);
        console.log("Parent CID:", record.parentCidHash);
        console.log("Owner:", record.ownerAddress);
        console.log("CreatedBy:", record.createdBy);
    }

    const keyShare = await prisma.keyShare.findFirst({
        where: { cidHash: childCid.toLowerCase() }
    });

    console.log("\nKeyShare Found:", !!keyShare);
    if (keyShare) {
        console.log("Recipient:", keyShare.recipientAddress);
        console.log("Status:", keyShare.status);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
