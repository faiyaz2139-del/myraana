import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export const Layout = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
    <Sidebar />
    <div className="pl-64 min-h-screen flex flex-col">
      <Topbar />
      <main className="flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  </div>
);
