import { useTheme } from "@/hooks/useTheme";
import { PageHeader, SectionCard } from "@/components/Shared";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Moon, Bell, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { theme, toggle } = useTheme();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Configure your workspace and preferences." icon={SettingsIcon} />
      <div className="space-y-5">
        <SectionCard className="p-6">
          <h2 className="text-base font-bold mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /> Organization</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Company name</Label><Input defaultValue="Print2Go" /></div>
            <div className="space-y-1.5"><Label>Default location</Label><Input defaultValue="Print2Go London" /></div>
            <div className="space-y-1.5"><Label>Currency</Label><Input defaultValue="CAD ($)" /></div>
            <div className="space-y-1.5"><Label>Timezone</Label><Input defaultValue="Europe/London" /></div>
          </div>
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => toast.success("Settings saved")} data-testid="save-settings">Save changes</Button>
        </SectionCard>

        <SectionCard className="p-6">
          <h2 className="text-base font-bold mb-4">Preferences</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Moon className="h-4 w-4 text-slate-400" /><div><p className="text-sm font-semibold">Dark mode</p><p className="text-xs text-slate-400">Switch between light and dark themes</p></div></div>
              <Switch checked={theme === "dark"} onCheckedChange={toggle} data-testid="settings-theme-switch" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><Bell className="h-4 w-4 text-slate-400" /><div><p className="text-sm font-semibold">Exception alerts</p><p className="text-xs text-slate-400">Notify me when a job needs attention</p></div></div>
              <Switch defaultChecked data-testid="settings-alerts-switch" />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
