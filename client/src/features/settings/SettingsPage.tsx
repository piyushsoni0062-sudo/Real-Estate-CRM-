import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Shield, Trash2, Upload } from "lucide-react";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui/primitives";
import type { Option, Stage, Template } from "@/lib/types";

export default function SettingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState("company");

  const tabs = [
    { key: "company", label: "Company" },
    { key: "statuses", label: "Lead Statuses" },
    { key: "sources", label: "Lead Sources" },
    { key: "pipeline", label: "Pipeline" },
    { key: "templates", label: "Templates" },
    ...(can("roles", "view") ? [{ key: "roles", label: "Roles & Permissions" }] : []),
    { key: "audit", label: "Audit Log" },
    ...(can("settings", "manage") ? [{ key: "backup", label: "Backup" }] : []),
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Settings" description="Configure your CRM workspace" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "company" && <CompanyTab />}
      {tab === "statuses" && <OptionsTab kind="lead-statuses" title="Lead Statuses" withOrder />}
      {tab === "sources" && <OptionsTab kind="lead-sources" title="Lead Sources" />}
      {tab === "pipeline" && <PipelineTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "backup" && <BackupTab />}
    </div>
  );
}

/* ---------------- Company ---------------- */

interface CompanyInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  gst?: string;
}

function CompanyTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState<CompanyInfo>({});

  const { data, isLoading } = useQuery({
    queryKey: ["settings-all"],
    queryFn: async () =>
      (await api.get<ApiResponse<Record<string, unknown>>>("/settings")).data.data,
  });

  useEffect(() => {
    if (data?.company) setForm(data.company as CompanyInfo);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await api.put("/settings/company", { value: form })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-all"] });
      toast.success("Company details saved");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const disabled = !can("settings", "update");

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Company Profile</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="co-name">Company Name</Label>
          <Input id="co-name" value={form.name ?? ""} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="co-address">Address</Label>
          <Textarea id="co-address" rows={2} value={form.address ?? ""} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="co-phone">Phone</Label>
            <Input id="co-phone" value={form.phone ?? ""} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="co-email">Email</Label>
            <Input id="co-email" type="email" value={form.email ?? ""} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label htmlFor="co-gst">GST Number</Label>
          <Input id="co-gst" value={form.gst ?? ""} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} />
        </div>
        {!disabled && (
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Statuses / Sources ---------------- */

function OptionsTab({ kind, title, withOrder }: { kind: string; title: string; withOrder?: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("settings", "update");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [deleting, setDeleting] = useState<Option | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [kind],
    queryFn: async () => (await api.get<ApiResponse<Option[]>>(`/settings/${kind}`)).data.data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/settings/${kind}`, {
          name: name.trim(),
          color,
          ...(withOrder && { order: (data?.length ?? 0) }),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [kind] });
      queryClient.invalidateQueries({ queryKey: [kind === "lead-statuses" ? "lead-statuses" : "lead-sources"] });
      setName("");
      toast.success(`${title.slice(0, -2)} added`);
    },
    onError: (err) => toast.error("Could not add", errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/settings/${kind}/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [kind] });
      setDeleting(null);
      toast.success("Deleted");
    },
    onError: (err) => {
      setDeleting(null);
      toast.error("Cannot delete", errorMessage(err));
    },
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {canEdit && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <Label htmlFor={`${kind}-name`}>Name</Label>
              <Input id={`${kind}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot Lead" />
            </div>
            <div>
              <Label htmlFor={`${kind}-color`}>Color</Label>
              <input
                id={`${kind}-color`}
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-card p-1"
                aria-label="Pick color"
              />
            </div>
            <Button disabled={name.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-1.5">
            {data!.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: o.color }} />
                <span className="flex-1 text-sm font-medium">{o.name}</span>
                {o.isSystem && <Badge>System</Badge>}
                {canEdit && !o.isSystem && (
                  <Button size="sm" variant="ghost" aria-label={`Delete ${o.name}`} onClick={() => setDeleting(o)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete "${deleting?.name}"?`}
        description="Only options not in use by any lead can be deleted."
      />
    </Card>
  );
}

/* ---------------- Pipeline stages ---------------- */

function PipelineTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("settings", "update");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [deleting, setDeleting] = useState<Stage | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-stages-settings"],
    queryFn: async () => {
      const stages = (await api.get<ApiResponse<Array<Stage & { leads: unknown[] }>>>("/pipeline")).data.data;
      return stages.map((s) => ({ ...s, leadCount: s.leads.length }));
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pipeline-stages-settings"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    queryClient.invalidateQueries({ queryKey: ["pipeline-stages"] });
  };

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/pipeline/stages", {
          name: name.trim(),
          color,
          order: data?.length ?? 0,
        })
      ).data,
    onSuccess: () => {
      invalidate();
      setName("");
      toast.success("Stage added");
    },
    onError: (err) => toast.error("Could not add stage", errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/pipeline/stages/${id}`)).data,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Stage deleted");
    },
    onError: (err) => {
      setDeleting(null);
      toast.error("Cannot delete", errorMessage(err));
    },
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Pipeline Stages</CardTitle></CardHeader>
      <CardContent>
        {canEdit && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="stage-name">Stage name</Label>
              <Input id="stage-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Documentation" />
            </div>
            <div>
              <Label htmlFor="stage-color">Color</Label>
              <input
                id="stage-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-card p-1"
                aria-label="Pick stage color"
              />
            </div>
            <Button disabled={name.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-1.5">
            {data!.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                {s.isWon && <Badge color="#10B981">Won</Badge>}
                {s.isLost && <Badge color="#EF4444">Lost</Badge>}
                <span className="text-xs text-muted-foreground">{s.leadCount} leads</span>
                {canEdit && (
                  <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete stage "${deleting?.name}"?`}
        description="Stages containing leads cannot be deleted — move the leads first."
      />
    </Card>
  );
}

/* ---------------- Templates ---------------- */

function TemplatesTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("settings", "update");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: "", type: "WHATSAPP", subject: "", body: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await api.get<ApiResponse<Template[]>>("/settings/templates")).data.data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        subject: form.subject.trim() || null,
        body: form.body,
        ...(editing ? {} : { type: form.type }),
      };
      return editing
        ? (await api.patch(`/settings/templates/${editing.id}`, payload)).data
        : (await api.post("/settings/templates", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setFormOpen(false);
      toast.success(editing ? "Template updated" : "Template created");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/settings/templates/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template deleted");
    },
    onError: (err) => toast.error("Delete failed", errorMessage(err)),
  });

  const openForm = (t: Template | null) => {
    setEditing(t);
    setForm({
      name: t?.name ?? "",
      type: t?.type ?? "WHATSAPP",
      subject: t?.subject ?? "",
      body: t?.body ?? "",
    });
    setFormOpen(true);
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Email & WhatsApp Templates</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => openForm(null)}>
            <Plus className="h-4 w-4" /> New Template
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : data!.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No templates yet.</p>
        ) : (
          <div className="space-y-2">
            {data!.map((t) => (
              <div key={t.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{t.name}</p>
                    <Badge color={t.type === "EMAIL" ? "#3B82F6" : "#25D366"}>{t.type}</Badge>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => openForm(t)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {t.subject && <p className="mt-1 text-sm font-medium">{t.subject}</p>}
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Placeholders: {"{{name}}"}, {"{{project}}"}, {"{{date}}"}, {"{{executive}}"}
        </p>
      </CardContent>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Template" : "New Template"} wide>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpl-name">Name *</Label>
              <Input id="tpl-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tpl-type">Type</Label>
              <Select
                id="tpl-type"
                value={form.type}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </Select>
            </div>
          </div>
          {form.type === "EMAIL" && (
            <div>
              <Label htmlFor="tpl-subject">Subject</Label>
              <Input id="tpl-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </div>
          )}
          <div>
            <Label htmlFor="tpl-body">Body *</Label>
            <Textarea id="tpl-body" rows={6} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              disabled={form.name.trim().length < 2 || !form.body.trim()}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/* ---------------- Roles & permissions ---------------- */

interface RolesResponse {
  roles: Array<{
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    userCount: number;
    permissions: string[];
  }>;
  allPermissions: Array<{ id: string; resource: string; action: string }>;
}

function RolesTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("roles", "update");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get<ApiResponse<RolesResponse>>("/roles")).data.data,
  });

  const selectedRole = data?.roles.find((r) => r.id === selectedRoleId) ?? data?.roles[0];

  useEffect(() => {
    if (selectedRole) setDraft(new Set(selectedRole.permissions));
  }, [selectedRole?.id, data]);

  const save = useMutation({
    mutationFn: async () => {
      const permissionIds = data!.allPermissions
        .filter((p) => draft.has(`${p.resource}:${p.action}`))
        .map((p) => p.id);
      return (await api.patch(`/roles/${selectedRole!.id}`, { permissionIds })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success("Permissions saved", "Users get the new permissions on next request.");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  if (isLoading || !data || !selectedRole) return <Skeleton className="h-96 w-full" />;

  const resources = [...new Set(data.allPermissions.map((p) => p.resource))];
  const actions = [...new Set(data.allPermissions.map((p) => p.action))];
  const isSuperAdmin = selectedRole.name === "Super Admin";

  const toggle = (key: string) => {
    setDraft((d) => {
      const next = new Set(d);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" /> Roles & Permissions
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={selectedRole.id}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="w-56"
            aria-label="Select role"
          >
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.userCount} users)
              </option>
            ))}
          </Select>
          {canEdit && !isSuperAdmin && (
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isSuperAdmin ? (
          <p className="rounded-xl bg-accent p-4 text-sm text-accent-foreground">
            Super Admin always has every permission — it cannot be restricted.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Resource</th>
                  {actions.map((a) => (
                    <th key={a} className="px-2 py-2 text-center font-semibold capitalize">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resources.map((res) => (
                  <tr key={res} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium capitalize">{res}</td>
                    {actions.map((a) => {
                      const key = `${res}:${a}`;
                      const exists = data.allPermissions.some((p) => p.resource === res && p.action === a);
                      return (
                        <td key={a} className="px-2 py-2 text-center">
                          {exists ? (
                            <input
                              type="checkbox"
                              aria-label={`${res} ${a}`}
                              checked={draft.has(key)}
                              disabled={!canEdit}
                              onChange={() => toggle(key)}
                              className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))]"
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Audit log ---------------- */

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

function AuditTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: async () =>
      (
        await api.get<ApiResponse<{ items: AuditRow[]; meta: { totalPages: number } }>>(
          "/settings/audit-logs",
          { params: { page, limit: 30 } }
        )
      ).data.data,
  });

  return (
    <Card>
      <CardHeader><CardTitle>Audit Log</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="divide-y">
              {data!.items.map((log) => (
                <div key={log.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Badge color="#3B82F6">{log.action}</Badge>
                  <span className="font-medium">{log.entity}</span>
                  <span className="text-muted-foreground">
                    by {log.user?.name ?? "System"} · {formatDateTime(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
              <span className="text-sm text-muted-foreground">{page} / {data!.meta.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= data!.meta.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Backup ---------------- */

function BackupTab() {
  const toast = useToast();
  const [restoring, setRestoring] = useState(false);

  const download = async () => {
    try {
      const res = await api.get<ApiResponse<Record<string, unknown>>>("/settings/backup");
      const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Backup downloaded");
    } catch (err) {
      toast.error("Backup failed", errorMessage(err));
    }
  };

  const restore = async (file: File) => {
    setRestoring(true);
    try {
      const parsed = JSON.parse(await file.text()) as { settings?: unknown };
      await api.post("/settings/restore", { settings: parsed.settings ?? [] });
      toast.success("Settings restored");
    } catch (err) {
      toast.error("Restore failed", errorMessage(err));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Backup & Restore</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download a JSON snapshot of your configuration (settings, statuses, sources, pipeline,
          templates, integrations). Database-level backups should use <code>pg_dump</code> — see the
          deployment guide.
        </p>
        <div className="flex gap-2">
          <Button onClick={download}>
            <Download className="h-4 w-4" /> Download Backup
          </Button>
          <label>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
            />
            <Button variant="outline" loading={restoring} onClick={(e) => {
              (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
            }}>
              <Upload className="h-4 w-4" /> Restore from file
            </Button>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
