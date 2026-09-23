import { CATEGORY_COLORS } from "@/lib/constants";
import { FileText } from "lucide-react";

export const ProductThumb = ({ category, name, size = "md" }) => {
  const grad = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;
  const dim = size === "sm" ? "h-9 w-9 text-[10px]" : "h-11 w-11 text-xs";
  const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`${dim} shrink-0 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center font-bold text-white shadow-sm`}>
      {initials || <FileText className="h-4 w-4" />}
    </div>
  );
};
