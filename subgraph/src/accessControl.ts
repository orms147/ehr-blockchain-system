import { BigInt } from "@graphprotocol/graph-ts";
import {
  DoctorVerified,
  VerificationRevoked,
  OrganizationCreated,
  OrganizationStatusChanged,
} from "../generated/AccessControl/AccessControl";
import { Doctor, Organization } from "../generated/schema";

export function handleDoctorVerified(event: DoctorVerified): void {
  let id = event.params.doctor.toHexString();
  let d = Doctor.load(id);
  if (d == null) {
    d = new Doctor(id);
    d.address = event.params.doctor;
  }
  d.verified = true;
  d.verifiedAt = event.block.timestamp;
  d.orgId = event.params.orgId;
  d.credential = event.params.credential;
  d.verifier = event.params.verifier;
  d.save();
}

export function handleVerificationRevoked(event: VerificationRevoked): void {
  let id = event.params.user.toHexString();
  let d = Doctor.load(id);
  if (d == null) return;
  d.verified = false;
  d.save();
}

export function handleOrganizationCreated(event: OrganizationCreated): void {
  let id = event.params.orgId.toString();
  let o = new Organization(id);
  o.orgId = event.params.orgId;
  o.name = event.params.name;
  o.primaryAdmin = event.params.primaryAdmin;
  o.backupAdmin = event.params.backupAdmin;
  o.active = true;
  o.createdAt = event.block.timestamp;
  o.save();
}

export function handleOrganizationStatusChanged(
  event: OrganizationStatusChanged
): void {
  let id = event.params.orgId.toString();
  let o = Organization.load(id);
  if (o == null) return;
  o.active = event.params.active;
  o.save();
}
