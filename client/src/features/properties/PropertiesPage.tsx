import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  History,
  ImagePlus,
  MapPin,
  Pencil,
  Plus,
  Ruler,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api, ApiResponse, errorMessage, Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useProjectsList } from "@/lib/lookups";
import { formatINR, formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { CreatableSelect } from "@/components/ui/creatable-select";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  FieldError,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui/primitives";
import type { Project, Property } from "@/lib/types";

const TYPES = ["PLOT", "VILLA", "APARTMENT", "COMMERCIAL", "FARMHOUSE"] as const;
const STATUS_COLOR: Record<Property["status"], string> = {
  AVAILABLE: "#10B981",
  HOLD: "#F59E0B",
  BOOKED: "#3B82F6",
  SOLD: "#6B7280",
};

const propertySchema = z.object({
  title: z.string().min(2, "Title is required"),
  code: z.string().min(1, "Unit code is required"),
  projectId: z.string().optional(),
  type: z.enum(TYPES),
  status: z.enum(["AVAILABLE", "HOLD", "BOOKED", "SOLD"]),
  areaSqft: z.string().optional(),
  price: z.string().min(1, "Price is required").refine((v) => Number(v) > 0, "Price must be positive"),
  city: z.string().optional(),
  location: z.string().optional(),
  facing: z.string().optional(),
  description: z.string().optional(),
  amenities: z.string().optional(),
});
type PropertyFormValues = z.infer<typeof propertySchema>;

const projectSchema = z.object({
  name: z.string().min(2, "Name is required"),
  city: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED"]),
  description: z.string().optional(),
  amenities: z.string().optional(),
});
type ProjectFormValues = z.infer<typeof projectSchema>;

export default function PropertiesPage() {
  const [tab, setTab] = useState("properties");
  return (
    <div className="animate-fade-in">
      <Tabs
        tabs={[
          { key: "properties", label: "Inventory" },
          { key: "projects", label: "Projects" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "properties" ? <PropertiesTab /> : <ProjectsTab />}
    </div>
  );
}

/* ============================ Properties ============================ */

function PropertiesTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { data: projects } = useProjectsList();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [deleting, setDeleting] = useState<Property | null>(null);
  const [detail, setDetail] = useState<Property | null>(null);

  const params = useMemo(
    () => ({
      page,
      limit: 12,
      search: search || undefined,
      type: type || undefined,
      status: status || undefined,
      projectId: projectId || undefined,
    }),
    [page, search, type, status, projectId]
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["properties", params],
    queryFn: async () =>
      (await api.get<ApiResponse<Paginated<Property>>>("/properties", { params })).data.data,
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/properties/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setDeleting(null);
      toast.success("Property deleted");
    },
    onError: (err) => toast.error("Delete failed", errorMessage(err)),
  });

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Property Management"
        description={data ? `${data.meta.total} units in inventory` : undefined}
        actions={
          can("properties", "create") && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Property
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setSearch(searchInput.trim()), setPage(1))}
            placeholder="Search title, code, city…"
            className="pl-9"
            aria-label="Search properties"
          />
        </div>
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-40" aria-label="Filter by type">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40" aria-label="Filter by status">
          <option value="">All status</option>
          {Object.keys(STATUS_COLOR).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPage(1); }} className="w-48" aria-label="Filter by project">
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        {(search || type || status || projectId) && (
          <Button
            variant="ghost"
            onClick={() => { setSearch(""); setSearchInput(""); setType(""); setStatus(""); setProjectId(""); setPage(1); }}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : data!.items.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No properties found"
          description="Add units to your inventory to start booking."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data!.items.map((p) => (
            <Card
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={`View details of ${p.title}`}
              onClick={() => setDetail(p)}
              onKeyDown={(e) => e.key === "Enter" && setDetail(p)}
              className="group cursor-pointer overflow-hidden transition-shadow duration-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative block h-32 w-full overflow-hidden bg-muted">
                {p.images[0] ? (
                  <img
                    src={p.images[0].url}
                    alt={p.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-muted-foreground">
                    <Building2 className="h-10 w-10" />
                  </span>
                )}
                <Badge color={STATUS_COLOR[p.status]} className="absolute left-2 top-2 bg-card">
                  {p.status}
                </Badge>
                <span className="absolute right-2 top-2 hidden items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white group-hover:inline-flex">
                  <Eye className="h-3 w-3" /> View details
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.code} · {p.type}</p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-primary">{formatINR(p.price)}</p>
                </div>
                {(p.project || p.city) && (
                  <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[p.project?.name, p.city].filter(Boolean).join(" · ")}
                  </p>
                )}
                {p.areaSqft && (
                  <p className="mt-1 text-xs text-muted-foreground">{Number(p.areaSqft).toLocaleString("en-IN")} sq.ft.</p>
                )}
                <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetail(p)}>
                    <Eye className="h-3.5 w-3.5" /> Details
                  </Button>
                  {can("properties", "update") && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(p); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {can("properties", "delete") && (
                    <Button size="sm" variant="ghost" aria-label={`Delete ${p.title}`} onClick={() => setDeleting(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {data.meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      <PropertyFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        projects={projects ?? []}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.title}?`}
        description="This unit will be removed from inventory (soft delete)."
      />
      <PropertyDetailDialog
        property={detail}
        onClose={() => setDetail(null)}
        onEdit={(p) => {
          setDetail(null);
          setEditing(p);
          setFormOpen(true);
        }}
      />
    </>
  );
}

function PropertyFormDialog({
  open,
  onClose,
  editing,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  editing: Property | null;
  projects: Project[];
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
  } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    values: {
      title: editing?.title ?? "",
      code: editing?.code ?? "",
      projectId: editing?.projectId ?? "",
      type: editing?.type ?? "PLOT",
      status: editing?.status ?? "AVAILABLE",
      areaSqft: editing?.areaSqft ? String(Number(editing.areaSqft)) : "",
      price: editing ? String(Number(editing.price)) : "",
      city: editing?.city ?? "",
      location: editing?.location ?? "",
      facing: editing?.facing ?? "",
      description: editing?.description ?? "",
      amenities: editing?.amenities.join(", ") ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (values: PropertyFormValues) => {
      const payload = {
        title: values.title.trim(),
        code: values.code.trim().toUpperCase(),
        projectId: values.projectId || null,
        type: values.type,
        status: values.status,
        areaSqft: values.areaSqft ? Number(values.areaSqft) : null,
        price: Number(values.price),
        city: values.city?.trim() || null,
        location: values.location?.trim() || null,
        facing: values.facing?.trim() || null,
        description: values.description?.trim() || null,
        amenities: values.amenities
          ? values.amenities.split(",").map((a) => a.trim()).filter(Boolean)
          : [],
      };
      return editing
        ? (await api.patch(`/properties/${editing.id}`, payload)).data
        : (await api.post("/properties", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      onClose();
      toast.success(editing ? "Property updated" : "Property added");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title={editing ? "Edit Property" : "Add Property"} wide>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-title">Title *</Label>
          <Input id="p-title" placeholder="Plot A-101" {...register("title")} />
          <FieldError message={errors.title?.message} />
        </div>
        <div>
          <Label htmlFor="p-code">Unit Code *</Label>
          <Input id="p-code" placeholder="UNIT-0101" {...register("code")} />
          <FieldError message={errors.code?.message} />
        </div>
        <div>
          <Label htmlFor="p-project">Project</Label>
          <CreatableSelect
            id="p-project"
            value={watch("projectId") ?? ""}
            onChange={(v) => setValue("projectId", v, { shouldDirty: true })}
            options={projects}
            placeholder="Standalone"
            entityLabel="project"
            canCreate={can("properties", "create")}
            onCreate={async (name) => {
              const res = await api.post<ApiResponse<Project>>("/projects", { name });
              await queryClient.invalidateQueries({ queryKey: ["projects-list"] });
              await queryClient.invalidateQueries({ queryKey: ["projects-full"] });
              return res.data.data;
            }}
          />
        </div>
        <div>
          <Label htmlFor="p-type">Type *</Label>
          <Select id="p-type" {...register("type")}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="p-status">Status</Label>
          <Select id="p-status" {...register("status")}>
            {Object.keys(STATUS_COLOR).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="p-price">Price (₹) *</Label>
          <Input id="p-price" type="number" min={0} placeholder="2500000" {...register("price")} />
          <FieldError message={errors.price?.message} />
        </div>
        <div>
          <Label htmlFor="p-area">Area (sq.ft.)</Label>
          <Input id="p-area" type="number" min={0} {...register("areaSqft")} />
        </div>
        <div>
          <Label htmlFor="p-facing">Facing</Label>
          <Input id="p-facing" placeholder="East" {...register("facing")} />
        </div>
        <div>
          <Label htmlFor="p-city">City</Label>
          <Input id="p-city" placeholder="Vrindavan" {...register("city")} />
        </div>
        <div>
          <Label htmlFor="p-location">Location</Label>
          <Input id="p-location" placeholder="Chhatikara Road" {...register("location")} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="p-amenities">Amenities (comma separated)</Label>
          <Input id="p-amenities" placeholder="Corner, Park Facing, Gated" {...register("amenities")} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="p-desc">Description</Label>
          <Textarea id="p-desc" rows={3} {...register("description")} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{editing ? "Save Changes" : "Add Property"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function PropertyDetailDialog({
  property,
  onClose,
  onEdit,
}: {
  property: Property | null;
  onClose: () => void;
  onEdit: (p: Property) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  // Fetch full detail (images, price history, bookings) so the dialog is always fresh.
  const { data } = useQuery({
    queryKey: ["property", property?.id],
    queryFn: async () =>
      (await api.get<ApiResponse<Property>>(`/properties/${property!.id}`)).data.data,
    enabled: !!property,
  });

  const p = data ?? property;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["property", property!.id] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("propertyId", property!.id);
    try {
      await api.post("/uploads", form, { headers: { "Content-Type": "multipart/form-data" } });
      invalidate();
      toast.success("File uploaded");
    } catch (err) {
      toast.error("Upload failed", errorMessage(err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeFile = async (fileId: string) => {
    try {
      await api.delete(`/uploads/${fileId}`);
      invalidate();
      toast.success("File removed");
    } catch (err) {
      toast.error("Delete failed", errorMessage(err));
    }
  };

  const images = p?.images ?? [];
  const photos = images.filter((f) => f.mimeType.startsWith("image/"));
  const documents = images.filter((f) => !f.mimeType.startsWith("image/"));

  // Lightbox keys: Esc closes only the viewer (capture phase beats the Dialog's
  // own Esc handler), arrow keys move between photos.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setLightbox(null);
      }
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft")
        setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [lightbox, photos.length]);

  // Reset the viewer whenever a different property is opened.
  useEffect(() => {
    setLightbox(null);
  }, [property?.id]);

  if (!p) return null;

  return (
    <Dialog open={!!property} onClose={onClose} title={p.title} description={`${p.code} · ${p.type}`} wide>
      {/* Gallery — uniform tiles, click opens the in-app viewer */}
      <div className="mb-5">
        {photos.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-2xl bg-muted text-muted-foreground">
            <Building2 className="h-10 w-10" />
            <p className="text-sm">No photos yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((img, i) => (
              <div key={img.id} className="group relative overflow-hidden rounded-xl border">
                <button
                  onClick={() => setLightbox(i)}
                  aria-label={`View ${img.filename} full size`}
                  className="block h-36 w-full cursor-pointer bg-muted"
                >
                  <img
                    src={img.url}
                    alt={img.filename}
                    loading="lazy"
                    className="h-full w-full object-cover transition-opacity hover:opacity-90"
                  />
                </button>
                {can("files", "delete") && (
                  <button
                    onClick={() => removeFile(img.id)}
                    aria-label={`Delete ${img.filename}`}
                    className="absolute right-1.5 top-1.5 cursor-pointer rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {can("files", "create") && (
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Add photo / brochure
            </Button>
          </div>
        )}
      </div>

      {/* Key facts */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge color={STATUS_COLOR[p.status]}>{p.status}</Badge>
        <Badge>{p.type}</Badge>
        <span className="ml-auto text-xl font-bold text-primary">{formatINR(p.price)}</span>
      </div>

      <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <Ruler className="h-3 w-3" /> Area
          </dt>
          <dd className="mt-0.5 font-medium">
            {p.areaSqft ? `${Number(p.areaSqft).toLocaleString("en-IN")} sq.ft.` : "—"}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <Compass className="h-3 w-3" /> Facing
          </dt>
          <dd className="mt-0.5 font-medium">{p.facing ?? "—"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <Building2 className="h-3 w-3" /> Project
          </dt>
          <dd className="mt-0.5 font-medium">{p.project?.name ?? "Standalone"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <dt className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <MapPin className="h-3 w-3" /> Location
          </dt>
          <dd className="mt-0.5 font-medium">
            {[p.address, p.location, p.city].filter(Boolean).join(", ") || "—"}
          </dd>
        </div>
      </dl>

      {p.description && (
        <p className="mb-5 whitespace-pre-wrap rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          {p.description}
        </p>
      )}

      {p.amenities.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Amenities</p>
          <div className="flex flex-wrap gap-1.5">
            {p.amenities.map((a) => (
              <Badge key={a}>{a}</Badge>
            ))}
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Documents & Brochures</p>
          <div className="space-y-1.5">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline"
                >
                  {doc.filename}
                </a>
                <span className="text-xs text-muted-foreground">{(doc.size / 1024).toFixed(0)} KB</span>
                {can("files", "delete") && (
                  <button
                    onClick={() => removeFile(doc.id)}
                    aria-label={`Delete ${doc.filename}`}
                    className="cursor-pointer rounded p-1 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(p.priceHistory?.length ?? 0) > 1 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
            <History className="h-3 w-3" /> Price History
          </p>
          <div className="space-y-1">
            {p.priceHistory!.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{formatDate(h.createdAt)}</span>
                <span className="font-semibold">{formatINR(h.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-4">
        <p className="text-xs text-muted-foreground">
          {p._count ? `${p._count.siteVisits} site visits · ${p._count.bookings} bookings` : ""}
        </p>
        {can("properties", "update") && (
          <Button size="sm" onClick={() => onEdit(p)}>
            <Pencil className="h-3.5 w-3.5" /> Edit Property
          </Button>
        )}
      </div>

      {/* Full-screen image viewer */}
      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 animate-fade-in"
          role="dialog"
          aria-label={`Photo ${lightbox + 1} of ${photos.length}`}
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
            aria-label="Close photo viewer"
            className="absolute right-4 top-4 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {photos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((lightbox - 1 + photos.length) % photos.length);
              }}
              aria-label="Previous photo"
              className="absolute left-3 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <img
            src={photos[lightbox].url}
            alt={photos[lightbox].filename}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-card"
          />

          {photos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((lightbox + 1) % photos.length);
              }}
              aria-label="Next photo"
              className="absolute right-3 cursor-pointer rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
            {lightbox + 1} / {photos.length} · {photos[lightbox].filename}
          </p>
        </div>
      )}
    </Dialog>
  );
}

/* ============================ Projects ============================ */

function ProjectsTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["projects-full"],
    queryFn: async () =>
      (await api.get<ApiResponse<Paginated<Project>>>("/projects", { params: { limit: 50 } })).data
        .data,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    values: {
      name: editing?.name ?? "",
      city: editing?.city ?? "",
      location: editing?.location ?? "",
      status: editing?.status ?? "ACTIVE",
      description: editing?.description ?? "",
      amenities: editing?.amenities.join(", ") ?? "",
    },
  });

  const save = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const payload = {
        name: values.name.trim(),
        city: values.city?.trim() || null,
        location: values.location?.trim() || null,
        status: values.status,
        description: values.description?.trim() || null,
        amenities: values.amenities
          ? values.amenities.split(",").map((a) => a.trim()).filter(Boolean)
          : [],
      };
      return editing
        ? (await api.patch(`/projects/${editing.id}`, payload)).data
        : (await api.post("/projects", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects-full"] });
      queryClient.invalidateQueries({ queryKey: ["projects-list"] });
      setFormOpen(false);
      toast.success(editing ? "Project updated" : "Project created");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Townships and developments"
        actions={
          can("properties", "create") && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Project
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : data!.items.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No projects yet" description="Create your first project to organise inventory." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data!.items.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {[p.location, p.city].filter(Boolean).join(", ") || "Location TBD"}
                  </p>
                </div>
                <Badge color={p.status === "ACTIVE" ? "#10B981" : p.status === "UPCOMING" ? "#F59E0B" : "#6B7280"}>
                  {p.status}
                </Badge>
              </div>
              {p.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.amenities.slice(0, 4).map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
                {p.amenities.length > 4 && <Badge>+{p.amenities.length - 4}</Badge>}
              </div>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  {p._count?.properties ?? 0} units · {p._count?.leads ?? 0} leads
                </span>
                {can("properties", "update") && (
                  <Button size="sm" variant="outline" onClick={() => { setEditing(p); setFormOpen(true); }}>
                    Edit
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Project" : "Add Project"} wide>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pr-name">Project Name *</Label>
            <Input id="pr-name" placeholder="Krishna Enclave" {...register("name")} />
            <FieldError message={errors.name?.message} />
          </div>
          <div>
            <Label htmlFor="pr-status">Status</Label>
            <Select id="pr-status" {...register("status")}>
              <option value="UPCOMING">Upcoming</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="pr-city">City</Label>
            <Input id="pr-city" placeholder="Vrindavan" {...register("city")} />
          </div>
          <div>
            <Label htmlFor="pr-location">Location</Label>
            <Input id="pr-location" placeholder="Chhatikara Road" {...register("location")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pr-amenities">Amenities (comma separated)</Label>
            <Input id="pr-amenities" placeholder="Clubhouse, Park, Security" {...register("amenities")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pr-desc">Description</Label>
            <Textarea id="pr-desc" rows={3} {...register("description")} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? "Save Changes" : "Create Project"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
