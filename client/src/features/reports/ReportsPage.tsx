import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";

interface ReportSummary {
  range: { from: string; to: string };
  overview: {
    leadsCreated: number;
    bookings: number;
    revenue: number;
    siteVisits: number;
    conversionRate: number;
  };
  leadSource: Array<{ name: string; color: string; value: number }>;
  leadStatus: Array<{ name: string; color: string; value: number }>;
  siteVisitStatus: Array<{ name: string; value: number }>;
  lostReasons: Array<{ name: string; value: number }>;
  employees: Array<{
    id: string;
    name: string;
    role: string;
    leads: number;
    visits: number;
    bookings: number;
    revenue: number;
    target: number;
  }>;
  attendance: Array<{ name: string; value: number }>;
  propertyInventory: Array<{ type: string; status: string; count: number }>;
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
};

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () =>
      (
        await api.get<ApiResponse<ReportSummary>>("/reports/summary", {
          params: { from, to: `${to}T23:59:59` },
        })
      ).data.data,
  });

  const [reportType, setReportType] = useState("all");
  const [exporting, setExporting] = useState(false);

  const exportReport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const overviewRows = [
        {
          From: from,
          To: to,
          Leads: data.overview.leadsCreated,
          Bookings: data.overview.bookings,
          Revenue: data.overview.revenue,
          SiteVisits: data.overview.siteVisits,
          "Conversion %": data.overview.conversionRate,
        },
      ];
      const employeeRows = data.employees.map((e) => ({
        Employee: e.name,
        Role: e.role,
        Leads: e.leads,
        "Site Visits": e.visits,
        Bookings: e.bookings,
        Revenue: e.revenue,
        Target: e.target,
        "Target %": e.target > 0 ? Math.round((e.revenue / e.target) * 100) : "",
      }));
      const srcRows = data.leadSource.map((s) => ({ Source: s.name, Leads: s.value }));
      const statusRows = data.leadStatus.map((s) => ({ Status: s.name, Leads: s.value }));
      const lostRows = data.lostReasons.map((r) => ({ Reason: r.name, Leads: r.value }));
      const visitRows = data.siteVisitStatus.map((v) => ({ Status: v.name, Visits: v.value }));
      const invRows = data.propertyInventory.map((p) => ({
        Type: p.type,
        Status: p.status,
        Units: p.count,
      }));

      // Per-employee monthly attendance comes from its own endpoint.
      const attendanceRows = async () => {
        const month = from.slice(0, 7);
        const rep = (
          await api.get<
            ApiResponse<{
              workingDays: number;
              summary: Array<{
                user: { name: string; designation: string | null };
                present: number; late: number; halfDay: number; leave: number;
                absent: number; totalMinutes: number; avgMinutes: number;
              }>;
            }>
          >("/attendance/report", { params: { month } })
        ).data.data;
        return rep.summary.map((r) => ({
          Employee: r.user.name,
          Designation: r.user.designation ?? "",
          Present: r.present,
          Late: r.late,
          "Half Day": r.halfDay,
          Leave: r.leave,
          Absent: r.absent,
          "Total Hours": +(r.totalMinutes / 60).toFixed(1),
          "Avg Hours/Day": +(r.avgMinutes / 60).toFixed(1),
          "Working Days": rep.workingDays,
        }));
      };

      let filename = `report-${from}-to-${to}.xlsx`;
      switch (reportType) {
        case "overview":
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), "Overview");
          filename = `overview-${from}-to-${to}.xlsx`;
          break;
        case "employees":
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows), "Employee Performance");
          filename = `employee-performance-${from}-to-${to}.xlsx`;
          break;
        case "leadSource":
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(srcRows), "Lead Sources");
          filename = `lead-sources-${from}-to-${to}.xlsx`;
          break;
        case "leadStatus":
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusRows), "Lead Status");
          filename = `lead-status-${from}-to-${to}.xlsx`;
          break;
        case "lostReasons":
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lostRows), "Lost Reasons");
          filename = `lost-reasons-${from}-to-${to}.xlsx`;
          break;
        case "siteVisits":
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitRows), "Site Visits");
          filename = `site-visits-${from}-to-${to}.xlsx`;
          break;
        case "inventory":
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), "Inventory");
          filename = `property-inventory-${from}-to-${to}.xlsx`;
          break;
        case "attendance": {
          const rows = await attendanceRows();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Attendance");
          filename = `attendance-${from.slice(0, 7)}.xlsx`;
          break;
        }
        default: {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), "Overview");
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows), "Employees");
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(srcRows), "Lead Sources");
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusRows), "Lead Status");
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lostRows), "Lost Reasons");
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitRows), "Site Visits");
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), "Inventory");
          const rows = await attendanceRows();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Attendance");
          filename = `complete-report-${from}-to-${to}.xlsx`;
        }
      }
      XLSX.writeFile(wb, filename);
      toast.success("Report exported", filename);
    } catch (err) {
      toast.error("Export failed", errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  if (isError) {
    return (
      <>
        <PageHeader title="Reports" />
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reports"
        description="Revenue, sources, employees, visits, attendance and inventory"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-56"
              aria-label="Choose report to export"
            >
              <option value="all">Complete Report (all)</option>
              <option value="overview">Overview</option>
              <option value="employees">Employee Performance</option>
              <option value="leadSource">Lead Sources</option>
              <option value="leadStatus">Lead Status</option>
              <option value="lostReasons">Lost Reasons</option>
              <option value="siteVisits">Site Visits</option>
              <option value="attendance">Attendance (Monthly)</option>
              <option value="inventory">Property Inventory</option>
            </Select>
            <Button variant="outline" onClick={exportReport} disabled={!data} loading={exporting}>
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </div>
        }
      />

      {/* Date range */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="r-from">From</Label>
          <Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        </div>
        <div>
          <Label htmlFor="r-to">To</Label>
          <Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[
          { label: "Leads", value: data?.overview.leadsCreated },
          { label: "Site Visits", value: data?.overview.siteVisits },
          { label: "Bookings", value: data?.overview.bookings },
          { label: "Revenue", value: data ? formatINR(data.overview.revenue) : undefined },
          { label: "Conversion", value: data ? `${data.overview.conversionRate}%` : undefined },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <p className="text-2xl font-bold tracking-tight">{c.value}</p>
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              </>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Leads by Source</CardTitle></CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.leadSource.filter((s) => s.value > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-25} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Leads" radius={[6, 6, 0, 0]}>
                    {data!.leadSource.filter((s) => s.value > 0).map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lead Status Distribution</CardTitle></CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data!.leadStatus.filter((s) => s.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data!.leadStatus.filter((s) => s.value > 0).map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lost Reason Analysis</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : data!.lostReasons.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No lost leads in this period 🎉</p>
            ) : (
              <div className="space-y-2.5">
                {data!.lostReasons.map((r) => {
                  const max = data!.lostReasons[0].value;
                  return (
                    <div key={r.name}>
                      <div className="flex justify-between text-sm">
                        <span>{r.name}</span>
                        <span className="font-semibold">{r.value}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-destructive/70"
                          style={{ width: `${(r.value / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Site Visits & Attendance</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Visits</p>
                  {data!.siteVisitStatus.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No visits</p>
                  ) : (
                    data!.siteVisitStatus.map((v) => (
                      <div key={v.name} className="flex justify-between py-1 text-sm">
                        <span>{v.name}</span>
                        <span className="font-semibold">{v.value}</span>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Attendance</p>
                  {data!.attendance.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No records</p>
                  ) : (
                    data!.attendance.map((a) => (
                      <div key={a.name} className="flex justify-between py-1 text-sm">
                        <span>{a.name.replace("_", " ")}</span>
                        <span className="font-semibold">{a.value}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Employee table */}
      <Card className="mt-4">
        <CardHeader><CardTitle>Employee Performance</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-semibold">Employee</th>
                    <th className="py-2 pr-4 font-semibold">Leads</th>
                    <th className="py-2 pr-4 font-semibold">Visits</th>
                    <th className="py-2 pr-4 font-semibold">Bookings</th>
                    <th className="py-2 pr-4 font-semibold">Revenue</th>
                    <th className="py-2 font-semibold">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.employees.map((e) => {
                    const pct = e.target > 0 ? Math.round((e.revenue / e.target) * 100) : null;
                    return (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4">
                          <p className="font-medium">{e.name}</p>
                          <p className="text-xs text-muted-foreground">{e.role}</p>
                        </td>
                        <td className="py-2.5 pr-4">{e.leads}</td>
                        <td className="py-2.5 pr-4">{e.visits}</td>
                        <td className="py-2.5 pr-4">{e.bookings}</td>
                        <td className="py-2.5 pr-4 font-semibold">{formatINR(e.revenue)}</td>
                        <td className="py-2.5">
                          {pct !== null ? (
                            <Badge color={pct >= 100 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444"}>
                              {pct}% of {formatINR(e.target)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inventory matrix */}
      <Card className="mt-4">
        <CardHeader><CardTitle>Property Inventory</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <InventoryMatrix rows={data!.propertyInventory} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InventoryMatrix({ rows }: { rows: Array<{ type: string; status: string; count: number }> }) {
  const types = [...new Set(rows.map((r) => r.type))];
  const statuses = ["AVAILABLE", "HOLD", "BOOKED", "SOLD"];
  const get = (t: string, s: string) => rows.find((r) => r.type === t && r.status === s)?.count ?? 0;

  if (types.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No inventory yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-semibold">Type</th>
            {statuses.map((s) => (
              <th key={s} className="py-2 pr-4 font-semibold">{s}</th>
            ))}
            <th className="py-2 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t} className="border-b last:border-0">
              <td className="py-2.5 pr-4 font-medium">{t.charAt(0) + t.slice(1).toLowerCase()}</td>
              {statuses.map((s) => (
                <td key={s} className="py-2.5 pr-4">{get(t, s)}</td>
              ))}
              <td className="py-2.5 font-semibold">
                {statuses.reduce((sum, s) => sum + get(t, s), 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
