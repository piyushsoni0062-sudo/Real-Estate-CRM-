import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, X } from "lucide-react";
import { api, ApiResponse, errorMessage, Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatINR, timeAgo } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/ui/data-table";
import { CreatableSelect } from "@/components/ui/creatable-select";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  FieldError,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import type { TeamUser } from "@/lib/types";

const userSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  password: z.string().min(8, "At least 8 characters").or(z.literal("")).optional(),
  roleId: z.string().min(1, "Role is required"),
  departmentId: z.string().optional(),
  designation: z.string().optional(),
  salesTarget: z.string().optional(),
  isActive: z.boolean(),
});
type UserFormValues = z.infer<typeof userSchema>;

interface RoleRow {
  id: string;
  name: string;
}

export default function TeamPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can, user: me } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [deleting, setDeleting] = useState<TeamUser | null>(null);

  const params = useMemo(() => ({ page, limit: 20, search: search || undefined }), [page, search]);

  const { data, isLoading } = useQuery({
    queryKey: ["team", params],
    queryFn: async () =>
      (await api.get<ApiResponse<Paginated<TeamUser>>>("/users", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: async () =>
      (await api.get<ApiResponse<{ roles: RoleRow[] }>>("/roles")).data.data,
    enabled: can("roles", "view"),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () =>
      (await api.get<ApiResponse<Array<{ id: string; name: string }>>>("/settings/departments"))
        .data.data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setDeleting(null);
      toast.success("User removed");
    },
    onError: (err) => toast.error("Delete failed", errorMessage(err)),
  });

  const columns: Column<TeamUser>[] = [
    {
      key: "name",
      header: "Employee",
      render: (u) => (
        <span className="flex items-center gap-3">
          <Avatar name={u.name} src={u.avatarUrl} size={34} />
          <span>
            <span className="block font-medium">
              {u.name}
              {u.id === me?.id && <Badge className="ml-1.5">You</Badge>}
            </span>
            <span className="block text-xs text-muted-foreground">
              {u.designation ?? u.role.name}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "mobile",
      header: "Contact",
      className: "hidden md:table-cell",
      render: (u) => (
        <span>
          <span className="block text-sm">{u.mobile}</span>
          {u.email && <span className="block text-xs text-muted-foreground">{u.email}</span>}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => <Badge color="#3B82F6">{u.role.name}</Badge>,
    },
    {
      key: "department",
      header: "Department",
      className: "hidden lg:table-cell",
      render: (u) => <span className="text-sm">{u.department?.name ?? "—"}</span>,
    },
    {
      key: "target",
      header: "Target",
      className: "hidden lg:table-cell",
      render: (u) => (
        <span className="text-sm">{u.salesTarget ? formatINR(u.salesTarget) : "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <span>
          <Badge color={u.isActive ? "#10B981" : "#EF4444"}>{u.isActive ? "Active" : "Inactive"}</Badge>
          {u.lastLoginAt && (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Seen {timeAgo(u.lastLoginAt)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (u) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {can("users", "update") && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(u); setFormOpen(true); }}>
              Edit
            </Button>
          )}
          {can("users", "delete") && u.id !== me?.id && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(u)}>
              Remove
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Team"
        description={data ? `${data.meta.total} team members` : undefined}
        actions={
          can("users", "create") && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Employee
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setSearch(searchInput.trim()), setPage(1))}
            placeholder="Search name, mobile…"
            className="pl-9"
            aria-label="Search team"
          />
        </div>
        {search && (
          <Button variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(u) => u.id}
        loading={isLoading}
        onRowClick={(u) => navigate(`/team/${u.id}`)}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle="No team members found"
      />

      <UserFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        roles={rolesData?.roles ?? []}
        departments={departments ?? []}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Remove ${deleting?.name}?`}
        description="Their account is deactivated and all sessions revoked. Records they created are kept."
        confirmLabel="Remove"
      />
    </div>
  );
}

function UserFormDialog({
  open,
  onClose,
  editing,
  roles,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  editing: TeamUser | null;
  roles: RoleRow[];
  departments: Array<{ id: string; name: string }>;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    values: {
      name: editing?.name ?? "",
      mobile: editing?.mobile ?? "",
      email: editing?.email ?? "",
      password: "",
      roleId: editing?.role.id ?? "",
      departmentId: editing?.department?.id ?? "",
      designation: editing?.designation ?? "",
      salesTarget: editing?.salesTarget ? String(Number(editing.salesTarget)) : "",
      isActive: editing?.isActive ?? true,
    },
  });

  const save = useMutation({
    mutationFn: async (values: UserFormValues) => {
      const payload: Record<string, unknown> = {
        name: values.name.trim(),
        mobile: values.mobile,
        email: values.email?.trim() || null,
        roleId: values.roleId,
        departmentId: values.departmentId || null,
        designation: values.designation?.trim() || null,
        salesTarget: values.salesTarget ? Number(values.salesTarget) : null,
        isActive: values.isActive,
      };
      if (values.password) payload.password = values.password;
      if (editing) {
        return (await api.patch(`/users/${editing.id}`, payload)).data;
      }
      if (!values.password) throw new Error("Password is required for new users");
      return (await api.post("/users", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      onClose();
      toast.success(editing ? "Employee updated" : "Employee added");
    },
    onError: (err) =>
      toast.error("Save failed", err instanceof Error && !("response" in err) ? err.message : errorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Edit ${editing.name}` : "Add Employee"} wide>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="u-name">Name *</Label>
          <Input id="u-name" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="u-mobile">Mobile *</Label>
          <Input id="u-mobile" type="tel" maxLength={10} {...register("mobile")} />
          <FieldError message={errors.mobile?.message} />
        </div>
        <div>
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="u-password">{editing ? "New Password (leave blank to keep)" : "Password *"}</Label>
          <Input id="u-password" type="password" autoComplete="new-password" {...register("password")} />
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="u-role">Role *</Label>
          <Select id="u-role" {...register("roleId")}>
            <option value="">Choose role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <FieldError message={errors.roleId?.message} />
        </div>
        <div>
          <Label htmlFor="u-dept">Department</Label>
          <CreatableSelect
            id="u-dept"
            value={watch("departmentId") ?? ""}
            onChange={(v) => setValue("departmentId", v, { shouldDirty: true })}
            options={departments}
            placeholder="None"
            entityLabel="department"
            canCreate={can("settings", "update")}
            onCreate={async (name) => {
              const res = await api.post<ApiResponse<{ id: string; name: string }>>(
                "/settings/departments",
                { name }
              );
              await queryClient.invalidateQueries({ queryKey: ["departments"] });
              return res.data.data;
            }}
          />
        </div>
        <div>
          <Label htmlFor="u-designation">Designation</Label>
          <Input id="u-designation" placeholder="Sales Executive" {...register("designation")} />
        </div>
        <div>
          <Label htmlFor="u-target">Monthly Sales Target (₹)</Label>
          <Input id="u-target" type="number" min={0} {...register("salesTarget")} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))]" {...register("isActive")} />
          Account active (can log in)
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{editing ? "Save Changes" : "Add Employee"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
