import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatINR, timeAgo } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Avatar,
  Button,
  Dialog,
  ErrorState,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";

interface KanbanLead {
  id: string;
  name: string;
  mobile: string;
  budget: string | null;
  updatedAt: string;
  assignedTo: { id: string; name: string; avatarUrl: string | null } | null;
  source: { name: string; color: string };
  project: { name: string } | null;
}

interface KanbanStage {
  id: string;
  name: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  leads: KanbanLead[];
}

export default function PipelinePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canMove = can("leads", "update");

  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ leadId: string; stageId: string } | null>(null);
  const [lostReason, setLostReason] = useState("");

  const { data: stages, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pipeline"],
    queryFn: async () => (await api.get<ApiResponse<KanbanStage[]>>("/pipeline")).data.data,
  });

  const move = useMutation({
    mutationFn: async (body: { leadId: string; stageId: string; lostReason?: string }) =>
      (await api.post("/pipeline/move", body)).data,
    // Optimistic update: move the card immediately.
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ["pipeline"] });
      const prev = queryClient.getQueryData<KanbanStage[]>(["pipeline"]);
      if (prev) {
        const next = prev.map((s) => ({ ...s, leads: [...s.leads] }));
        let moved: KanbanLead | undefined;
        for (const s of next) {
          const i = s.leads.findIndex((l) => l.id === body.leadId);
          if (i >= 0) [moved] = s.leads.splice(i, 1);
        }
        if (moved) next.find((s) => s.id === body.stageId)?.leads.unshift(moved);
        queryClient.setQueryData(["pipeline"], next);
      }
      return { prev };
    },
    onError: (err, _b, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["pipeline"], ctx.prev);
      toast.error("Could not move lead", errorMessage(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const onDrop = (stage: KanbanStage) => {
    setOverStage(null);
    if (!dragLeadId) return;
    const fromStage = stages?.find((s) => s.leads.some((l) => l.id === dragLeadId));
    if (fromStage?.id === stage.id) return;
    if (stage.isLost) {
      setLostPrompt({ leadId: dragLeadId, stageId: stage.id });
    } else {
      move.mutate({ leadId: dragLeadId, stageId: stage.id });
    }
    setDragLeadId(null);
  };

  if (isError) {
    return (
      <>
        <PageHeader title="Sales Pipeline" />
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </>
    );
  }

  const totalLeads = stages?.reduce((sum, s) => sum + s.leads.length, 0) ?? 0;

  return (
    <div className="flex h-full flex-col animate-fade-in">
      <PageHeader
        title="Sales Pipeline"
        description={
          canMove
            ? `${totalLeads} leads on the board — drag cards between stages`
            : `${totalLeads} leads on the board`
        }
      />

      <div className="-mx-4 flex flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-72 shrink-0">
                <Skeleton className="h-96 w-full" />
              </div>
            ))
          : stages?.map((stage) => (
              <section
                key={stage.id}
                aria-label={`${stage.name} stage`}
                onDragOver={(e) => {
                  if (!canMove) return;
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={() => canMove && onDrop(stage)}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/40 transition-colors",
                  overStage === stage.id && "border-primary bg-primary/5"
                )}
              >
                <header className="flex items-center gap-2 p-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <h2 className="text-sm font-semibold">{stage.name}</h2>
                  <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground shadow-sm">
                    {stage.leads.length}
                  </span>
                </header>

                <div className="flex-1 space-y-2 overflow-y-auto p-2 pt-0">
                  {stage.leads.length === 0 && (
                    <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Drop leads here
                    </p>
                  )}
                  {stage.leads.map((lead) => (
                    <article
                      key={lead.id}
                      draggable={canMove}
                      onDragStart={() => setDragLeadId(lead.id)}
                      onDragEnd={() => setDragLeadId(null)}
                      className={cn(
                        "group rounded-xl border bg-card p-3 shadow-soft transition-shadow",
                        canMove && "cursor-grab active:cursor-grabbing",
                        dragLeadId === lead.id && "opacity-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/leads/${lead.id}`}
                          className="min-w-0 text-sm font-semibold hover:text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.name}
                        </Link>
                        {canMove && (
                          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{lead.mobile}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: `${lead.source.color}1A`, color: lead.source.color }}
                        >
                          {lead.source.name}
                        </span>
                        {lead.budget && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {formatINR(lead.budget)}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        {lead.assignedTo ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Avatar name={lead.assignedTo.name} src={lead.assignedTo.avatarUrl} size={20} />
                            {lead.assignedTo.name.split(" ")[0]}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                        <span className="text-[11px] text-muted-foreground">{timeAgo(lead.updatedAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
      </div>

      {/* Lost reason prompt */}
      <Dialog
        open={!!lostPrompt}
        onClose={() => setLostPrompt(null)}
        title="Why was this lead lost?"
        description="Lost reasons power the Lost Reason Analysis report"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="lost-reason">Reason</Label>
            <Textarea
              id="lost-reason"
              rows={2}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="e.g. Budget mismatch, bought elsewhere…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLostPrompt(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (lostPrompt) {
                  move.mutate({ ...lostPrompt, lostReason: lostReason.trim() || undefined });
                }
                setLostPrompt(null);
                setLostReason("");
              }}
            >
              Move to Lost
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
