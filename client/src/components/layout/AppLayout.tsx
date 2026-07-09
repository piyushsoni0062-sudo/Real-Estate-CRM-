import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CalendarCheck,
  CheckSquare,
  ClipboardList,
  Home,
  Kanban,
  LogOut,
  Menu,
  Moon,
  Plug,
  Plus,
  Search,
  Settings,
  Sun,
  UserCircle,
  UserRound,
  Users,
  UsersRound,
  BarChart3,
  X,
} from "lucide-react";
import { api, ApiResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { APP_NAME } from "@/lib/branding";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, Badge, Dropdown, DropdownItem } from "@/components/ui/primitives";
import type { Notification, FollowUp } from "@/lib/types";
import { QuickAddLead } from "@/features/leads/QuickAddLead";
import { GlobalSearch } from "./GlobalSearch";

const NAV = [
  { to: "/", label: "Dashboard", icon: Home, perm: ["dashboard", "view"] },
  { to: "/leads", label: "Lead Management", icon: UsersRound, perm: ["leads", "view"] },
  { to: "/properties", label: "Property Management", icon: Building2, perm: ["properties", "view"] },
  { to: "/site-visits", label: "Site Visits", icon: CalendarCheck, perm: ["siteVisits", "view"] },
  { to: "/pipeline", label: "Sales Pipeline", icon: Kanban, perm: ["leads", "view"] },
  { to: "/customers", label: "Customers", icon: UserRound, perm: ["customers", "view"] },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, perm: ["tasks", "view"] },
  { to: "/attendance", label: "Attendance", icon: ClipboardList, perm: null },
  { to: "/team", label: "Team", icon: Users, perm: ["users", "view"] },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: ["reports", "view"] },
  { to: "/integrations", label: "Integrations", icon: Plug, perm: ["integrations", "view"] },
  { to: "/settings", label: "Settings", icon: Settings, perm: ["settings", "view"] },
] as const;

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("crm-theme", next ? "dark" : "light");
  };
  return { dark, toggle };
}

export default function AppLayout() {
  const { user, can, logout, logoutAll } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close the mobile sidebar on navigation.
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  // Cmd/Ctrl+K opens global search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const { data: notif } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get<
        ApiResponse<{
          notifications: Notification[];
          unreadCount: number;
          dueFollowUps: FollowUp[];
          overdueTasks: number;
        }>
      >("/notifications");
      return res.data.data;
    },
    refetchInterval: 30000, // near-real-time reminder polling
  });

  const nav = useMemo(() => NAV.filter((n) => !n.perm || can(n.perm[0], n.perm[1])), [can]);
  const unread = notif?.unreadCount ?? 0;
  const dueCount = notif?.dueFollowUps?.length ?? 0;

  const markAllRead = async () => {
    await api.post("/notifications/read", {});
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">{APP_NAME}</p>
          </div>
          <button
            className="ml-auto cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <Link
            to="/profile"
            className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted"
          >
            <Avatar name={user?.name ?? "?"} src={user?.avatarUrl} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.role.name}</p>
            </div>
          </Link>
          <button
            onClick={() => logout().then(() => navigate("/login"))}
            className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[18px] w-[18px]" /> Logout
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <button
            className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-ring sm:max-w-md"
            aria-label="Open global search"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search leads, properties, customers…</span>
            <span className="sm:hidden">Search…</span>
            <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-semibold sm:block">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {can("leads", "create") && (
              <button
                onClick={() => setQuickAddOpen(true)}
                className="hidden h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:inline-flex"
              >
                <Plus className="h-4 w-4" /> Add Lead
              </button>
            )}

            <button
              onClick={toggle}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="cursor-pointer rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Notifications */}
            <Dropdown
              width="w-80"
              trigger={
                <button
                  aria-label={`Notifications (${unread} unread)`}
                  className="relative cursor-pointer rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Bell className="h-5 w-5" />
                  {(unread > 0 || dueCount > 0) && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {unread + dueCount}
                    </span>
                  )}
                </button>
              }
            >
              {(close) => (
                <div className="max-h-96 overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-sm font-semibold">Notifications</p>
                    {unread > 0 && (
                      <button
                        onClick={markAllRead}
                        className="cursor-pointer text-xs font-medium text-primary hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {dueCount > 0 && (
                    <div className="mx-2 mb-1 rounded-lg bg-warning/10 p-2.5">
                      <p className="text-xs font-semibold text-warning">
                        {dueCount} follow-up{dueCount > 1 ? "s" : ""} due
                      </p>
                      {notif!.dueFollowUps.slice(0, 3).map((f) => (
                        <button
                          key={f.id}
                          className="mt-1 block w-full cursor-pointer truncate text-left text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            close();
                            navigate(`/leads/${f.lead?.id}`);
                          }}
                        >
                          {f.lead?.name} — {timeAgo(f.dueAt)}
                        </button>
                      ))}
                    </div>
                  )}
                  {(notif?.notifications?.length ?? 0) === 0 && dueCount === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      You're all caught up 🎉
                    </p>
                  ) : (
                    notif?.notifications.slice(0, 10).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          close();
                          if (n.link) navigate(n.link);
                        }}
                        className={cn(
                          "block w-full cursor-pointer rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted",
                          !n.readAt && "bg-primary/5"
                        )}
                      >
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.body && (
                          <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </Dropdown>

            {/* Profile menu */}
            <Dropdown
              trigger={
                <button aria-label="Account menu" className="cursor-pointer rounded-full ring-offset-2 transition-shadow hover:ring-2 hover:ring-ring">
                  <Avatar name={user?.name ?? "?"} src={user?.avatarUrl} size={36} />
                </button>
              }
            >
              {(close) => (
                <>
                  <div className="border-b px-3 py-2">
                    <p className="text-sm font-semibold">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.mobile} · <Badge className="ml-0.5">{user?.role.name}</Badge>
                    </p>
                  </div>
                  <DropdownItem
                    onClick={() => {
                      close();
                      navigate("/profile");
                    }}
                  >
                    <UserCircle className="h-4 w-4" /> My Profile
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => logout().then(() => navigate("/login"))}
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </DropdownItem>
                  <DropdownItem
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => logoutAll().then(() => navigate("/login"))}
                  >
                    <LogOut className="h-4 w-4" /> Logout from all devices
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <QuickAddLead open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
