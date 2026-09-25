import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Assistant from "@/pages/Assistant";
import Orders from "@/pages/Orders";
import NewOrder from "@/pages/NewOrder";
import ProductionQueue from "@/pages/ProductionQueue";
import ProductionEngine from "@/pages/ProductionEngine";
import Exceptions from "@/pages/Exceptions";
import Products from "@/pages/Products";
import Recipes from "@/pages/Recipes";
import Processes from "@/pages/Processes";
import Machines from "@/pages/Machines";
import EdgeAgents from "@/pages/EdgeAgents";
import Files from "@/pages/Files";
import SOPLibrary from "@/pages/SOPLibrary";
import Diagnostics from "@/pages/Diagnostics";
import AuditLog from "@/pages/AuditLog";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Locations from "@/pages/Locations";
import Users from "@/pages/Users";
import Tenants from "@/pages/Tenants";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/new" element={<NewOrder />} />
          <Route path="/production-queue" element={<ProductionQueue />} />
          <Route path="/production" element={<ProductionEngine />} />
          <Route path="/exceptions" element={<Exceptions />} />
          <Route path="/products" element={<Products />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/processes" element={<Processes />} />
          <Route path="/machines" element={<Machines />} />
          <Route path="/edge-agents" element={<EdgeAgents />} />
          <Route path="/files" element={<Files />} />
          <Route path="/sop-library" element={<SOPLibrary />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/users" element={<Users />} />
          <Route path="/tenants" element={<Tenants />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
