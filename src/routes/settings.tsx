import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, KeyRound, ShieldCheck, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageTitle } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getAiKeyStatus, saveAiKey } from "@/lib/ai.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — StudyOS" },
      { name: "description", content: "Manage your AI API key for StudyOS." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const checkStatus = useServerFn(getAiKeyStatus);
  const save = useServerFn(saveAiKey);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkStatus().then((r) => setHasKey(r.hasKey)).catch(() => setHasKey(false));
  }, [checkStatus]);

  const onSave = async () => {
    if (!key.trim()) {
      toast.error("Enter your Anthropic API key");
      return;
    }
    setSaving(true);
    try {
      const r = await save({ data: { key: key.trim() } });
      setHasKey(r.hasKey);
      setKey("");
      toast.success("API key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save key");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    setSaving(true);
    try {
      await save({ data: { key: "" } });
      setHasKey(false);
      toast.success("API key removed");
    } catch {
      toast.error("Could not remove key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <Link
        to="/"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Home
      </Link>
      <PageTitle title="Settings" subtitle="Manage AI access for exam generation" />

      <Card className="soft-shadow border-none p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold text-foreground">Anthropic API key</div>
            <div className="text-xs text-muted-foreground">Powers AI exam features</div>
          </div>
        </div>

        {hasKey === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : hasKey ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm font-medium text-success">
            <ShieldCheck className="h-4 w-4" /> An API key is configured. AI features are enabled.
          </div>
        ) : (
          <div className="mb-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            AI features require an API key.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="apikey">
            {hasKey ? "Replace key" : "Enter key"}
          </Label>
          <Input
            id="apikey"
            type="password"
            placeholder="sk-ant-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button className="flex-1 rounded-full" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save key"}
          </Button>
          {hasKey && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={onRemove}
              disabled={saving}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Your key is stored privately and only used to power your own AI requests.
        </p>
      </Card>
    </AppShell>
  );
}
