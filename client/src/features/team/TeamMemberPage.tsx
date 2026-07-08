import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CalendarCheck, CheckSquare, Target, UsersRound } from "lucide-react";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  ErrorState,
  Skeleton,
} from "@/components/ui/primitives";
import type { TeamUser } from "@/lib/types";

export default function TeamMemberPage() {
  const { id } = useParams<{ id: string }>();

  const { data: user, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["team-member", id],
    queryFn: async () => (await api.get<ApiResponse<TeamUser>>(`/users/${id}`)).data.data,
    enabled: !!id,
  });

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  if (isLoading || !user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const target = Number(user.salesTarget ?? 0);
  const achieved = Number(user.stats?.monthRevenue ?? 0);
  const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : null;

  const stats = [
    { label: "Assigned Leads", value: user.stats?.leads ?? 0, icon: UsersRound, color: "text-blue-600 bg-blue-600/10" },
    { label: "Completed Visits", value: user.stats?.siteVisits ?? 0, icon: CalendarCheck, color: "text-orange-600 bg-orange-600/10" },
    { label: "Bookings", value: user.stats?.bookings ?? 0, icon: Banknote, color: "text-emerald-600 bg-emerald-600/10" },
    { label: "Pending Tasks", value: user.stats?.pendingTasks ?? 0, icon: CheckSquare, color: "text-rose-600 bg-rose-600/10" },
  ];

  return (
    <div className="animate-fade-in">
      <Link
        to="/team"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Team
      </Link>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-5 pt-5">
          <Avatar name={user.name} src={user.avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">{user.name}</h1>
            <p className="text-sm text-muted-foreground">
              {user.designation ?? user.role.name}
              {user.department && ` · ${user.department.name}`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.mobile}
              {user.email && ` · ${user.email}`}
            </p>
            <div className="mt-2 flex gap-1.5">
              <Badge color="#3B82F6">{user.role.name}</Badge>
              <Badge color={user.isActive ? "#10B981" : "#EF4444"}>
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge>Joined {formatDate(user.createdAt)}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${s.color}`}>
              <s.icon className="h-[18px] w-[18px]" />
            </span>
            <p className="mt-2.5 text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardContent className="pt-5">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Target vs Achievement (this month)</h2>
          </div>
          {target > 0 ? (
            <>
              <div className="mt-4 flex items-end justify-between text-sm">
                <span className="font-semibold text-primary">{formatINR(achieved)} achieved</span>
                <span className="text-muted-foreground">Target {formatINR(target)}</span>
              </div>
              <div
                className="mt-2 h-3 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={pct ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{pct}% of monthly target</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No sales target set for this employee. Set one from Team → Edit.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
