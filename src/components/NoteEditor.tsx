import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useStore, type NoteSection } from "@/lib/store";

const SECTION_PRESETS: { icon: string; title: string }[] = [
  { icon: "📘", title: "Overview" },
  { icon: "📖", title: "Full Content" },
  { icon: "📊", title: "Comparison Tables" },
  { icon: "⭐", title: "High Yield" },
  { icon: "🏥", title: "Clinical Correlations" },
  { icon: "⚠️", title: "Common Mistakes" },
  { icon: "🔍", title: "Small Details" },
];

function makeKey() {
  return `sec-${Math.random().toString(36).slice(2, 9)}`;
}

type EditorSection = NoteSection & { key: string };

export function NoteEditor({
  courseId,
  topicId,
  noteId,
  initialTitle = "",
  initialSections,
}: {
  courseId: string;
  topicId: string;
  noteId?: string;
  initialTitle?: string;
  initialSections?: NoteSection[];
}) {
  const navigate = useNavigate();
  const addNote = useStore((s) => s.addNote);
  const updateNote = useStore((s) => s.updateNote);

  const [title, setTitle] = useState(initialTitle);
  const [sections, setSections] = useState<EditorSection[]>(
    initialSections && initialSections.length
      ? initialSections.map((s) => ({ ...s, key: s.key || makeKey() }))
      : [{ key: makeKey(), icon: "📝", title: "Notes", body: "" }],
  );
  const [saving, setSaving] = useState(false);

  const updateSection = (key: string, patch: Partial<EditorSection>) =>
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const addSection = (preset?: { icon: string; title: string }) =>
    setSections((prev) => [
      ...prev,
      { key: makeKey(), icon: preset?.icon ?? "📝", title: preset?.title ?? "New section", body: "" },
    ]);

  const removeSection = (key: string) =>
    setSections((prev) => prev.filter((s) => s.key !== key));

  const onSave = async () => {
    if (!title.trim()) {
      toast.error("Give your note a title");
      return;
    }
    const cleaned = sections
      .map((s) => ({ key: s.key, icon: s.icon, title: s.title.trim() || "Untitled", body: s.body }))
      .filter((s) => s.body.trim() || s.title.trim());
    if (!cleaned.length) {
      toast.error("Write some content first");
      return;
    }
    setSaving(true);
    try {
      if (noteId) {
        await updateNote(courseId, topicId, noteId, title.trim(), cleaned);
        toast.success("Note saved");
        navigate({
          to: "/notes/$courseId/$topicId/$noteId",
          params: { courseId, topicId, noteId },
        });
      } else {
        const newId = await addNote(courseId, topicId, title.trim(), cleaned);
        toast.success("Note created");
        if (newId) {
          navigate({
            to: "/notes/$courseId/$topicId/$noteId",
            params: { courseId, topicId, noteId: newId },
          });
        } else {
          navigate({ to: "/courses/$courseId/$topicId", params: { courseId, topicId } });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-none p-5">
        <Label className="mb-2 block">Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Glycolysis — my notes"
        />
      </Card>

      {sections.map((sec) => (
        <Card key={sec.key} className="border-none p-5">
          <div className="mb-3 flex items-center gap-2">
            <Input
              value={sec.icon}
              onChange={(e) => updateSection(sec.key, { icon: e.target.value })}
              className="w-14 text-center"
              maxLength={2}
            />
            <Input
              value={sec.title}
              onChange={(e) => updateSection(sec.key, { title: e.target.value })}
              placeholder="Section title"
              className="flex-1 font-semibold"
            />
            {sections.length > 1 && (
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 text-muted-foreground"
                onClick={() => removeSection(sec.key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Textarea
            value={sec.body}
            onChange={(e) => updateSection(sec.key, { body: e.target.value })}
            placeholder="Write your notes here…"
            className="min-h-[140px]"
          />
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-full" onClick={() => addSection()}>
          <Plus className="h-4 w-4" /> Add section
        </Button>
        {SECTION_PRESETS.map((p) => (
          <Button
            key={p.title}
            variant="outline"
            size="sm"
            className="rounded-full text-xs"
            onClick={() => addSection(p)}
          >
            {p.icon} {p.title}
          </Button>
        ))}
      </div>

      <Button className="w-full rounded-full" onClick={onSave} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Save className="h-4 w-4" /> {noteId ? "Save changes" : "Create note"}
          </>
        )}
      </Button>
    </div>
  );
}
