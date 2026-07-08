import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/primitives";
import { LeadForm, toPayload } from "./LeadForm";
import type { Lead } from "@/lib/types";

export function QuickAddLead({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createLead = useMutation({
    mutationFn: async (payload: ReturnType<typeof toPayload>) =>
      (await api.post<ApiResponse<Lead>>("/leads", payload)).data.data,
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Lead created", `${lead.name} added successfully`);
      onClose();
      navigate(`/leads/${lead.id}`);
    },
    onError: (err) => toast.error("Could not create lead", errorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Quick Add Lead" description="Capture a new enquiry" wide>
      <LeadForm
        onSubmit={(p) => createLead.mutate(p)}
        submitting={createLead.isPending}
        submitLabel="Create Lead"
      />
    </Dialog>
  );
}
