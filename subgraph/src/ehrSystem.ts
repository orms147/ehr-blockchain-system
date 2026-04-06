import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AccessRequested,
  RequestCompleted,
  RequestRejected,
} from "../generated/EHRSystem/EHRSystem";
import { AccessRequest, Patient } from "../generated/schema";

function reqTypeName(t: i32): string {
  if (t == 0) return "DirectAccess";
  if (t == 1) return "FullDelegation";
  return "RecordDelegation";
}

function loadOrCreatePatient(address: Bytes, ts: BigInt): Patient {
  let id = address.toHexString();
  let p = Patient.load(id);
  if (p == null) {
    p = new Patient(id);
    p.address = address;
    p.recordCount = 0;
    p.firstSeenAt = ts;
    p.save();
  }
  return p as Patient;
}

export function handleAccessRequested(event: AccessRequested): void {
  let patient = loadOrCreatePatient(
    event.params.patient,
    event.block.timestamp
  );

  let id = event.params.reqId.toHexString();
  let r = new AccessRequest(id);
  r.reqId = event.params.reqId;
  r.requester = event.params.requester;
  r.patient = patient.id;
  r.rootCidHash = event.params.rootCidHash;
  r.reqType = reqTypeName(event.params.reqType);
  r.status = "Pending";
  r.expiry = event.params.expiry;
  r.requestedAt = event.block.timestamp;
  r.txHash = event.transaction.hash;
  r.save();
}

export function handleRequestCompleted(event: RequestCompleted): void {
  let id = event.params.reqId.toHexString();
  let r = AccessRequest.load(id);
  if (r == null) return;
  r.status = "Completed";
  r.completedAt = event.block.timestamp;
  r.save();
}

export function handleRequestRejected(event: RequestRejected): void {
  let id = event.params.reqId.toHexString();
  let r = AccessRequest.load(id);
  if (r == null) return;
  r.status = "Rejected";
  r.rejectedAt = event.block.timestamp;
  r.save();
}
