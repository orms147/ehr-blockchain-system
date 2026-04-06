import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  RecordAdded,
  RecordUpdated,
} from "../generated/RecordRegistry/RecordRegistry";
import { Record, RecordUpdate, Patient } from "../generated/schema";

function loadOrCreatePatient(address: Bytes, ts: BigInt): Patient {
  let id = address.toHexString();
  let p = Patient.load(id);
  if (p == null) {
    p = new Patient(id);
    p.address = address;
    p.recordCount = 0;
    p.firstSeenAt = ts;
  }
  return p as Patient;
}

export function handleRecordAdded(event: RecordAdded): void {
  let ts = event.params.timestamp;

  let patient = loadOrCreatePatient(event.params.owner, ts);
  patient.recordCount = patient.recordCount + 1;
  patient.save();

  let id = event.params.cidHash.toHexString();
  let r = new Record(id);
  r.cidHash = event.params.cidHash;
  r.owner = patient.id;
  r.parentCidHash = event.params.parentCidHash;
  r.recordTypeHash = event.params.recordTypeHash;
  r.createdAt = ts;
  r.createdAtBlock = event.block.number;
  r.createdTxHash = event.transaction.hash;
  r.save();
}

export function handleRecordUpdated(event: RecordUpdated): void {
  let id =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let u = new RecordUpdate(id);
  u.fromRecord = event.params.oldCidHash.toHexString();
  u.oldCidHash = event.params.oldCidHash;
  u.newCidHash = event.params.newCidHash;
  u.owner = event.params.owner;
  u.timestamp = event.block.timestamp;
  u.txHash = event.transaction.hash;
  u.save();
}
