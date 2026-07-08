import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Download, Filter, Plus, Search, Upload, UsersRound, X } from "lucide-react";
import * as XLSX from "xlsx";
import { api, ApiResponse, errorMessage, Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLeadSources, useLeadStatuses, useUsersList } from "@/lib/lookups";
import { formatINR, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Input,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { QuickAddLead } from "./QuickAddLead";
import type { Lead } from "@/lib/types";

interface Filters {
  search: string;
  statusId: string;
  sourceId: string;
  assignedToId: string;
  page: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

const DEFAULT_FILTERS: Filters = {
  search: "",
  statusId: "",
  sourceId: "",
  assignedToId: "",
  page: 1,
  sortBy: "createdAt",
  sortOrder: "desc",
};

export default function LeadsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: statuses } = useLeadStatuses();
  const { data: sources } = useLeadSources();
  const { data: users } = useUsersList();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const params = useMemo(
    () => ({
      page: filters.page,
      limit: 20,
      search: filters.search || undefined,
      statusId: filters.statusId || undefined,
      sourceId: filters.sourceId || undefined,
      assignedToId: filters.assignedToId || undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
    [filters]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["leads", params],
    queryFn: async () =>
      (await api.get<ApiResponse<Paginated<Lead>>>("/leads", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const bulkAction = useMutation({
    mutationFn: async (body: {
      ids: string[];
      action: "assign" | "delete";
      assignedToId?: string;
    }) => (await api.post("/leads/bulk", body)).data,
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSelected(new Set());
      setBulkAssignOpen(false);
      setBulkDeleteOpen(false);
      toast.success(vars.action === "assign" ? "Leads assigned" : "Leads deleted");
    },
    onError: (err) => toast.error("Bulk action failed", errorMessage(err)),
  });

  const applySearch = () => setFilters((f) => ({ ...f, search: searchInput.trim(), page: 1 }));

  const onSort = (key: string) =>
    setFilters((f) => ({
      ...f,
      sortBy: key,
      sortOrder: f.sortBy === key && f.sortOrder === "desc" ? "asc" : "desc",
    }));

  const exportExcel = async () => {
    try {
      const res = await api.get<ApiResponse<Record<string, string>[]>>("/leads/export", { params });
      const ws = XLSX.utils.json_to_sheet(res.data.data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, `leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Export ready", `${res.data.data.length} leads exported`);
    } catch (err) {
      toast.error("Export failed", errorMessage(err));
    }
  };

  const importExcel = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const mapped = rows
        .map((r) => ({
          name: String(r.Name ?? r.name ?? "").trim(),
          mobile: String(r.Mobile ?? r.mobile ?? "").trim(),
          email: r.Email ?? r.email ? String(r.Email ?? r.email) : undefined,
          city: r.City ?? r.city ? String(r.City ?? r.city) : undefined,
          requirement: r.Requirement ?? r.requirement ? String(r.Requirement ?? r.requirement) : undefined,
          source: r.Source ?? r.source ? String(r.Source ?? r.source) : undefined,
        }))
        .filter((r) => r.name && r.mobile);
      if (mapped.length === 0) {
        toast.error("Nothing to import", "Sheet needs Name and Mobile columns.");
        return;
      }
      const res = await api.post<ApiResponse<{ created: number; skipped: Array<{ row: number; reason: string }> }>>(
        "/leads/import",
        { rows: mapped }
      );
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        `Imported ${res.data.data.created} leads`,
        res.data.data.skipped.length ? `${res.data.data.skipped.length} rows skipped (duplicates/invalid)` : undefined
      );
    } catch (err) {
      toast.error("Import failed", errorMessage(err));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const columns: Column<Lead>[] = [
    {
      key: "name",
      header: "Lead",
      sortable: true,
      render: (l) => (
        <div>
          <p className="font-medium">{l.name}</p>
          <p className="text-xs text-muted-foreground">{l.mobile}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (l) => <Badge color={l.status.color}>{l.status.name}</Badge>,
    },
    {
      key: "source",
      header: "Source",
      className: "hidden md:table-cell",
      render: (l) => <Badge color={l.source.color}>{l.source.name}</Badge>,
    },
    {
      key: "budget",
      header: "Budget",
      className: "hidden lg:table-cell",
      render: (l) =>
        l.budget ? (
          <span className="text-sm">
            {formatINR(l.budget)}
            {l.propertySize && (
              <span className="block text-xs text-muted-foreground">{l.propertySize}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{l.propertySize ?? "—"}</span>
        ),
    },
    {
      key: "assignedTo",
      header: "Assigned",
      className: "hidden sm:table-cell",
      render: (l) =>
        l.assignedTo ? (
          <span className="flex items-center gap-2">
            <Avatar name={l.assignedTo.name} src={l.assignedTo.avatarUrl} size={24} />
            <span className="text-sm">{l.assignedTo.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      className: "hidden md:table-cell",
      render: (l) => <span className="text-sm text-muted-foreground">{formatDate(l.createdAt)}</span>,
    },
  ];

  const activeFilterCount = [filters.statusId, filters.sourceId, filters.assignedToId].filter(Boolean).length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Lead Management"
        description={data ? `${data.meta.total} leads in your funnel` : undefined}
        actions={
          <>
            {can("leads", "import") && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && importExcel(e.target.files[0])}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()} loading={importing}>
                  <Upload className="h-4 w-4" /> Import
                </Button>
              </>
            )}
            {can("leads", "export") && (
              <Button variant="outline" onClick={exportExcel}>
                <Download className="h-4 w-4" /> Export
              </Button>
            )}
            {can("leads", "create") && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add Lead
              </Button>
            )}
          </>
        }
      />

      {/* Search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder="Search name, mobile, email…"
            className="pl-9"
            aria-label="Search leads"
          />
        </div>
        <Button variant="outline" onClick={applySearch}>
          Search
        </Button>
        <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters((s) => !s)}>
          <Filter className="h-4 w-4" />
          Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </Button>
        {(filters.search || activeFilterCount > 0) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setSearchInput("");
            }}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="mb-4 grid gap-3 rounded-2xl border bg-card p-4 shadow-soft sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Status</label>
            <Select
              value={filters.statusId}
              onChange={(e) => setFilters((f) => ({ ...f, statusId: e.target.value, page: 1 }))}
            >
              <option value="">All statuses</option>
              {statuses?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Source</label>
            <Select
              value={filters.sourceId}
              onChange={(e) => setFilters((f) => ({ ...f, sourceId: e.target.value, page: 1 }))}
            >
              <option value="">All sources</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Assignee</label>
            <Select
              value={filters.assignedToId}
              onChange={(e) => setFilters((f) => ({ ...f, assignedToId: e.target.value, page: 1 }))}
            >
              <option value="">Anyone</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-accent px-4 py-2.5">
          <p className="text-sm font-medium text-accent-foreground">{selected.size} selected</p>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBulkAssignOpen(true)}>
              Assign
            </Button>
            {can("leads", "delete") && (
              <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(l) => l.id}
        loading={isLoading}
        onRowClick={(l) => navigate(`/leads/${l.id}`)}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onSort={onSort}
        selectable={can("leads", "update")}
        selected={selected}
        onSelectChange={setSelected}
        meta={data?.meta}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
        emptyTitle="No leads found"
        emptyDescription="Try adjusting filters, or add your first lead."
      />

      <QuickAddLead open={addOpen} onClose={() => setAddOpen(false)} />

      <Dialog
        open={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        title={`Assign ${selected.size} leads`}
      >
        <div className="space-y-4">
          <Select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} aria-label="Choose assignee">
            <option value="">Choose team member…</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role.name})</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkAssignOpen(false)}>Cancel</Button>
            <Button
              disabled={!bulkAssignee}
              loading={bulkAction.isPending}
              onClick={() =>
                bulkAction.mutate({ ids: [...selected], action: "assign", assignedToId: bulkAssignee })
              }
            >
              <UsersRound className="h-4 w-4" /> Assign
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkAction.mutate({ ids: [...selected], action: "delete" })}
        loading={bulkAction.isPending}
        title={`Delete ${selected.size} leads?`}
        description="Leads are soft-deleted and their history is preserved in the audit log."
      />
    </div>
  );
}
