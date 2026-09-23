import {
  LayoutDashboard, ClipboardList, ListChecks, AlertTriangle, Package, BookOpen,
  Workflow, Cpu, Radio, FileImage, Library, ScrollText, BarChart3, Settings,
  MapPin, Users, Building2, Factory, Activity,
} from "lucide-react";

export const NAV_SECTIONS = [
  {
    title: "Core Operational",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard, id: "dashboard" },
      { label: "Orders", to: "/orders", icon: ClipboardList, id: "orders" },
      { label: "Production Queue", to: "/production-queue", icon: ListChecks, id: "production-queue" },
      { label: "Production Engine", to: "/production", icon: Factory, id: "production" },
      { label: "Exceptions", to: "/exceptions", icon: AlertTriangle, id: "exceptions", badgeKey: "exceptions" },
    ],
  },
  {
    title: "Production Assets",
    items: [
      { label: "Products", to: "/products", icon: Package, id: "products" },
      { label: "Recipes", to: "/recipes", icon: BookOpen, id: "recipes" },
      { label: "Processes", to: "/processes", icon: Workflow, id: "processes" },
      { label: "Machines", to: "/machines", icon: Cpu, id: "machines" },
      { label: "Edge Agents", to: "/edge-agents", icon: Radio, id: "edge-agents" },
    ],
  },
  {
    title: "Knowledge & Audit",
    items: [
      { label: "Files & Artwork", to: "/files", icon: FileImage, id: "files" },
      { label: "SOP Library", to: "/sop-library", icon: Library, id: "sop-library" },
      { label: "Diagnostics", to: "/diagnostics", icon: Activity, id: "diagnostics" },
      { label: "Audit Log", to: "/audit-log", icon: ScrollText, id: "audit-log" },
      { label: "Reports", to: "/reports", icon: BarChart3, id: "reports" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Settings", to: "/settings", icon: Settings, id: "settings" },
      { label: "Locations", to: "/locations", icon: MapPin, id: "locations" },
      { label: "Users", to: "/users", icon: Users, id: "users" },
      { label: "Tenants", to: "/tenants", icon: Building2, id: "tenants" },
    ],
  },
];

export const STATUS_CONFIG = {
  ready: { label: "Ready", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50" },
  running: { label: "Running", dot: "bg-blue-500 animate-pulse", cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/50" },
  waiting: { label: "Waiting", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50" },
  exception: { label: "Exception", dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50" },
  completed: { label: "Completed", dot: "bg-teal-500", cls: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800/50" },
};

export const SEVERITY_CONFIG = {
  high: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
  low: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
};

export const CATEGORY_COLORS = {
  business_cards: "from-indigo-500 to-blue-600",
  flyers: "from-orange-500 to-amber-600",
  stickers: "from-rose-500 to-pink-600",
  brochures: "from-emerald-500 to-teal-600",
  postcards: "from-sky-500 to-cyan-600",
  posters: "from-violet-500 to-purple-600",
  banner: "from-red-500 to-orange-600",
  booklets: "from-fuchsia-500 to-pink-600",
  labels: "from-lime-500 to-green-600",
  menus: "from-yellow-500 to-amber-600",
  invites: "from-pink-500 to-rose-600",
  general: "from-slate-500 to-slate-600",
};

export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
