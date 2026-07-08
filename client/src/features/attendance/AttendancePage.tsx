import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LogIn, LogOut, MapPin, Plus } from "lucide-react";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance-me"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-team"] });
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
          { key: "leaves", label: "Leaves" },
        ]}
        active={canViewTeam ? tab : "leaves"}
        onChange={setTab}
      />

      {tab === "today" && canViewTeam && (
        <Card>
          <CardHeader>
            <CardTitle>Team attendance — today</CardTitle>
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
                  </div>
                ))}
              </div>
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
    </div>
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
