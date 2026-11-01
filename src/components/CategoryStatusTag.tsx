import { CATEGORY_STATUS_LABEL, type CategoryStatus } from "@/lib/job-categories";

/**
 * "In development" or "Planned" beside a category's name; nothing beside a
 * built one. A plain dashed label, not a status chip: it describes the
 * product, not a record. Never lets a planned category read as launched.
 */
export function CategoryStatusTag({ status }: { status: CategoryStatus }) {
  const label = CATEGORY_STATUS_LABEL[status];
  return label ? <span className="badge-dashed">{label}</span> : null;
}
