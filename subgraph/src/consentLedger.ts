import { BigInt } from "@graphprotocol/graph-ts";
import {
  ConsentGranted,
  ConsentRevoked,
  EmergencyGranted,
  DelegationGranted,
  DelegationRevoked,
  AccessGrantedViaDelegation,
} from "../generated/ConsentLedger/ConsentLedger";
import {
  ConsentEvent,
  EmergencyEvent,
  DelegationEvent,
  DelegationAccessGrant,
} from "../generated/schema";

function eventId(txHash: string, logIndex: BigInt): string {
  return txHash + "-" + logIndex.toString();
}

export function handleConsentGranted(event: ConsentGranted): void {
  let id = eventId(event.transaction.hash.toHexString(), event.logIndex);
  let e = new ConsentEvent(id);
  e.kind = "granted";
  e.patient = event.params.patient;
  e.grantee = event.params.grantee;
  e.rootCidHash = event.params.rootCidHash;
  e.anchorCidHash = event.params.anchorCidHash;
  e.expireAt = event.params.expireAt;
  e.allowDelegate = event.params.allowDelegate;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleConsentRevoked(event: ConsentRevoked): void {
  let id = eventId(event.transaction.hash.toHexString(), event.logIndex);
  let e = new ConsentEvent(id);
  e.kind = "revoked";
  e.patient = event.params.patient;
  e.grantee = event.params.grantee;
  e.rootCidHash = event.params.rootCidHash;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleEmergencyGranted(event: EmergencyGranted): void {
  let id = eventId(event.transaction.hash.toHexString(), event.logIndex);
  let e = new EmergencyEvent(id);
  e.patient = event.params.patient;
  e.grantee = event.params.grantee;
  e.rootCidHash = event.params.rootCidHash;
  e.anchorCidHash = event.params.anchorCidHash;
  e.expireAt = event.params.expireAt;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleDelegationGranted(event: DelegationGranted): void {
  let id = eventId(event.transaction.hash.toHexString(), event.logIndex);
  let e = new DelegationEvent(id);
  e.kind = "granted";
  e.patient = event.params.patient;
  e.delegatee = event.params.delegatee;
  e.expiresAt = event.params.expiresAt;
  e.allowSubDelegate = event.params.allowSubDelegate;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleDelegationRevoked(event: DelegationRevoked): void {
  let id = eventId(event.transaction.hash.toHexString(), event.logIndex);
  let e = new DelegationEvent(id);
  e.kind = "revoked";
  e.patient = event.params.patient;
  e.delegatee = event.params.delegatee;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleAccessGrantedViaDelegation(
  event: AccessGrantedViaDelegation
): void {
  let id = eventId(event.transaction.hash.toHexString(), event.logIndex);
  let e = new DelegationAccessGrant(id);
  e.patient = event.params.patient;
  e.newGrantee = event.params.newGrantee;
  e.byDelegatee = event.params.byDelegatee;
  e.rootCidHash = event.params.rootCidHash;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}
