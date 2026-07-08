import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, MapPin, Search, X } from "lucide-react";
import { api, ApiResponse, errorMessage, Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useProjectsList, useUsersList } from "@/lib/lookups";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/ui/data-table";
import { CreatableSelect } from "@/components/ui/creatable-select";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import type { Lead, SiteVisit } from "@/lib/types";

const STATUS_COLOR: Record<SiteVisit["status"], string> = {
  SCHEDULED: "#3B82F6",
  COMPLETED: "#10B981",
  CANCELLED: "#EF4444",
  RESCHEDULED: "#F59E0B",
};

export default function SiteVisitsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: users } = useUsersList();
  const { data: projects } = useProjectsList();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<SiteVisit | null>(null);
  const [feedback, setFeedback] = useState("");

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      status: status || undefined,
      assignedToId: assignedToId || undefined,
      search: search || undefined,
    }),
    [page, status, assignedToId, search]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["site-visits", params],
    queryFn: async () =>
      (await api.get<ApiResponse<Paginated<SiteVisit>>>("/site-visits", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["site-visits"] });

  const updateVisit = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await api.patch(`/site-visits/${id}`, body)).data,
    onSuccess: () => {
      invalidate();
      setFeedbackFor(null);
      setFeedback("");
      toast.success("Site visit updated");
    },
    onError: (err) => toast.error("Update failed", errorMessage(err)),
  });

  const checkIn = useMutation({
    mutationFn: async (id: string) => {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );
      return (
        await api.post(`/site-visits/${id}/check-in`, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      ).data;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Checked in at site", "GPS location recorded");
    },
    onError: (err) =>
      toast.error(
        "Check-in failed",
        err instanceof GeolocationPositionError
          ? "Allow location access in your browser to check in."
          : errorMessage(err)
      ),
  });

  const columns: Column<SiteVisit>[] = [
    {
      key: "lead",
      header: "Lead",
      render: (v) => (
        <Link to={`/leads/${v.lead.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
          <p className="font-medium text-primary">{v.lead.name}</p>
          <p className="text-xs text-muted-foreground">{v.lead.mobile}</p>
        </Link>
      ),
    },
    {
      key: "property",
      header: "Property / Project",
      className: "hidden md:table-cell",
      render: (v) => (
        <span className="text-sm">
          {v.property?.title ?? v.project?.name ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: "scheduledAt",
      header: "Scheduled",
      render: (v) => <span className="text-sm">{formatDateTime(v.scheduledAt)}</span>,
    },
    {
      key: "assignedTo",
      header: "Executive",
      className: "hidden sm:table-cell",
      render: (v) => (
        <span className="flex items-center gap-2">
          <Avatar name={v.assignedTo.name} src={v.assignedTo.avatarUrl} size={24} />
          <span className="text-sm">{v.assignedTo.name}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (v) => (
        <div className="flex items-center gap-1.5">
          <Badge color={STATUS_COLOR[v.status]}>{v.status}</Badge>
          {v.checkInAt && (
            <span title={`Checked in ${formatDateTime(v.checkInAt)}`}>
              <MapPin className="h-3.5 w-3.5 text-success" aria-label="GPS checked in" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (v) =>
        can("siteVisits", "update") && v.status === "SCHEDULED" ? (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {!v.checkInAt && (
              <Button size="sm" variant="outline" onClick={() => checkIn.mutate(v.id)}>
                <MapPin className="h-3.5 w-3.5" /> Check-in
              </Button>
            )}
            <Button size="sm" variant="success" onClick={() => { setFeedbackFor(v); setFeedback(""); }}>
              Complete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateVisit.mutate({ id: v.id, body: { status: "CANCELLED" } })}
            >
              Cancel
            </Button>
          </div>
        ) : v.feedback ? (
          <p className="max-w-[180px] truncate text-xs text-muted-foreground" title={v.feedback}>
            “{v.feedback}”
          </p>
        ) : null,
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Site Visits"
        description={data ? `${data.meta.total} visits` : undefined}
        actions={
          can("siteVisits", "create") && (
            <Button onClick={() => setScheduleOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> Schedule Visit
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setSearch(searchInput.trim()), setPage(1))}
            placeholder="Search lead name or mobile…"
            className="pl-9"
            aria-label="Search site visits"
          />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44" aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLOR).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={assignedToId} onChange={(e) => { setAssignedToId(e.target.value); setPage(1); }} className="w-48" aria-label="Filter by executive">
          <option value="">All executives</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
        {(status || assignedToId || search) && (
          <Button variant="ghost" onClick={() => { setStatus(""); setAssignedToId(""); setSearch(""); setSearchInput(""); setPage(1); }}>
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(v) => v.id}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle="No site visits"
        emptyDescription="Schedule a visit to get customers on site."
      />

      <ScheduleVisitDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        users={users ?? []}
        projects={projects ?? []}
      />

      <Dialog
        open={!!feedbackFor}
        onClose={() => setFeedbackFor(null)}
        title="Complete Site Visit"
        description={feedbackFor ? `${feedbackFor.lead.name} — capture customer feedback` : undefined}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="sv-feedback">Customer Feedback</Label>
            <Textarea
              id="sv-feedback"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Liked the corner plot, wants price negotiation…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFeedbackFor(null)}>Cancel</Button>
            <Button
              variant="success"
              loading={updateVisit.isPending}
              onClick={() =>
                feedbackFor &&
                updateVisit.mutate({
                  id: feedbackFor.id,
                  body: { status: "COMPLETED", feedback: feedback.trim() || undefined },
                })
              }
            >
              Mark Completed
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ScheduleVisitDialog({
  open,
  onClose,
  users,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  users: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [leadSearch, setLeadSearch] = useState("");
  const [leadId, setLeadId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [remarks, setRemarks] = useState("");

  // Server-side lead lookup for the picker.
  const { data: leadOptions } = useQuery({
    queryKey: ["visit-lead-search", leadSearch],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Paginated<Lead>>>("/leads", {
          params: { search: leadSearch, limit: 8 },
        })
      ).data.data.items,
    enabled: open && leadSearch.length >= 2,
  });

  const schedule = useMutation({
    mutationFn: async () =>
      (
        await api.post("/site-visits", {
          leadId,
          assignedToId,
          projectId: projectId || null,
          scheduledAt: new Date(scheduledAt).toISOString(),
          remarks: remarks.trim() || null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-visits"] });
      onClose();
      setLeadId("");
      setLeadSearch("");
      setScheduledAt("");
      setRemarks("");
      toast.success("Site visit scheduled");
    },
    onError: (err) => toast.error("Could not schedule", errorMessage(err)),
  });

  const selectedLead = leadOptions?.find((l) => l.id === leadId);

  return (
    <Dialog open={open} onClose={onClose} title="Schedule Site Visit">
      <div className="space-y-4">
        <div>
          <Label htmlFor="sv-lead">Lead *</Label>
          {selectedLead ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted px-3 py-2">
              <span className="text-sm font-medium">
                {selectedLead.name} · {selectedLead.mobile}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setLeadId("")}>
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                id="sv-lead"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Type name or mobile to search…"
              />
              {leadSearch.length >= 2 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border">
                  {(leadOptions ?? []).length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No matching leads</p>
                  ) : (
                    leadOptions!.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setLeadId(l.id)}
                        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      >
                        <span>{l.name}</span>
                        <span className="text-xs text-muted-foreground">{l.mobile}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sv-exec">Executive *</Label>
            <Select id="sv-exec" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Choose…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sv-project">Project</Label>
            <CreatableSelect
              id="sv-project"
              value={projectId}
              onChange={setProjectId}
              options={projects}
              placeholder="None"
              entityLabel="project"
              canCreate={can("properties", "create")}
              onCreate={async (name) => {
                const res = await api.post<ApiResponse<{ id: string; name: string }>>("/projects", { name });
                await queryClient.invalidateQueries({ queryKey: ["projects-list"] });
                return res.data.data;
              }}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="sv-when">Date & Time *</Label>
          <Input id="sv-when" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sv-remarks">Remarks</Label>
          <Textarea id="sv-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Cab arranged, bring brochure…" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!leadId || !assignedToId || !scheduledAt}
            loading={schedule.isPending}
            onClick={() => schedule.mutate()}
          >
            Schedule
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
