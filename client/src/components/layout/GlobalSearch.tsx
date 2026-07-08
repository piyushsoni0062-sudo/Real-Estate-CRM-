import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Search, UserRound, Users, UsersRound } from "lucide-react";
import { api, ApiResponse } from "@/lib/api";
import { Dialog } from "@/components/ui/primitives";

interface SearchResults {
  leads: Array<{ id: string; name: string; mobile: string; status: { name: string; color: string } }>;
  customers: Array<{ id: string; name: string; mobile: string }>;
  properties: Array<{ id: string; title: string; code: string; status: string }>;
  users: Array<{ id: string; name: string; designation: string | null; role: { name: string } }>;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Debounce keystrokes so we don't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setTerm("");
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: async () => {
      const res = await api.get<ApiResponse<SearchResults>>("/search", {
        params: { q: debounced },
      });
      return res.data.data;
    },
    enabled: open && debounced.length >= 2,
  });

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const hasResults =
    data &&
    (data.leads.length || data.customers.length || data.properties.length || data.users.length);

  return (
    <Dialog open={open} onClose={onClose} title="Global Search">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name, mobile, unit code…"
          aria-label="Search"
          className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
        {debounced.length < 2 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search leads, customers, properties and team.
          </p>
        ) : !isFetching && !hasResults ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No results for “{debounced}”
          </p>
        ) : (
          <>
            {!!data?.leads.length && (
              <Section title="Leads" icon={<UsersRound className="h-3.5 w-3.5" />}>
                {data.leads.map((l) => (
                  <ResultRow
                    key={l.id}
                    onClick={() => go(`/leads/${l.id}`)}
                    primary={l.name}
                    secondary={l.mobile}
                    chip={l.status.name}
                    chipColor={l.status.color}
                  />
                ))}
              </Section>
            )}
            {!!data?.customers.length && (
              <Section title="Customers" icon={<UserRound className="h-3.5 w-3.5" />}>
                {data.customers.map((c) => (
                  <ResultRow
                    key={c.id}
                    onClick={() => go("/customers")}
                    primary={c.name}
                    secondary={c.mobile}
                  />
                ))}
              </Section>
            )}
            {!!data?.properties.length && (
              <Section title="Properties" icon={<Building2 className="h-3.5 w-3.5" />}>
                {data.properties.map((p) => (
                  <ResultRow
                    key={p.id}
                    onClick={() => go(`/properties?focus=${p.id}`)}
                    primary={p.title}
                    secondary={p.code}
                    chip={p.status}
                  />
                ))}
              </Section>
            )}
            {!!data?.users.length && (
              <Section title="Team" icon={<Users className="h-3.5 w-3.5" />}>
                {data.users.map((u) => (
                  <ResultRow
                    key={u.id}
                    onClick={() => go(`/team/${u.id}`)}
                    primary={u.name}
                    secondary={u.designation ?? u.role.name}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ResultRow({
  onClick,
  primary,
  secondary,
  chip,
  chipColor,
}: {
  onClick: () => void;
  primary: string;
  secondary?: string;
  chip?: string;
  chipColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{primary}</span>
        {secondary && <span className="block truncate text-xs text-muted-foreground">{secondary}</span>}
      </span>
      {chip && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={
            chipColor
              ? { backgroundColor: `${chipColor}1A`, color: chipColor }
              : { backgroundColor: "hsl(var(--muted))" }
          }
        >
          {chip}
        </span>
      )}
    </button>
  );
}
