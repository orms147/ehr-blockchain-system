// Service index - export all services
export { api } from './api';
export { authService } from './auth.service';
export { recordService } from './record.service';
export { keyShareService } from './keyShare.service';
export { ipfsService } from './ipfs.service';
export { relayerService } from './relayer.service';
export { requestService } from './request.service';
export { consentService } from './consent.service';
export { verificationService } from './verification.service';
export { emergencyService } from './emergency.service';
export { delegationService } from './delegation.service';
export { orgService } from './org.service';
// pendingUpdateService removed 2026-04-19 — doctor updates are direct on-chain.
export { accessLogService } from './accessLog.service';
export { default as profileService } from './profile.service';
export * from './crypto';
export * from './nacl-crypto';




