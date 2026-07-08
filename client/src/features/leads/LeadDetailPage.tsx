import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarPlus,
  FileText,
  Mail,
  MessageCircle,
  Paperclip,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatINR, formatDate, formatDateTime, timeAgo, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  ErrorState,
  Input,
  Label,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui/primitives";
import { LeadForm, toPayload } from "./LeadForm";
import { useUsersList } from "@/lib/lookups";
import type { LeadDetail } from "@/lib/types";

const ACTIVITY_ICON: Record<string, string> = {
  CALL: "📞", WHATSAPP: "💬", EMAIL: "✉️", NOTE: "📝", CREATED: "✨",
  STATUS_CHANGE: "🔁", STAGE_CHANGE: "📊", ASSIGNED: "👤", SITE_VISIT: "📍",
  DOCUMENT: "📄", FOLLOWUP: "⏰", BOOKING: "🏠", IMPORT: "📥",
};

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can, user } = useAuth();
  const { data: users } = useUsersList();

  const [tab, setTab] = useState("timeline");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [interactionOpen, setInteractionOpen] = useState<"CALL" | "WHATSAPP" | "EMAIL" | null>(null);
  const [interactionText, setInteractionText] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [fu, setFu] = useState({ dueAt: "", repeat: "NONE", notes: "", assignedToId: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["lead", id] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const { data: lead, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => (await api.get<ApiResponse<LeadDetail>>(`/leads/${id}`)).data.data,
    enabled: !!id,
  });

  const update = useMutation({
    mutationFn: async (payload: Partial<ReturnType<typeof toPayload>>) =>
      (await api.patch(`/leads/${id}`, payload)).data,
    onSuccess: () => {
      invalidate();
      setEditOpen(false);
      toast.success("Lead updated");
    },
    onError: (err) => toast.error("Update failed", errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/leads/${id}`)).data,
    onSuccess: () => {
      toast.success("Lead deleted");
      navigate("/leads");
    },
    onError: (err) => toast.error("Delete failed", errorMessage(err)),
  });

  const addNote = useMutation({
    mutationFn: async () => (await api.post(`/leads/${id}/notes`, { body: noteText })).data,
    onSuccess: () => {
      setNoteText("");
      invalidate();
      toast.success("Note added");
    },
    onError: (err) => toast.error("Could not add note", errorMessage(err)),
  });

  const logInteraction = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/leads/${id}/interactions`, {
          type: interactionOpen,
          title: interactionText,
        })
      ).data,
    onSuccess: () => {
      setInteractionOpen(null);
      setInteractionText("");
      invalidate();
      toast.success("Interaction logged");
    },
    onError: (err) => toast.error("Could not log interaction", errorMessage(err)),
  });

  const addFollowUp = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/leads/${id}/followups`, {
          dueAt: new Date(fu.dueAt).toISOString(),
          repeat: fu.repeat,
          notes: fu.notes || undefined,
          assignedToId: fu.assignedToId || undefined,
        })
      ).data,
    onSuccess: () => {
      setFollowUpOpen(false);
      setFu({ dueAt: "", repeat: "NONE", notes: "", assignedToId: "" });
      invalidate();
      toast.success("Follow-up scheduled");
    },
    onError: (err) => toast.error("Could not schedule", errorMessage(err)),
  });

  const completeFollowUp = useMutation({
    mutationFn: async (followUpId: string) =>
      (await api.patch(`/leads/${id}/followups/${followUpId}`, { status: "DONE" })).data,
    onSuccess: () => {
      invalidate();
      toast.success("Follow-up completed");
    },
    onError: (err) => toast.error("Failed", errorMessage(err)),
  });

  /**
   * Opens the real channel (dialer / WhatsApp / mail app) and then shows the
   * log dialog so the interaction lands on the lead timeline.
   */
  const launchInteraction = (type: "CALL" | "WHATSAPP" | "EMAIL") => {
    if (!lead) return;
    if (type === "CALL") {
      window.open(`tel:+91${lead.mobile}`, "_self");
    } else if (type === "WHATSAPP") {
      const text = `Namaste ${lead.name} ji! ${user?.name ?? "Hum"} from Vrindavan Spaces — aapki property enquiry ke regarding baat karni thi.`;
      window.open(
        `https://wa.me/91${lead.mobile}?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener"
      );
    } else {
      if (!lead.email) {
        toast.error("No email on this lead", "Add an email address via Edit first.");
        return;
      }
      window.open(
        `mailto:${lead.email}?subject=${encodeURIComponent("Regarding your property enquiry — Vrindavan Spaces")}`,
        "_self"
      );
    }
    setInteractionOpen(type);
  };

  const uploadDoc = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("leadId", id!);
    try {
      await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
      invalidate();
      toast.success("Document uploaded");
    } catch (err) {
      toast.error("Upload failed", errorMessage(err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  if (isLoading || !lead) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const pendingFollowUps = lead.followUps.filter((f) => f.status === "PENDING");

  return (
    <div className="animate-fade-in">
      <Link
        to="/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All leads
      </Link>

      {/* Header card */}
      <Card className="mb-4">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={lead.name} size={52} />
              <div>
                <h1 className="text-xl font-bold">{lead.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {lead.mobile}
                  {lead.email && ` · ${lead.email}`}
                  {lead.city && ` · ${lead.city}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge color={lead.status.color}>{lead.status.name}</Badge>
                  <Badge color={lead.source.color}>{lead.source.name}</Badge>
                  {lead.stage && <Badge color={lead.stage.color}>Stage: {lead.stage.name}</Badge>}
                  {lead.propertyType && <Badge>{lead.propertyType}</Badge>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {can("leads", "update") && (
                <>
                  <Button variant="outline" size="sm" onClick={() => launchInteraction("CALL")}>
                    <Phone className="h-4 w-4" /> Call
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => launchInteraction("WHATSAPP")}>
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => launchInteraction("EMAIL")}
                    disabled={!lead.email}
                    title={lead.email ? `Email ${lead.email}` : "No email on this lead"}
                  >
                    <Mail className="h-4 w-4" /> Email
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </>
              )}
              {can("leads", "delete") && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Budget</dt>
              <dd className="mt-0.5 font-medium">
                {lead.budget ? formatINR(lead.budget) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Property Size</dt>
              <dd className="mt-0.5 font-medium">{lead.propertySize ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Project</dt>
              <dd className="mt-0.5 font-medium">{lead.project?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Assigned To</dt>
              <dd className="mt-0.5 font-medium">{lead.assignedTo?.name ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Created</dt>
              <dd className="mt-0.5 font-medium">
                {formatDate(lead.createdAt)}
                {lead.createdBy && ` by ${lead.createdBy.name}`}
              </dd>
            </div>
          </dl>
          {lead.requirement && (
            <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
              {lead.requirement}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: tabs */}
        <div className="lg:col-span-2">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "timeline", label: "Timeline", count: lead.activities.length },
              { key: "notes", label: "Notes", count: lead.notes.length },
              { key: "documents", label: "Documents", count: lead.documents.length },
              { key: "visits", label: "Site Visits", count: lead.siteVisits.length },
              { key: "bookings", label: "Bookings", count: lead.bookings.length },
            ]}
          />

          {tab === "timeline" && (
            <Card>
              <CardContent className="pt-5">
                {lead.activities.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ol className="relative space-y-4 border-l pl-5">
                    {lead.activities.map((a) => (
                      <li key={a.id} className="relative">
                        <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-card text-xs ring-2 ring-border">
                          {ACTIVITY_ICON[a.type] ?? "•"}
                        </span>
                        <p className="text-sm font-medium">{a.title}</p>
                        {a.description && (
                          <p className="text-sm text-muted-foreground">{a.description}</p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "notes" && (
            <Card>
              <CardContent className="pt-5">
                {can("leads", "update") && (
                  <div className="mb-4 flex gap-2">
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Write a note…"
                      rows={2}
                      aria-label="New note"
                    />
                    <Button
                      onClick={() => addNote.mutate()}
                      disabled={!noteText.trim()}
                      loading={addNote.isPending}
                    >
                      Add
                    </Button>
                  </div>
                )}
                {lead.notes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  <div className="space-y-3">
                    {lead.notes.map((n) => (
                      <div key={n.id} className="rounded-xl bg-muted p-3">
                        <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {n.user.name} · {timeAgo(n.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "documents" && (
            <Card>
              <CardContent className="pt-5">
                {can("files", "create") && (
                  <div className="mb-4">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0])}
                    />
                    <Button variant="outline" onClick={() => fileRef.current?.click()}>
                      <Paperclip className="h-4 w-4" /> Upload document
                    </Button>
                  </div>
                )}
                {lead.documents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No documents uploaded.</p>
                ) : (
                  <div className="space-y-2">
                    {lead.documents.map((d) => (
                      <a
                        key={d.id}
                        href={d.file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted"
                      >
                        <FileText className="h-5 w-5 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.title ?? d.file.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {(d.file.size / 1024).toFixed(0)} KB · {formatDate(d.createdAt)}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "visits" && (
            <Card>
              <CardContent className="pt-5">
                {lead.siteVisits.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No site visits scheduled. Use the Site Visits page to plan one.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lead.siteVisits.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                        <div>
                          <p className="text-sm font-medium">
                            {v.property?.title ?? "General visit"} · {formatDateTime(v.scheduledAt)}
                          </p>
                          <p className="text-xs text-muted-foreground">With {v.assignedTo.name}</p>
                        </div>
                        <Badge
                          color={
                            v.status === "COMPLETED" ? "#10B981" : v.status === "CANCELLED" ? "#EF4444" : "#3B82F6"
                          }
                        >
                          {v.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "bookings" && (
            <Card>
              <CardContent className="pt-5">
                {lead.bookings.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No bookings for this lead.</p>
                ) : (
                  <div className="space-y-2">
                    {lead.bookings.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                        <div>
                          <p className="text-sm font-medium">{b.property.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(b.bookingDate)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{formatINR(b.amount)}</p>
                          <Badge color={b.status === "CANCELLED" ? "#EF4444" : "#10B981"}>{b.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: follow-ups */}
        <div>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Follow-ups</CardTitle>
              {can("leads", "update") && (
                <Button size="sm" variant="outline" onClick={() => setFollowUpOpen(true)}>
                  <CalendarPlus className="h-4 w-4" /> Schedule
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {lead.followUps.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No follow-ups scheduled.</p>
              ) : (
                lead.followUps.map((f) => {
                  const overdue = f.status === "PENDING" && new Date(f.dueAt) < new Date();
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "rounded-xl border p-3",
                        overdue && "border-destructive/40 bg-destructive/5",
                        f.status === "DONE" && "opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{formatDateTime(f.dueAt)}</p>
                        <Badge
                          color={overdue ? "#EF4444" : f.status === "DONE" ? "#10B981" : "#F59E0B"}
                        >
                          {overdue ? "OVERDUE" : f.status}
                        </Badge>
                      </div>
                      {f.notes && <p className="mt-1 text-sm text-muted-foreground">{f.notes}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {f.assignedTo.name}
                        {f.repeat !== "NONE" && ` · repeats ${f.repeat.toLowerCase()}`}
                      </p>
                      {f.status === "PENDING" && can("leads", "update") && (
                        <Button
                          size="sm"
                          variant="success"
                          className="mt-2 w-full"
                          onClick={() => completeFollowUp.mutate(f.id)}
                          loading={completeFollowUp.isPending}
                        >
                          Mark done
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {pendingFollowUps.length > 0 && (
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              {pendingFollowUps.length} pending follow-up{pendingFollowUps.length > 1 ? "s" : ""} for this lead.
            </p>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit Lead" wide>
        <LeadForm
          initial={lead}
          onSubmit={(p) => update.mutate(p)}
          submitting={update.isPending}
          submitLabel="Save Changes"
        />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${lead.name}?`}
        description="The lead is soft-deleted; its history stays in the audit log."
      />

      <Dialog
        open={!!interactionOpen}
        onClose={() => setInteractionOpen(null)}
        title={`Log ${interactionOpen === "CALL" ? "Call" : interactionOpen === "WHATSAPP" ? "WhatsApp" : "Email"}`}
        description="Recorded on the lead timeline"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="interaction-summary">Summary *</Label>
            <Textarea
              id="interaction-summary"
              value={interactionText}
              onChange={(e) => setInteractionText(e.target.value)}
              placeholder="e.g. Discussed pricing, wants visit on Sunday"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInteractionOpen(null)}>Cancel</Button>
            <Button
              disabled={!interactionText.trim()}
              loading={logInteraction.isPending}
              onClick={() => logInteraction.mutate()}
            >
              Log
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={followUpOpen} onClose={() => setFollowUpOpen(false)} title="Schedule Follow-up">
        <div className="space-y-4">
          <div>
            <Label htmlFor="fu-due">When *</Label>
            <Input
              id="fu-due"
              type="datetime-local"
              value={fu.dueAt}
              onChange={(e) => setFu((s) => ({ ...s, dueAt: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="fu-repeat">Repeat</Label>
            <Select
              id="fu-repeat"
              value={fu.repeat}
              onChange={(e) => setFu((s) => ({ ...s, repeat: e.target.value }))}
            >
              <option value="NONE">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="fu-assignee">Assign to</Label>
            <Select
              id="fu-assignee"
              value={fu.assignedToId}
              onChange={(e) => setFu((s) => ({ ...s, assignedToId: e.target.value }))}
            >
              <option value="">Me ({user?.name})</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="fu-notes">Notes</Label>
            <Textarea
              id="fu-notes"
              rows={2}
              value={fu.notes}
              onChange={(e) => setFu((s) => ({ ...s, notes: e.target.value }))}
              placeholder="What to discuss"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>Cancel</Button>
            <Button disabled={!fu.dueAt} loading={addFollowUp.isPending} onClick={() => addFollowUp.mutate()}>
              Schedule
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
