import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Banknote,
  CalendarCheck,
  CheckSquare,
  PhoneCall,
  Sparkles,
  UserCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { formatINR, formatDateTime, timeAgo } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  Skeleton,
  Badge,
} from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";

interface DashboardData {
  cards: {
    todaysLeads: number;
    newLeads: number;
    openFollowUps: number;
    siteVisitsToday: number;
    bookings: number;
    revenue: number;
    pendingTasks: number;
    presentEmployees: number;
  };
  charts: {
    leadSources: Array<{ name: string; color: string; value: number }>;
    salesFunnel: Array<{ name: string; color: string; value: number }>;
    monthlyRevenue: Array<{ month: string; revenue: number }>;
    employeePerformance: Array<{ name: string; leads: number; revenue: number; target: number }>;
    propertyPerformance: Array<{ name: string; leads: number; total: number; sold: number }>;
  };
  lists: {
    recentBookings: Array<{
      id: string;
      amount: string;
      status: string;
      createdAt: string;
      lead: { name: string };
      property: { title: string; code: string };
    }>;
    upcomingFollowUps: Array<{
      id: string;
      dueAt: string;
      notes: string | null;
      lead: { id: string; name: string; mobile: string };
      assignedTo: { name: string };
    }>;
    todaysTasks: Array<{
      id: string;
      title: string;
      priority: string;
      dueAt: string | null;
      assignedTo: { name: string } | null;
    }>;
    latestActivities: Array<{
      id: string;
      title: string;
      createdAt: string;
      user: { name: string } | null;
      lead: { id: string; name: string } | null;
    }>;
  };
}

const CARD_DEFS = [
  { key: "todaysLeads", label: "Today's Leads", icon: Sparkles, color: "text-blue-600 bg-blue-600/10" },
  { key: "newLeads", label: "New Leads", icon: UsersRound, color: "text-violet-600 bg-violet-600/10" },
  { key: "openFollowUps", label: "Open Follow-ups", icon: PhoneCall, color: "text-amber-600 bg-amber-600/10" },
  { key: "siteVisitsToday", label: "Site Visits Today", icon: CalendarCheck, color: "text-orange-600 bg-orange-600/10" },
  { key: "bookings", label: "Bookings (month)", icon: Banknote, color: "text-emerald-600 bg-emerald-600/10" },
  { key: "revenue", label: "Revenue (month)", icon: Wallet, color: "text-green-600 bg-green-600/10", money: true },
  { key: "pendingTasks", label: "Pending Tasks", icon: CheckSquare, color: "text-rose-600 bg-rose-600/10" },
  { key: "presentEmployees", label: "Present Today", icon: UserCheck, color: "text-cyan-600 bg-cyan-600/10" },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<ApiResponse<DashboardData>>("/dashboard")).data.data,
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`Namaste, ${user?.name.split(" ")[0]} 👋`}
        description="Here's what's happening across your business today."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {CARD_DEFS.map((def) => (
          <Card key={def.key} className="p-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : (
              <>
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${def.color}`}>
                  <def.icon className="h-[18px] w-[18px]" />
                </span>
                <p className="mt-2.5 text-2xl font-bold tracking-tight">
                  {"money" in def && def.money
                    ? formatINR(data!.cards[def.key])
                    : data!.cards[def.key].toLocaleString("en-IN")}
                </p>
                <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
              </>
            )}
          </Card>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data!.charts.monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    tickFormatter={(v: number) => formatINR(v)}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={70}
                  />
                  <Tooltip
                    formatter={(v) => [formatINR(Number(v)), "Revenue"]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data!.charts.leadSources.filter((s) => s.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data!.charts.leadSources
                      .filter((s) => s.value > 0)
                      .map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales Funnel</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.charts.salesFunnel} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={82}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {data!.charts.salesFunnel.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Employee Performance (this month)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.charts.employeePerformance.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={(v: number) => formatINR(v)} tick={{ fontSize: 11 }} width={70} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(v, name) => [formatINR(Number(v)), name === "revenue" ? "Achieved" : "Target"]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Achieved" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="hsl(var(--border))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.charts.propertyPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="leads" name="Leads" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="sold" name="Sold/Booked" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Follow-ups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <ListSkeleton />
            ) : data!.lists.upcomingFollowUps.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No pending follow-ups.</p>
            ) : (
              data!.lists.upcomingFollowUps.map((f) => (
                <Link
                  key={f.id}
                  to={`/leads/${f.lead.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.lead.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.notes ?? f.lead.mobile} · {f.assignedTo.name}
                    </p>
                  </div>
                  <Badge color="#F59E0B">{formatDateTime(f.dueAt)}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today's Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <ListSkeleton />
            ) : data!.lists.todaysTasks.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No tasks due today.</p>
            ) : (
              data!.lists.todaysTasks.map((t) => (
                <Link
                  key={t.id}
                  to="/tasks"
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.assignedTo?.name ?? "Unassigned"}
                    </p>
                  </div>
                  <Badge
                    color={
                      t.priority === "URGENT"
                        ? "#EF4444"
                        : t.priority === "HIGH"
                          ? "#F97316"
                          : "#64748B"
                    }
                  >
                    {t.priority}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <ListSkeleton />
            ) : (
              data!.lists.latestActivities.map((a) => (
                <div key={a.id} className="rounded-lg px-2 py-2">
                  <p className="truncate text-sm">
                    <span className="font-medium">{a.user?.name ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">— {a.title}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.lead && (
                      <Link to={`/leads/${a.lead.id}`} className="text-primary hover:underline">
                        {a.lead.name}
                      </Link>
                    )}{" "}
                    · {timeAgo(a.createdAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent bookings */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ListSkeleton />
          ) : data!.lists.recentBookings.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <div className="divide-y">
              {data!.lists.recentBookings.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{b.lead.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.property.title} ({b.property.code})
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold">{formatINR(b.amount)}</p>
                    <Badge
                      color={
                        b.status === "CONFIRMED" || b.status === "COMPLETED" ? "#10B981" : "#F59E0B"
                      }
                    >
                      {b.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
