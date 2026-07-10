import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeIndianRupee, FileText, Gift, Paperclip, Plus, Search, Trash2, X } from "lucide-react";
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
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import type { Booking, Customer } from "@/lib/types";

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
  const [detailId, setDetailId] = useState<string | null>(null);

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
        onRowClick={(c) => setDetailId(c.id)}
        meta={data?.meta}
        onPageChange={setPage}
        emptyTitle="No customers yet"
        emptyDescription="Customers are created automatically when a lead books a unit, or add one manually."
      />

      <CustomerDetailDialog customerId={detailId} onClose={() => setDetailId(null)} />

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

/* ------------------------------------------------------------------ */
/* Customer detail — bookings, payments, documents, referrals          */
/* ------------------------------------------------------------------ */

const METHODS = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"];

function paidTotal(b: Booking): number {
  return (b.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
}

function CustomerDetailDialog({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [payFor, setPayFor] = useState<string | null>(null); // bookingId being paid
  const [pay, setPay] = useState({ amount: "", method: "UPI", reference: "" });

  const { data: c, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () =>
      (await api.get<ApiResponse<Customer>>(`/customers/${customerId}`)).data.data,
    enabled: !!customerId,
  });

  // All customers for the "referred by" picker.
  const { data: allCustomers } = useQuery({
    queryKey: ["customers-picker"],
    queryFn: async () =>
      (
        await api.get<ApiResponse<Paginated<Customer>>>("/customers", {
          params: { limit: 100, sortBy: "name", sortOrder: "asc" },
        })
      ).data.data.items,
    enabled: !!customerId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const addPayment = useMutation({
    mutationFn: async (bookingId: string) =>
      (
        await api.post(`/bookings/${bookingId}/payments`, {
          amount: Number(pay.amount),
          method: pay.method,
          reference: pay.reference.trim() || null,
        })
      ).data,
    onSuccess: () => {
      invalidate();
      setPayFor(null);
      setPay({ amount: "", method: "UPI", reference: "" });
      toast.success("Payment recorded");
    },
    onError: (err) => toast.error("Payment failed", errorMessage(err)),
  });

  const setReferrer = useMutation({
    mutationFn: async (referredById: string | null) =>
      (await api.patch(`/customers/${customerId}`, { referredById })).data,
    onSuccess: () => {
      invalidate();
      toast.success("Referral updated");
    },
    onError: (err) => toast.error("Update failed", errorMessage(err)),
  });

  const uploadDoc = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("customerId", customerId!);
    try {
      await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
      invalidate();
      toast.success("Document uploaded");
    } catch (err) {
      toast.error("Upload failed", errorMessage(err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deleteDoc = async (fileId: string) => {
    try {
      await api.delete(`/uploads/${fileId}`);
      invalidate();
      toast.success("Document removed");
    } catch (err) {
      toast.error("Delete failed", errorMessage(err));
    }
  };

  if (!customerId) return null;

  const activeBookings = (c?.bookings ?? []).filter((b) => b.status !== "CANCELLED");
  const totalDeal = activeBookings.reduce((s, b) => s + Number(b.amount), 0);
  const totalPaid = activeBookings.reduce((s, b) => s + paidTotal(b), 0);

  return (
    <Dialog
      open
      onClose={onClose}
      title={c?.name ?? "Customer"}
      description={
        c ? `${c.mobile}${c.email ? " · " + c.email : ""}${c.city ? " · " + c.city : ""}` : undefined
      }
      wide
    >
      {isLoading || !c ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Payment summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border p-3 text-center">
              <p className="text-lg font-bold">{formatINR(totalDeal)}</p>
              <p className="text-xs text-muted-foreground">Total Deal</p>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <p className="text-lg font-bold text-success">{formatINR(totalPaid)}</p>
              <p className="text-xs text-muted-foreground">Received</p>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <p className="text-lg font-bold text-warning">
                {formatINR(Math.max(0, totalDeal - totalPaid))}
              </p>
              <p className="text-xs text-muted-foreground">Balance</p>
            </div>
          </div>

          {c.lead && (
            <p className="text-sm text-muted-foreground">
              Origin lead:{" "}
              <Link
                to={`/leads/${c.lead.id}`}
                onClick={onClose}
                className="font-medium text-primary hover:underline"
              >
                {c.lead.name}
              </Link>
            </p>
          )}

          {/* Bookings + payments */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
              <BadgeIndianRupee className="h-3.5 w-3.5" /> Bookings & Payments
            </p>
            {c.bookings.length === 0 ? (
              <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                No bookings yet — book a unit from the lead page.
              </p>
            ) : (
              <div className="space-y-3">
                {c.bookings.map((b) => {
                  const paidAmt = paidTotal(b);
                  const balance = Math.max(0, Number(b.amount) - paidAmt);
                  const pct = Number(b.amount)
                    ? Math.min(100, Math.round((paidAmt / Number(b.amount)) * 100))
                    : 0;
                  return (
                    <div key={b.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {b.property.title} · {b.property.code}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDate(b.bookingDate)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            color={
                              b.status === "CANCELLED"
                                ? "#EF4444"
                                : b.status === "COMPLETED"
                                  ? "#10B981"
                                  : "#3B82F6"
                            }
                          >
                            {b.status}
                          </Badge>
                          <p className="text-sm font-bold">{formatINR(b.amount)}</p>
                        </div>
                      </div>

                      <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-success transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Received {formatINR(paidAmt)} · Balance {formatINR(balance)}
                      </p>

                      {(b.payments ?? []).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {b.payments!.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5 text-xs"
                            >
                              <span>
                                {formatDate(p.paidAt)} · {p.method.replace("_", " ")}
                                {p.reference ? ` · ${p.reference}` : ""}
                              </span>
                              <span className="font-semibold">{formatINR(p.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {can("bookings", "update") &&
                        b.status !== "CANCELLED" &&
                        (payFor === b.id ? (
                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <div className="w-32">
                              <Label htmlFor={`pay-amt-${b.id}`}>Amount (₹)</Label>
                              <Input
                                id={`pay-amt-${b.id}`}
                                type="number"
                                min={1}
                                value={pay.amount}
                                onChange={(e) => setPay((s) => ({ ...s, amount: e.target.value }))}
                              />
                            </div>
                            <div className="w-36">
                              <Label htmlFor={`pay-m-${b.id}`}>Method</Label>
                              <Select
                                id={`pay-m-${b.id}`}
                                value={pay.method}
                                onChange={(e) => setPay((s) => ({ ...s, method: e.target.value }))}
                              >
                                {METHODS.map((m) => (
                                  <option key={m} value={m}>
                                    {m.replace("_", " ")}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="min-w-[120px] flex-1">
                              <Label htmlFor={`pay-ref-${b.id}`}>Reference / UTR</Label>
                              <Input
                                id={`pay-ref-${b.id}`}
                                value={pay.reference}
                                onChange={(e) => setPay((s) => ({ ...s, reference: e.target.value }))}
                                placeholder="optional"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="success"
                              disabled={!pay.amount || Number(pay.amount) <= 0}
                              loading={addPayment.isPending}
                              onClick={() => addPayment.mutate(b.id)}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setPayFor(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => {
                              setPayFor(b.id);
                              setPay({ amount: balance ? String(balance) : "", method: "UPI", reference: "" });
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Payment
                          </Button>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Documents */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Documents (KYC, agreements)
            </p>
            {(c.files ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            ) : (
              <div className="space-y-1.5">
                {c.files!.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
                    >
                      {f.filename}
                    </a>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    {can("files", "delete") && (
                      <button
                        onClick={() => deleteDoc(f.id)}
                        aria-label={`Delete ${f.filename}`}
                        className="cursor-pointer rounded p-1 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {can("files", "create") && (
              <div className="mt-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0])}
                />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5" /> Upload document
                </Button>
              </div>
            )}
          </div>

          {/* Referral tracking */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
              <Gift className="h-3.5 w-3.5" /> Referral
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ref-by">Referred by</Label>
                <Select
                  id="ref-by"
                  value={c.referredBy?.id ?? ""}
                  disabled={!can("customers", "update")}
                  onChange={(e) => setReferrer.mutate(e.target.value || null)}
                >
                  <option value="">Nobody / direct</option>
                  {allCustomers
                    ?.filter((x) => x.id !== c.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.mobile}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <Label>Customers they referred ({c.referrals?.length ?? 0})</Label>
                {(c.referrals ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <div className="mt-1 space-y-1">
                    {c.referrals!.map((r) => (
                      <p key={r.id} className="rounded-lg bg-muted px-2.5 py-1.5 text-sm">
                        {r.name} <span className="text-xs text-muted-foreground">· {r.mobile}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
