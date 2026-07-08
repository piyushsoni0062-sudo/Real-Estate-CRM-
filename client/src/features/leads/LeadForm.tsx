import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLeadSources, useLeadStatuses, useProjectsList, useUsersList } from "@/lib/lookups";
import { Button, FieldError, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { CreatableSelect } from "@/components/ui/creatable-select";
import type { Lead, Option, Project } from "@/lib/types";

export const leadSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  city: z.string().optional(),
  budget: z.string().optional(),
  propertySize: z.string().optional(),
  requirement: z.string().optional(),
  propertyType: z.string().optional(),
  statusId: z.string().optional(),
  sourceId: z.string().optional(),
  assignedToId: z.string().optional(),
  projectId: z.string().optional(),
});
export type LeadFormValues = z.infer<typeof leadSchema>;

const PROPERTY_TYPES = ["PLOT", "VILLA", "APARTMENT", "COMMERCIAL", "FARMHOUSE"];

export function toPayload(values: LeadFormValues) {
  return {
    name: values.name.trim(),
    mobile: values.mobile,
    email: values.email?.trim() || null,
    city: values.city?.trim() || null,
    budget: values.budget ? Number(values.budget) : null,
    propertySize: values.propertySize?.trim() || null,
    requirement: values.requirement?.trim() || null,
    propertyType: values.propertyType || null,
    statusId: values.statusId || undefined,
    sourceId: values.sourceId || undefined,
    assignedToId: values.assignedToId || null,
    projectId: values.projectId || null,
  };
}

export function LeadForm({
  initial,
  onSubmit,
  submitting,
  submitLabel = "Save Lead",
}: {
  initial?: Partial<Lead>;
  onSubmit: (payload: ReturnType<typeof toPayload>) => void;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const { data: statuses } = useLeadStatuses();
  const { data: sources } = useLeadSources();
  const { data: users } = useUsersList();
  const { data: projects } = useProjectsList();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: initial?.name ?? "",
      mobile: initial?.mobile ?? "",
      email: initial?.email ?? "",
      city: initial?.city ?? "",
      budget: initial?.budget ? String(Number(initial.budget)) : "",
      propertySize: initial?.propertySize ?? "",
      requirement: initial?.requirement ?? "",
      propertyType: initial?.propertyType ?? "",
      statusId: initial?.statusId ?? "",
      sourceId: initial?.sourceId ?? "",
      assignedToId: initial?.assignedToId ?? "",
      projectId: initial?.projectId ?? "",
    },
  });

  // Inline "add new" creators for the dropdowns below.
  const createStatus = async (name: string, color?: string) => {
    const res = await api.post<ApiResponse<Option>>("/settings/lead-statuses", { name, color });
    await queryClient.invalidateQueries({ queryKey: ["lead-statuses"] });
    return res.data.data;
  };
  const createSource = async (name: string, color?: string) => {
    const res = await api.post<ApiResponse<Option>>("/settings/lead-sources", { name, color });
    await queryClient.invalidateQueries({ queryKey: ["lead-sources"] });
    return res.data.data;
  };
  const createProject = async (name: string) => {
    const res = await api.post<ApiResponse<Project>>("/projects", { name });
    await queryClient.invalidateQueries({ queryKey: ["projects-list"] });
    await queryClient.invalidateQueries({ queryKey: ["projects-full"] });
    return res.data.data;
  };

  // Live duplicate detection on the mobile field.
  const mobile = watch("mobile");
  useEffect(() => {
    if (!/^[6-9]\d{9}$/.test(mobile) || mobile === initial?.mobile) {
      setDuplicate(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<ApiResponse<{ duplicate: { id: string; name: string } | null }>>(
          "/leads/check-duplicate",
          { params: { mobile, excludeId: initial?.id } }
        );
        setDuplicate(res.data.data.duplicate);
      } catch {
        setDuplicate(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [mobile, initial?.id, initial?.mobile]);

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toPayload(v)))} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-name">Full Name *</Label>
          <Input id="lead-name" placeholder="Ramesh Sharma" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="lead-mobile">Mobile *</Label>
          <Input id="lead-mobile" type="tel" maxLength={10} placeholder="9876543210" {...register("mobile")} />
          <FieldError message={errors.mobile?.message} />
          {duplicate && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              Duplicate: this mobile belongs to “{duplicate.name}”
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="lead-email">Email</Label>
          <Input id="lead-email" type="email" placeholder="name@example.com" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="lead-city">City</Label>
          <Input id="lead-city" placeholder="Mathura" {...register("city")} />
        </div>
        <div>
          <Label htmlFor="lead-budget">Budget (₹)</Label>
          <Input id="lead-budget" type="number" min={0} placeholder="2500000" {...register("budget")} />
        </div>
        <div>
          <Label htmlFor="lead-size">Property Size</Label>
          <Input id="lead-size" placeholder="100 gaj / 2000 sq.ft." {...register("propertySize")} />
        </div>
        <div>
          <Label htmlFor="lead-ptype">Property Type</Label>
          <Select id="lead-ptype" {...register("propertyType")}>
            <option value="">Any</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="lead-project">Interested Project</Label>
          <CreatableSelect
            id="lead-project"
            value={watch("projectId") ?? ""}
            onChange={(v) => setValue("projectId", v, { shouldDirty: true })}
            options={projects}
            placeholder="None"
            entityLabel="project"
            canCreate={can("properties", "create")}
            onCreate={createProject}
          />
        </div>
        <div>
          <Label htmlFor="lead-status">Status</Label>
          <CreatableSelect
            id="lead-status"
            value={watch("statusId") ?? ""}
            onChange={(v) => setValue("statusId", v, { shouldDirty: true })}
            options={statuses}
            placeholder="Default (New)"
            entityLabel="status"
            canCreate={can("settings", "update")}
            withColor
            onCreate={createStatus}
          />
        </div>
        <div>
          <Label htmlFor="lead-source">Source</Label>
          <CreatableSelect
            id="lead-source"
            value={watch("sourceId") ?? ""}
            onChange={(v) => setValue("sourceId", v, { shouldDirty: true })}
            options={sources}
            placeholder="Manual"
            entityLabel="source"
            canCreate={can("settings", "update")}
            withColor
            onCreate={createSource}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="lead-assignee">Assign To</Label>
          <Select id="lead-assignee" {...register("assignedToId")}>
            <option value="">Unassigned</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role.name})
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="lead-req">Requirement</Label>
          <Textarea id="lead-req" rows={3} placeholder="What is the customer looking for?" {...register("requirement")} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
