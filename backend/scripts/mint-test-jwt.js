// mint-test-jwt.js — Tạo JWT test + CID_HASH cho k6 load test.
//
// CHỈ DÙNG CHO ĐO TẢI / DEV. Không dùng cho production.
// JWT được ký bằng đúng JWT_SECRET của backend nên authenticate chấp nhận;
// nó chỉ chứa walletAddress của một patient có sẵn record trong DB.
//
// Chạy:
//   cd backend
//   node scripts/mint-test-jwt.js            # lấy patient bất kỳ có record
//   node scripts/mint-test-jwt.js 0xWallet   # chỉ định patient cụ thể
//
// Output: dán thẳng vào load-test/.env hoặc dùng làm -e flag cho k6.

import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    if (!process.env.JWT_SECRET) {
        throw new Error('Thiếu JWT_SECRET trong backend/.env');
    }

    const argAddr = process.argv[2] ? process.argv[2].toLowerCase() : null;

    // Tìm 1 record để lấy owner + cidHash → bảo đảm patient này CÓ quyền đọc record đó
    // (đường đọc chính chủ, không gọi canAccess on-chain — đúng phạm vi đo của Quyển).
    const record = await prisma.recordMetadata.findFirst({
        where: argAddr ? { ownerAddress: argAddr } : undefined,
    });

    if (!record) {
        throw new Error(
            argAddr
                ? `Không tìm thấy record nào của ${argAddr}. Tạo vài hồ sơ trước, hoặc bỏ tham số.`
                : 'DB chưa có RecordMetadata nào. Hãy tạo vài hồ sơ test trước khi đo tải.'
        );
    }

    const walletAddress = record.ownerAddress.toLowerCase();
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) {
        throw new Error(`Không có User cho owner ${walletAddress}.`);
    }

    const token = jwt.sign(
        { walletAddress, isPatient: true },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const baseUrl = process.env.K6_BASE_URL || 'http://localhost:3001';
    const recordCount = await prisma.recordMetadata.count({ where: { ownerAddress: walletAddress } });

    console.log('\n=== JWT test cho k6 (dán vào load-test/.env) ===');
    console.log(`# patient: ${walletAddress}  (${recordCount} record)`);
    console.log(`BASE_URL=${baseUrl}`);
    console.log(`PATIENT_JWT=${token}`);
    console.log(`CID_HASH=${record.cidHash}`);
    console.log('\n# Hoặc chạy nhanh kịch bản light:');
    console.log(
        `k6 run -e BASE_URL=${baseUrl} -e PATIENT_JWT=${token} -e CID_HASH=${record.cidHash} scenarios/01-light.js\n`
    );
}

main()
    .catch((e) => {
        console.error('LỖI:', e.message);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
