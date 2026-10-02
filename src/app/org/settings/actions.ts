"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrgMember } from "@/lib/employer-session";

/**
 * Publish-gate records (spec p.15). Signing and the classification review
 * are recorded once: the `null` guard in the where clause means a second
 * submission changes nothing, and the original timestamp stands.
 */
export async function signContractorTerms(): Promise<void> {
  const { orgId, userId } = await requireOrgMember(["OWNER"]);
  const { count } = await db().organization.updateMany({
    where: { id: orgId, contractorTermsSignedAt: null },
    data: { contractorTermsSignedAt: new Date() },
  });
  if (count) {
    await db().auditEvent.create({ data: { actorId: userId, action: "org.terms_signed", entityType: "Organization", entityId: orgId } });
  }
  revalidatePath("/org/settings");
}

export async function recordClassificationReview(): Promise<void> {
  const { orgId, userId } = await requireOrgMember(["OWNER", "COMPLIANCE"]);
  const { count } = await db().organization.updateMany({
    where: { id: orgId, classificationReviewedAt: null },
    data: { classificationReviewedAt: new Date() },
  });
  if (count) {
    await db().auditEvent.create({
      data: { actorId: userId, action: "org.classification_reviewed", entityType: "Organization", entityId: orgId },
    });
  }
  revalidatePath("/org/settings");
}

export async function saveLegalContact(formData: FormData): Promise<void> {
  const { orgId, userId } = await requireOrgMember(["OWNER"]);
  const value = String(formData.get("legalContact") ?? "").trim().replace(/\s+/g, " ").slice(0, 200) || null;
  const before = await db().organization.findUnique({ where: { id: orgId }, select: { legalContact: true } });
  if (before?.legalContact === value) return;
  await db().organization.update({ where: { id: orgId }, data: { legalContact: value } });
  await db().auditEvent.create({
    data: {
      actorId: userId,
      action: "org.legal_contact_changed",
      entityType: "Organization",
      entityId: orgId,
      metadata: { from: before?.legalContact ?? null, to: value },
    },
  });
  revalidatePath("/org/settings");
}
