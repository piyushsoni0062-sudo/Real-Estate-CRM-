import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { Button, Dialog, Input, Label, Select } from "./primitives";
import { useToast } from "./toast";

const CREATE_VALUE = "__create__";

/**
 * A native select with an inline "＋ Add new…" entry at the bottom.
 * Picking it opens a mini dialog, calls `onCreate`, then auto-selects the
 * newly created item — no trip to Settings needed.
 */
export function CreatableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "None",
  entityLabel,
  canCreate,
  withColor,
  onCreate,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }> | undefined;
  placeholder?: string;
  /** Singular noun shown in the add option and dialog, e.g. "status", "project". */
  entityLabel: string;
  canCreate: boolean;
  /** Show a color picker in the add dialog (statuses/sources). */
  withColor?: boolean;
  onCreate: (name: string, color?: string) => Promise<{ id: string }>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const created = await onCreate(name.trim(), withColor ? color : undefined);
      onChange(created.id);
      toast.success(`New ${entityLabel} added`, `"${name.trim()}" selected`);
      setOpen(false);
      setName("");
    } catch (err) {
      toast.error(`Could not add ${entityLabel}`, errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Select
        id={id}
        value={value}
        onChange={(e) => {
          if (e.target.value === CREATE_VALUE) {
            e.target.value = value; // keep the current selection visible
            setOpen(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">{placeholder}</option>
        {options?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
        {canCreate && <option value={CREATE_VALUE}>＋ Add new {entityLabel}…</option>}
      </Select>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Add new ${entityLabel}`}>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`${id ?? entityLabel}-new-name`}>Name *</Label>
            <Input
              id={`${id ?? entityLabel}-new-name`}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && submit()}
              placeholder={`New ${entityLabel} name`}
            />
          </div>
          {withColor && (
            <div>
              <Label htmlFor={`${id ?? entityLabel}-new-color`}>Color</Label>
              <input
                id={`${id ?? entityLabel}-new-color`}
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-card p-1"
                aria-label="Pick color"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={name.trim().length < 2} loading={saving} onClick={submit}>
              Add & Select
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
