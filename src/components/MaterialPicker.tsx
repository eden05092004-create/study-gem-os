import type { Topic } from "@/lib/store";
import { Checkbox } from "@/components/ui/checkbox";

export type MaterialSelection = {
  lectureIds: string[];
  fileIds: string[];
};

export const EMPTY_SELECTION: MaterialSelection = { lectureIds: [], fileIds: [] };

export function selectionIsEmpty(v: MaterialSelection) {
  return v.lectureIds.length === 0 && v.fileIds.length === 0;
}

/** Everything under a topic: every lecture id + every file id (lecture-tagged or not). */
function allIdsInTopic(topic: Topic): MaterialSelection {
  return {
    lectureIds: topic.lectures.map((l) => l.id),
    fileIds: topic.files.map((f) => f.id),
  };
}

/** A lecture's own id plus any files tagged to it. */
function idsForLecture(topic: Topic, lectureId: string): MaterialSelection {
  return {
    lectureIds: [lectureId],
    fileIds: topic.files.filter((f) => f.lectureId === lectureId).map((f) => f.id),
  };
}

function union(a: string[], b: string[]) {
  return Array.from(new Set([...a, ...b]));
}
function subtract(a: string[], b: string[]) {
  const remove = new Set(b);
  return a.filter((x) => !remove.has(x));
}

/**
 * Multi-select tree for scoping AI exam generation: course → topic ("folder") →
 * lecture / file. Checking a topic or lecture checks everything beneath it;
 * unchecking any child clears the ancestor back to an indeterminate state.
 */
export function MaterialPicker({
  topics,
  value,
  onChange,
}: {
  topics: Topic[];
  value: MaterialSelection;
  onChange: (v: MaterialSelection) => void;
}) {
  const setAll = (ids: MaterialSelection, checked: boolean) => {
    onChange(
      checked
        ? { lectureIds: union(value.lectureIds, ids.lectureIds), fileIds: union(value.fileIds, ids.fileIds) }
        : {
            lectureIds: subtract(value.lectureIds, ids.lectureIds),
            fileIds: subtract(value.fileIds, ids.fileIds),
          },
    );
  };

  const toggleFile = (fileId: string, checked: boolean) =>
    onChange({
      lectureIds: value.lectureIds,
      fileIds: checked ? union(value.fileIds, [fileId]) : subtract(value.fileIds, [fileId]),
    });

  const selectAllCourse = () => {
    const all = topics.reduce<MaterialSelection>(
      (acc, t) => {
        const ids = allIdsInTopic(t);
        return { lectureIds: union(acc.lectureIds, ids.lectureIds), fileIds: union(acc.fileIds, ids.fileIds) };
      },
      { lectureIds: [], fileIds: [] },
    );
    onChange(all);
  };

  const clearAll = () => onChange(EMPTY_SELECTION);

  if (topics.every((t) => t.lectures.length === 0 && t.files.length === 0)) {
    return (
      <p className="text-sm text-muted-foreground">
        No lectures or files in this course yet — add some first, or generate from the whole course
        with no material selected (the AI will rely on general knowledge only).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          {value.lectureIds.length + value.fileIds.length} item(s) selected
        </span>
        <div className="flex gap-2">
          <button onClick={selectAllCourse} className="text-xs font-medium text-primary underline underline-offset-2">
            Select entire course
          </button>
          <button
            onClick={clearAll}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border p-3">
        {topics.map((topic) => {
          const topicIds = allIdsInTopic(topic);
          const topicTotal = topicIds.lectureIds.length + topicIds.fileIds.length;
          const topicSelectedCount =
            topicIds.lectureIds.filter((id) => value.lectureIds.includes(id)).length +
            topicIds.fileIds.filter((id) => value.fileIds.includes(id)).length;
          const topicChecked =
            topicTotal > 0 && topicSelectedCount === topicTotal
              ? true
              : topicSelectedCount > 0
                ? "indeterminate"
                : false;

          const unassignedFiles = topic.files.filter((f) => !f.lectureId);

          return (
            <div key={topic.id}>
              <label className="mb-1.5 flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={topicChecked}
                  onCheckedChange={(v) => setAll(topicIds, !!v)}
                  disabled={topicTotal === 0}
                />
                <span className="text-xs font-bold text-muted-foreground">{topic.name}</span>
              </label>

              <div className="space-y-1 pl-6">
                {topic.lectures.map((lecture) => {
                  const lectureIds = idsForLecture(topic, lecture.id);
                  const lectureTotal = 1 + lectureIds.fileIds.length;
                  const lectureSelectedCount =
                    (value.lectureIds.includes(lecture.id) ? 1 : 0) +
                    lectureIds.fileIds.filter((id) => value.fileIds.includes(id)).length;
                  const lectureChecked =
                    lectureSelectedCount === lectureTotal ? true : lectureSelectedCount > 0 ? "indeterminate" : false;
                  const lectureFiles = topic.files.filter((f) => f.lectureId === lecture.id);

                  return (
                    <div key={lecture.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-1.5">
                        <Checkbox checked={lectureChecked} onCheckedChange={(v) => setAll(lectureIds, !!v)} />
                        <span className="text-sm text-foreground">
                          {lecture.number && <span className="font-mono font-semibold">{lecture.number}</span>}{" "}
                          {lecture.name}
                        </span>
                      </label>
                      {lectureFiles.length > 0 && (
                        <div className="space-y-1 py-1 pl-7">
                          {lectureFiles.map((f) => (
                            <label
                              key={f.id}
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1 text-xs text-muted-foreground"
                            >
                              <Checkbox
                                checked={value.fileIds.includes(f.id)}
                                onCheckedChange={(v) => toggleFile(f.id, !!v)}
                              />
                              {f.name}
                              {!f.storagePath && (
                                <span className="italic text-muted-foreground/70">(no content saved)</span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {unassignedFiles.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-1.5 text-sm text-foreground"
                  >
                    <Checkbox checked={value.fileIds.includes(f.id)} onCheckedChange={(v) => toggleFile(f.id, !!v)} />
                    {f.name}
                    {!f.storagePath && (
                      <span className="text-xs italic text-muted-foreground/70">(no content saved)</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
