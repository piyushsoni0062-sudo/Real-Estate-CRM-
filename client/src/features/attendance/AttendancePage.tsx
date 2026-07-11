import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LogIn, LogOut, MapPin, Pencil, Plus, UserPlus } from "lucide-react";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsersList } from "@/lib/lookups";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import type { AttendanceRecord, Leave } from "@/lib/types";

const STATUS_COLOR: Record<string, string> = {
  PRESENT: "#10B981",
  LATE: "#F59E0B",
  HALF_DAY: "#06B6D4",
  LEAVE: "#8B5CF6",
  ABSENT: "#EF4444",
  PENDING: "#F59E0B",
  APPROVED: "#10B981",
  REJECTED: "#EF4444",
};

function fmtTime(v: string | null) {
  return v ? new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function fmtMinutes(mins: number | null) {
  if (!mins) return "—";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

async function getGps(): Promise<{ lat?: number; lng?: number }> {
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return {}; // GPS optional — attendance still recorded
  }
}

export default function AttendancePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState("today");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [editRec, setEditRec] = useState<AttendanceRecord | null>(null);
  const [markOpen, setMarkOpen] = useState(false);

  const { data: myToday, isLoading: loadingMe } = useQuery({
    queryKey: ["attendance-me"],
    queryFn: async () =>
      (await api.get<ApiResponse<AttendanceRecord | null>>("/attendance/me/today")).data.data,
  });

  const canViewTeam = can("attendance", "view");
  const { data: teamToday, isLoading: loadingTeam } = useQuery({
    queryKey: ["attendance-team"],
    queryFn: async () =>
      (await api.get<ApiResponse<AttendanceRecord[]>>("/attendance")).data.data,
    enabled: canViewTeam && tab === "today",
  });

  const { data: leaves, isLoading: loadingLeaves } = useQuery({
    queryKey: ["leaves"],
    queryFn: async () => (await api.get<ApiResponse<Leave[]>>("/attendance/leaves")).data.data,
    enabled: tab === "leaves",
  });

  // Monthly per-employee attendance report.
  const { data: report, isLoading: loadingReport } = useQuery({
    queryKey: ["attendance-report", month],
    queryFn: async () =>
      (
        await api.get<
          ApiResponse<{
            month: string;
            workingDays: number;
            summary: Array<{
              user: { id: string; name: string; avatarUrl: string | null; designation: string | null };
              present: number;
              late: number;
              halfDay: number;
              leave: number;
              absent: number;
              totalMinutes: number;
              avgMinutes: number;
            }>;
          }>
        >("/attendance/report", { params: { month } })
      ).data.data,
    enabled: canViewTeam && tab === "report",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance-me"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-team"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-report"] });
  };

  const checkIn = useMutation({
    mutationFn: async () => (await api.post("/attendance/check-in", await getGps())).data,
    onSuccess: () => {
      invalidate();
      toast.success("Checked in", "Have a productive day!");
    },
    onError: (err) => toast.error("Check-in failed", errorMessage(err)),
  });

  const checkOut = useMutation({
    mutationFn: async () => (await api.post("/attendance/check-out", await getGps())).data,
    onSuccess: () => {
      invalidate();
      toast.success("Checked out", "See you tomorrow!");
    },
    onError: (err) => toast.error("Check-out failed", errorMessage(err)),
  });

  const approveLeave = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      (await api.patch(`/attendance/leaves/${id}`, { status })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave updated");
    },
    onError: (err) => toast.error("Failed", errorMessage(err)),
  });

  const canManageLeaves = can("attendance", "manage");

  return (
    <div className="animate-fade-in">
      <PageHeader title="Attendance" description="Daily check-in, working hours and leaves" />

      {/* My check-in card */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          {loadingMe ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold">
                  Today · {formatDate(new Date())}
                  {myToday?.status && (
                    <Badge color={STATUS_COLOR[myToday.status]} className="ml-2">
                      {myToday.status.replace("_", " ")}
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  In: <span className="font-medium text-foreground">{fmtTime(myToday?.checkInAt ?? null)}</span>
                  {"  ·  "}Out: <span className="font-medium text-foreground">{fmtTime(myToday?.checkOutAt ?? null)}</span>
                  {"  ·  "}Hours: <span className="font-medium text-foreground">{fmtMinutes(myToday?.workMinutes ?? null)}</span>
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> GPS location is captured with each punch (if allowed)
                </p>
              </div>
              <div className="flex gap-2">
                {!myToday?.checkInAt ? (
                  <Button onClick={() => checkIn.mutate()} loading={checkIn.isPending}>
                    <LogIn className="h-4 w-4" /> Check In
                  </Button>
                ) : !myToday.checkOutAt ? (
                  <Button variant="destructive" onClick={() => checkOut.mutate()} loading={checkOut.isPending}>
                    <LogOut className="h-4 w-4" /> Check Out
                  </Button>
                ) : (
                  <Badge color="#10B981">Day complete ✓</Badge>
                )}
                <Button variant="outline" onClick={() => setLeaveOpen(true)}>
                  <Plus className="h-4 w-4" /> Apply Leave
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Tabs
        tabs={[
          ...(canViewTeam ? [{ key: "today", label: "Team Today" }] : []),
          ...(canViewTeam ? [{ key: "report", label: "Monthly Report" }] : []),
          { key: "leaves", label: "Leaves" },
        ]}
        active={canViewTeam ? tab : "leaves"}
        onChange={setTab}
      />

      {tab === "today" && canViewTeam && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Team attendance — today</CardTitle>
            {canManageLeaves && (
              <Button size="sm" variant="outline" onClick={() => setMarkOpen(true)}>
                <UserPlus className="h-4 w-4" /> Mark Attendance
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {loadingTeam ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (teamToday ?? []).length === 0 ? (
              <EmptyState icon={<CalendarDays />} title="No punches yet today" />
            ) : (
              <div className="divide-y">
                {teamToday!.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Avatar name={r.user?.name ?? "?"} src={r.user?.avatarUrl} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.user?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.user?.designation ?? r.user?.department?.name ?? ""}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {fmtTime(r.checkInAt)} → {fmtTime(r.checkOutAt)}
                    </p>
                    <p className="w-16 text-sm text-muted-foreground">{fmtMinutes(r.workMinutes)}</p>
                    <Badge color={STATUS_COLOR[r.status]}>{r.status.replace("_", " ")}</Badge>
                    {canManageLeaves && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit attendance for ${r.user?.name}`}
                        onClick={() => setEditRec(r)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "report" && canViewTeam && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Monthly attendance report</CardTitle>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-44"
              aria-label="Select month"
            />
          </CardHeader>
          <CardContent>
            {loadingReport ? (
              <Skeleton className="h-64 w-full" />
            ) : !report ? null : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  {report.workingDays} working days (Mon–Sat) counted so far this month.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-semibold">Employee</th>
                        <th className="px-2 py-2 text-center font-semibold">Present</th>
                        <th className="px-2 py-2 text-center font-semibold">Late</th>
                        <th className="px-2 py-2 text-center font-semibold">Half Day</th>
                        <th className="px-2 py-2 text-center font-semibold">Leave</th>
                        <th className="px-2 py-2 text-center font-semibold">Absent</th>
                        <th className="px-2 py-2 text-center font-semibold">Total Hrs</th>
                        <th className="px-2 py-2 text-center font-semibold">Avg/Day</th>
                        <th className="px-2 py-2 text-center font-semibold">Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.summary.map((row) => {
                        const attended = row.present + row.late + row.halfDay;
                        const pct = report.workingDays
                          ? Math.round(((attended + row.leave) / report.workingDays) * 100)
                          : 0;
                        return (
                          <tr key={row.user.id} className="border-b last:border-0">
                            <td className="py-2.5 pr-4">
                              <span className="flex items-center gap-2">
                                <Avatar name={row.user.name} src={row.user.avatarUrl} size={28} />
                                <span>
                                  <span className="block font-medium">{row.user.name}</span>
                                  {row.user.designation && (
                                    <span className="block text-xs text-muted-foreground">
                                      {row.user.designation}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-center font-semibold text-success">{row.present}</td>
                            <td className="px-2 py-2.5 text-center font-semibold text-warning">{row.late}</td>
                            <td className="px-2 py-2.5 text-center">{row.halfDay}</td>
                            <td className="px-2 py-2.5 text-center">{row.leave}</td>
                            <td className="px-2 py-2.5 text-center font-semibold text-destructive">{row.absent}</td>
                            <td className="px-2 py-2.5 text-center">{fmtMinutes(row.totalMinutes) === "—" ? "0h" : fmtMinutes(row.totalMinutes)}</td>
                            <td className="px-2 py-2.5 text-center">{fmtMinutes(row.avgMinutes)}</td>
                            <td className="px-2 py-2.5 text-center">
                              <Badge color={pct >= 90 ? "#10B981" : pct >= 70 ? "#F59E0B" : "#EF4444"}>
                                {pct}%
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(tab === "leaves" || !canViewTeam) && (
        <Card>
          <CardHeader>
            <CardTitle>Leave requests</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingLeaves ? (
              <Skeleton className="h-32 w-full" />
            ) : (leaves ?? []).length === 0 ? (
              <EmptyState icon={<CalendarDays />} title="No leave requests" />
            ) : (
              <div className="divide-y">
                {leaves!.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{l.user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(l.fromDate)} → {formatDate(l.toDate)} · {l.type}
                        {l.reason && ` · ${l.reason}`}
                      </p>
                    </div>
                    <Badge color={STATUS_COLOR[l.status]}>{l.status}</Badge>
                    {canManageLeaves && l.status === "PENDING" && (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => approveLeave.mutate({ id: l.id, status: "APPROVED" })}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveLeave.mutate({ id: l.id, status: "REJECTED" })}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ApplyLeaveDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} />
      <EditAttendanceDialog record={editRec} onClose={() => setEditRec(null)} onSaved={invalidate} />
      <MarkAttendanceDialog open={markOpen} onClose={() => setMarkOpen(false)} onSaved={invalidate} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin: edit an existing punch                                       */
/* ------------------------------------------------------------------ */

const ATT_STATUSES = ["PRESENT", "LATE", "HALF_DAY", "LEAVE", "ABSENT"];

function toLocalInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditAttendanceDialog({
  record,
  onClose,
  onSaved,
}: {
  record: AttendanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ status: "", checkInAt: "", checkOutAt: "", notes: "" });
  const [lastId, setLastId] = useState<string | null>(null);

  if (record && record.id !== lastId) {
    setLastId(record.id);
    setForm({
      status: record.status,
      checkInAt: toLocalInput(record.checkInAt),
      checkOutAt: toLocalInput(record.checkOutAt),
      notes: "",
    });
  }

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/attendance/${record!.id}`, {
          status: form.status,
          checkInAt: form.checkInAt ? new Date(form.checkInAt).toISOString() : null,
          checkOutAt: form.checkOutAt ? new Date(form.checkOutAt).toISOString() : null,
          notes: form.notes.trim() || undefined,
        })
      ).data,
    onSuccess: () => {
      onSaved();
      onClose();
      toast.success("Attendance updated");
    },
    onError: (err) => toast.error("Update failed", errorMessage(err)),
  });

  if (!record) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit attendance — ${record.user?.name ?? ""}`}
      description={formatDate(record.date)}
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="ea-status">Status</Label>
          <Select
            id="ea-status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {ATT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ea-in">Check In</Label>
            <Input
              id="ea-in"
              type="datetime-local"
              value={form.checkInAt}
              onChange={(e) => setForm((f) => ({ ...f, checkInAt: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="ea-out">Check Out</Label>
            <Input
              id="ea-out"
              type="datetime-local"
              value={form.checkOutAt}
              onChange={(e) => setForm((f) => ({ ...f, checkOutAt: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="ea-notes">Correction note</Label>
          <Input
            id="ea-notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. Forgot to punch out — corrected"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Working hours are recalculated automatically. This change is recorded in the audit log.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save Changes</Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Admin: mark attendance for an employee (missed punch / leave)       */
/* ------------------------------------------------------------------ */

function MarkAttendanceDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { data: users } = useUsersList();
  const [form, setForm] = useState({
    userId: "",
    date: new Date().toISOString().slice(0, 10),
    status: "PRESENT",
    checkInAt: "",
    checkOutAt: "",
  });

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post("/attendance/mark", {
          userId: form.userId,
          date: form.date,
          status: form.status,
          checkInAt: form.checkInAt ? new Date(`${form.date}T${form.checkInAt}`).toISOString() : null,
          checkOutAt: form.checkOutAt ? new Date(`${form.date}T${form.checkOutAt}`).toISOString() : null,
        })
      ).data,
    onSuccess: () => {
      onSaved();
      onClose();
      setForm((f) => ({ ...f, userId: "", checkInAt: "", checkOutAt: "" }));
      toast.success("Attendance marked");
    },
    onError: (err) => toast.error("Failed", errorMessage(err)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Mark attendance"
      description="For missed punches, leaves or corrections — overwrites that day's record if one exists."
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ma-user">Employee *</Label>
            <Select
              id="ma-user"
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
            >
              <option value="">Choose…</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ma-date">Date *</Label>
            <Input
              id="ma-date"
              type="date"
              value={form.date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="ma-status">Status</Label>
          <Select
            id="ma-status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {ATT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </Select>
        </div>
        {form.status !== "LEAVE" && form.status !== "ABSENT" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ma-in">Check In time</Label>
              <Input
                id="ma-in"
                type="time"
                value={form.checkInAt}
                onChange={(e) => setForm((f) => ({ ...f, checkInAt: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ma-out">Check Out time</Label>
              <Input
                id="ma-out"
                type="time"
                value={form.checkOutAt}
                onChange={(e) => setForm((f) => ({ ...f, checkOutAt: e.target.value }))}
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.userId || !form.date}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Mark
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ApplyLeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [type, setType] = useState("CASUAL");
  const [reason, setReason] = useState("");

  const apply = useMutation({
    mutationFn: async () =>
      (
        await api.post("/attendance/leaves", {
          fromDate,
          toDate,
          type,
          reason: reason.trim() || undefined,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      onClose();
      setFromDate("");
      setToDate("");
      setReason("");
      toast.success("Leave applied", "Waiting for approval");
    },
    onError: (err) => toast.error("Could not apply", errorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Apply for Leave">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lv-from">From *</Label>
            <Input id="lv-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="lv-to">To *</Label>
            <Input id="lv-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="lv-type">Type</Label>
          <Select id="lv-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="CASUAL">Casual</option>
            <option value="SICK">Sick</option>
            <option value="EARNED">Earned</option>
            <option value="UNPAID">Unpaid</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="lv-reason">Reason</Label>
          <Textarea id="lv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!fromDate || !toDate} loading={apply.isPending} onClick={() => apply.mutate()}>
            Submit
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
