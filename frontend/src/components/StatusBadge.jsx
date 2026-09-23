import { STATUS_CONFIG } from "@/lib/constants";

export const StatusBadge = ({ status, testid }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.waiting;
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};
