import { useState } from "react";
import { EllipsisVertical, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Menu } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, pluralize } from "@/lib/format";
import { slugify } from "@/lib/slug";

interface Label {
  id: string;
  name: string;
  slug: string;
  postCount: number;
  createdAt: string;
}

interface LabelInput {
  name: string;
  slug: string;
}

interface TaxonomyCanvasProps {
  singular: string;
  plural: string;
  title: string;
  description: string;
  emptyDescription: string;
  icon: LucideIcon;
  nameMaxLength: number;
  slugMaxLength: number;
  slugHint: string;
  list: () => Promise<Label[]>;
  create: (input: LabelInput) => Promise<Label>;
  update: (id: string, input: LabelInput) => Promise<Label>;
  remove: (id: string) => Promise<void>;
}

/** Shared CRUD flow for reusable post labels; feature wrappers own API and copy. */
export function TaxonomyCanvas({
  singular,
  plural,
  title,
  description,
  emptyDescription,
  icon,
  nameMaxLength,
  slugMaxLength,
  slugHint,
  list,
  create,
  update,
  remove,
}: TaxonomyCanvasProps) {
  const toast = useToast();
  const labels = useAsync(list, [list]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Label | "new" | null>(null);
  const [deleting, setDeleting] = useState<Label | null>(null);

  const needle = query.trim().toLowerCase();
  const rows = (labels.data ?? []).filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.slug.toLowerCase().includes(needle));

  const columns: DataTableColumn<Label>[] = [
    {
      key: "name",
      header: "Name",
      render: (label) => (
        <span
          title={label.name}
          className="btn max-w-full !cursor-default bg-hover !normal-case !tracking-normal text-muted"
        >
          <span className="min-w-0 truncate">{label.name}</span>
        </span>
      ),
    },
    { key: "slug", header: "Slug", render: (label) => <span className="[overflow-wrap:anywhere] font-mono text-[11.5px] text-secondary">{label.slug}</span> },
    {
      key: "posts",
      header: "Posts",
      width: "90px",
      align: "right",
      render: (label) => <span className="font-mono text-[11.5px] tabular-nums">{label.postCount}</span>,
    },
    { key: "created", header: "Added", width: "120px", render: (label) => <span className="text-secondary">{formatDate(label.createdAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "48px",
      align: "right",
      render: (label) => (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
          <Menu
            items={[
              { label: "Rename", icon: Pencil, onSelect: () => setEditing(label) },
              { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(label) },
            ]}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-label={`Actions for ${label.name}`}
                className="cursor-pointer rounded-sm p-1 text-muted hover:bg-hover hover:text-ink"
              >
                <EllipsisVertical size={15} />
              </button>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 p-[var(--page-pad)]">
      <PageHeader
        title={title}
        description={description}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden /> New {singular}
          </button>
        }
      />

      <div className="rounded-lg border-[1.5px] border-line bg-card shadow-card">
        <div className="border-b border-line px-3.5 py-3">
          <div className="max-w-[320px]">
            <SearchInput label={`Search ${plural}`} placeholder={`Search ${plural}`} value={query} onChange={setQuery} />
          </div>
        </div>
        <div className="overflow-x-auto px-1">
          {labels.error ? (
            <div className="p-4">
              <ErrorState title={`Couldn't load ${plural}`} error={labels.error} onRetry={labels.reload} />
            </div>
          ) : labels.data && rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={icon}
                title={needle ? `No ${plural} match` : `No ${plural} yet`}
                description={needle ? "Try another search." : emptyDescription}
              />
            </div>
          ) : (
            <div className="min-w-[560px]">
              <DataTable
                caption={title}
                columns={columns}
                rows={rows}
                rowKey={(t) => t.id}
                onRowClick={setEditing}
                loading={labels.loading}
                skeletonRows={5}
              />
            </div>
          )}
        </div>
      </div>

      {editing && (
        <LabelDialog
          singular={singular}
          nameMaxLength={nameMaxLength}
          slugMaxLength={slugMaxLength}
          slugHint={slugHint}
          create={create}
          update={update}
          label={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            toast.success(isNew ? `Created ${singular} “${saved.name}”.` : `Updated ${singular} “${saved.name}”.`);
            labels.reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message={
            deleting.postCount > 0
              ? `It will be removed from ${pluralize(deleting.postCount, "post")}. The posts themselves stay.`
              : `No posts use this ${singular}.`
          }
          confirmLabel="Delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await remove(deleting.id);
              toast.success(`Deleted ${singular} “${deleting.name}”.`);
              labels.reload();
            } catch (error) {
              toast.error((error as Error).message);
              throw error;
            }
          }}
        />
      )}
    </div>
  );
}

type LabelDialogProps = Pick<TaxonomyCanvasProps, "singular" | "nameMaxLength" | "slugMaxLength" | "slugHint" | "create" | "update"> & {
  label: Label | null;
  onClose: () => void;
  onSaved: (label: Label, isNew: boolean) => void;
};

function LabelDialog({
  label,
  singular,
  nameMaxLength,
  slugMaxLength,
  slugHint,
  create,
  update,
  onClose,
  onSaved,
}: LabelDialogProps) {
  const [name, setName] = useState(label?.name ?? "");
  const [slug, setSlug] = useState(label?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(label));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(undefined);
    const input = { name, slug: slug || slugify(name) };
    try {
      const saved = label ? await update(label.id, input) : await create(input);
      onSaved(saved, !label);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={label ? `Rename ${singular}` : `New ${singular}`}
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving && <Spinner size={12} />}
            {label ? "Save" : `Create ${singular}`}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" htmlFor={`${singular}-name`}>
          <input
            id={`${singular}-name`}
            className="input"
            value={name}
            maxLength={nameMaxLength}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
          />
        </Field>
        <Field label="Slug" htmlFor={`${singular}-slug`} hint={slugHint}>
          <input
            id={`${singular}-slug`}
            className="input font-mono !text-[12px]"
            maxLength={slugMaxLength}
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
            }}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-error-bg px-3 py-2 text-[12px] text-error-text">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
