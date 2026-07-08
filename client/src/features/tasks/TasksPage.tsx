import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Search, X } from "lucide-react";
import { api, ApiResponse, errorMessage, Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsersList } from "@/lib/lookups";
import { cn, formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui/primitives";
import type { Task } from "@/lib/types";

const PRIORITY_COLOR: Record<Task["priority"], string> = {
  LOW: "#64748B",
  MEDIUM: "#3B82F6",
  HIGH: "#F97316",
  URGENT: "#EF4444",
};

export default function TasksPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const { data: users } = useUsersList();

  const [tab, setTab] = useState("mine");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [comment, setComment] = useState("");

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      mine: tab === "mine" ? true : undefined,
      overdue: tab === "overdue" ? true : undefined,
      status: status || undefined,
      priority: priority || undefined,
      search: search || undefined,
      sortBy: "dueAt",
      sortOrder: "asc" as const,
    }),
    [page, tab, status, priority, search]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", params],
    queryFn: async () =>
      (await api.get<ApiResponse<Paginated<Task>>>("/tasks", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const updateTask = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await api.patch<ApiResponse<Task>>(`/tasks/${id}`, body)).data.data,
    onSuccess: (updated) => {
      invalidate();
      setDetail((d) => (d && d.id === updated.id ? updated : d));
    },
    onError: (err) => toast.error("Update failed", errorMessage(err)),
  });

  const removeTask = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/tasks/${id}`)).data,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      setDetail(null);
      toast.success("Task deleted");
    },
    onError: (err) => toast.error("Delete failed", errorMessage(err)),
  });

  const addComment = useMutation({
    mutationFn: async (id: string) =>
      (
        await api.post<ApiResponse<{ id: string; body: string; createdAt: string; user: { id: string; name: string } }>>(
          `/tasks/${id}/comments`,
          { body: comment }
        )
      ).data.data,
    onSuccess: (newComment) => {
      setComment("");
      invalidate();
      setDetail((d) => (d ? { ...d, comments: [...(d.comments ?? []), newComment] } : d));
      toast.success("Comment added");
    },
    onError: (err) => toast.error("Could not comment", errorMessage(err)),
  });

  const toggleChecklistItem = (task: Task, index: number) => {
    const list = [...(task.checklist ?? [])];
    list[index] = { ...list[index], done: !list[index].done };
    updateTask.mutate({ id: task.id, body: { checklist: list } });
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Tasks"
        description={data ? `${data.meta.total} tasks` : undefined}
        actions={
          can("tasks", "create") && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> New Task
            </Button>
          )
        }
      />

      <Tabs
        tabs={[
          { key: "mine", label: "My Tasks" },
          { key: "all", label: "All Tasks" },
          { key: "overdue", label: "Overdue" },
        ]}
        active={tab}
        onChange={(t) => { setTab(t); setPage(1); }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setSearch(searchInput.trim()), setPage(1))}
            placeholder="Search tasks…"
            className="pl-9"
            aria-label="Search tasks"
          />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="DONE">Done</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="w-40" aria-label="Filter by priority">
          <option value="">All priorities</option>
          {Object.keys(PRIORITY_COLOR).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        {(status || priority || search) && (
          <Button variant="ghost" onClick={() => { setStatus(""); setPriority(""); setSearch(""); setSearchInput(""); setPage(1); }}>
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : data!.items.length === 0 ? (
        <EmptyState
          icon={<CheckSquare />}
          title="No tasks here"
          description={tab === "overdue" ? "Nothing overdue — great job!" : "Create a task to get started."}
        />
      ) : (
        <div className="space-y-3">
          {data!.items.map((t) => {
            const overdue =
              t.dueAt && new Date(t.dueAt) < new Date() && (t.status === "TODO" || t.status === "IN_PROGRESS");
            const done = t.status === "DONE";
            const checklistDone = t.checklist?.filter((c) => c.done).length ?? 0;
            return (
              <Card
                key={t.id}
                className={cn(
                  "flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-muted/40",
                  overdue && "border-destructive/40"
                )}
                onClick={() => setDetail(t)}
              >
                <input
                  type="checkbox"
                  aria-label={`Mark "${t.title}" as done`}
                  checked={done}
                  disabled={!can("tasks", "update")}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() =>
                    updateTask.mutate({ id: t.id, body: { status: done ? "TODO" : "DONE" } })
                  }
                  className="h-5 w-5 shrink-0 cursor-pointer accent-[hsl(var(--primary))]"
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-semibold", done && "text-muted-foreground line-through")}>
                    {t.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {t.dueAt && (
                      <span className={cn(overdue && "font-semibold text-destructive")}>
                        Due {formatDateTime(t.dueAt)}
                      </span>
                    )}
                    {t.lead && <span>Lead: {t.lead.name}</span>}
                    {t.repeat !== "NONE" && <span>↻ {t.repeat.toLowerCase()}</span>}
                    {t.checklist && t.checklist.length > 0 && (
                      <span>☑ {checklistDone}/{t.checklist.length}</span>
                    )}
                  </p>
                </div>
                <Badge color={PRIORITY_COLOR[t.priority]}>{t.priority}</Badge>
                {t.assignedTo && (
                  <span title={t.assignedTo.name}>
                    <Avatar name={t.assignedTo.name} src={t.assignedTo.avatarUrl} size={28} />
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground">{page} / {data.meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      <TaskFormDialog open={formOpen} onClose={() => setFormOpen(false)} users={users ?? []} defaultAssignee={user?.id} />

      {/* Task detail */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? ""} wide>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge color={PRIORITY_COLOR[detail.priority]}>{detail.priority}</Badge>
              <Badge>{detail.status.replace("_", " ")}</Badge>
              {detail.dueAt && <Badge>Due {formatDateTime(detail.dueAt)}</Badge>}
              {detail.repeat !== "NONE" && <Badge>Repeats {detail.repeat.toLowerCase()}</Badge>}
            </div>
            {detail.description && (
              <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{detail.description}</p>
            )}

            {detail.checklist && detail.checklist.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Checklist</p>
                <div className="space-y-1.5">
                  {detail.checklist.map((item, i) => (
                    <label key={i} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={!can("tasks", "update")}
                        onChange={() => {
                          toggleChecklistItem(detail, i);
                          setDetail((d) =>
                            d
                              ? {
                                  ...d,
                                  checklist: d.checklist!.map((c, j) =>
                                    j === i ? { ...c, done: !c.done } : c
                                  ),
                                }
                              : d
                          );
                        }}
                        className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))]"
                      />
                      <span className={cn(item.done && "text-muted-foreground line-through")}>{item.text}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">Comments</p>
              <div className="space-y-2">
                {(detail.comments ?? []).map((c) => (
                  <div key={c.id} className="rounded-xl bg-muted p-2.5">
                    <p className="text-sm">{c.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.user.name} · {formatDateTime(c.createdAt)}
                    </p>
                  </div>
                ))}
                {can("tasks", "update") && (
                  <div className="flex gap-2">
                    <Input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment…"
                      aria-label="New comment"
                      onKeyDown={(e) =>
                        e.key === "Enter" && comment.trim() && addComment.mutate(detail.id)
                      }
                    />
                    <Button
                      disabled={!comment.trim()}
                      loading={addComment.isPending}
                      onClick={() => addComment.mutate(detail.id)}
                    >
                      Post
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between border-t pt-4">
              {can("tasks", "delete") ? (
                <Button variant="destructive" size="sm" onClick={() => setDeleting(detail)}>
                  Delete Task
                </Button>
              ) : (
                <span />
              )}
              {can("tasks", "update") && detail.status !== "DONE" && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => {
                    updateTask.mutate({ id: detail.id, body: { status: "DONE" } });
                    setDetail(null);
                  }}
                >
                  Mark Done
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeTask.mutate(deleting.id)}
        loading={removeTask.isPending}
        title={`Delete "${deleting?.title}"?`}
      />
    </div>
  );
}

function TaskFormDialog({
  open,
  onClose,
  users,
  defaultAssignee,
}: {
  open: boolean;
  onClose: () => void;
  users: Array<{ id: string; name: string }>;
  defaultAssignee?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueAt, setDueAt] = useState("");
  const [repeat, setRepeat] = useState("NONE");
  const [checklistText, setChecklistText] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/tasks", {
          title: title.trim(),
          description: description.trim() || null,
          assignedToId: assignedToId || defaultAssignee || null,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          repeat,
          checklist: checklistText.trim()
            ? checklistText
                .split("\n")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((text) => ({ text, done: false }))
            : null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
      setTitle("");
      setDescription("");
      setDueAt("");
      setChecklistText("");
      toast.success("Task created");
    },
    onError: (err) => toast.error("Could not create task", errorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title="New Task">
      <div className="space-y-4">
        <div>
          <Label htmlFor="t-title">Title *</Label>
          <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call back interested lead" />
        </div>
        <div>
          <Label htmlFor="t-desc">Description</Label>
          <Textarea id="t-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="t-assignee">Assign To</Label>
            <Select id="t-assignee" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Myself</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-priority">Priority</Label>
            <Select id="t-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.keys(PRIORITY_COLOR).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-due">Due</Label>
            <Input id="t-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="t-repeat">Repeat</Label>
            <Select id="t-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="NONE">Never</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="t-checklist">Checklist (one item per line)</Label>
          <Textarea
            id="t-checklist"
            rows={3}
            value={checklistText}
            onChange={(e) => setChecklistText(e.target.value)}
            placeholder={"Review lead history\nMake the call\nUpdate status"}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            Create Task
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
