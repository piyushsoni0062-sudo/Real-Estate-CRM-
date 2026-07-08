import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, X } from "lucide-react";
import { api, ApiResponse, errorMessage, Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatINR, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/ui/data-table";
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
} from "@/components/ui/primitives";
import type { Customer } from "@/lib/types";

const customerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  city: z.string().optional(),
  address: z.string().optional(),
});
type CustomerFormValues = z.infer<typeof customerSchema>;

export default function CustomersPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const params = useMemo(() => ({ page, limit: 20, search: search || undefined }), [page, search]);

  const { data, isLoading } = useQuery({
    queryKey: ["customers", params],
    queryFn: async () =>
      (await api.get<ApiResponse<Paginated<Customer>>>("/customers", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/customers/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDeleting(null);
      toast.success("Customer deleted");
    },
    onError: (err) => toast.error("Delete failed", errorMessage(err)),
  });

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <span className="flex items-center gap-3">
          <Avatar name={c.name} size={32} />
          <span>
            <span className="block font-medium">{c.name}</span>
            <span className="block text-xs text-muted-foreground">{c.mobile}</span>
          </span>
        </span>
      ),
    },
    {
      key: "city",
      header: "City",
      className: "hidden md:table-cell",
      render: (c) => <span className="text-sm">{c.city ?? "—"}</span>,
    },
    {
      key: "lead",
      header: "Origin Lead",
      className: "hidden lg:table-cell",
      render: (c) =>
        c.lead ? (
          <Link
            to={`/leads/${c.lead.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-primary hover:underline"
          >
            {c.lead.name}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Direct</span>
        ),
    },
    {
      key: "bookings",
      header: "Bookings",
      render: (c) =>
        c.bookings.length === 0 ? (
          <span className="text-sm text-muted-foreground">None</span>
        ) : (
          <span>
            <span className="text-sm font-semibold">
              {formatINR(c.bookings.reduce((s, b) => s + Number(b.amount), 0))}
            </span>
            <span className="ml-1.5">
              <Badge>{c.bookings.length}</Badge>
            </span>
          </span>
        ),
    },
    {
      key: "createdAt",
      header: "Since",
      className: "hidden sm:table-cell",
      render: (c) => <span className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (c) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {can("customers", "update") && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(c); setFormOpen(true); }}>
              Edit
            </Button>
          )}
          {can("customers", "delete") && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(c)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Customers"
        description={data ? `${data.meta.total} customers` : undefined}
        actions={
          can("customers", "create") && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Customer
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
            placeholder="Search name, mobile, city…"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
        <Button variant="outline" onClick={() => { setSearch(searchInput.trim()); setPage(1); }}>
          Search
        </Button>
        {search && (
          <Button variant="ghost" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(c) => c.id}
        loading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle="No customers yet"
        emptyDescription="Customers are created automatically when a lead books a unit, or add one manually."
      />

      <CustomerFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        description="The customer record is soft-deleted; bookings remain intact."
      />
    </div>
  );
}

function CustomerFormDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Customer | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    values: {
      name: editing?.name ?? "",
      mobile: editing?.mobile ?? "",
      email: editing?.email ?? "",
      city: editing?.city ?? "",
      address: editing?.address ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const payload = {
        name: values.name.trim(),
        mobile: values.mobile,
        email: values.email?.trim() || null,
        city: values.city?.trim() || null,
        address: values.address?.trim() || null,
      };
      return editing
        ? (await api.patch(`/customers/${editing.id}`, payload)).data
        : (await api.post("/customers", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onClose();
      toast.success(editing ? "Customer updated" : "Customer added");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title={editing ? "Edit Customer" : "Add Customer"}>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
        <div>
          <Label htmlFor="c-name">Name *</Label>
          <Input id="c-name" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="c-mobile">Mobile *</Label>
          <Input id="c-mobile" type="tel" maxLength={10} {...register("mobile")} />
          <FieldError message={errors.mobile?.message} />
        </div>
        <div>
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" type="email" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="c-city">City</Label>
            <Input id="c-city" {...register("city")} />
          </div>
          <div>
            <Label htmlFor="c-address">Address</Label>
            <Input id="c-address" {...register("address")} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{editing ? "Save Changes" : "Add Customer"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
