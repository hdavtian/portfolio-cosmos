import type { Technology } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import {
  CheckBoxSelection,
  Inject,
  ListBoxComponent,
  MultiSelectComponent,
} from "@syncfusion/ej2-react-dropdowns";
import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useAllEntities } from "../lib/entityApi";

interface TechnologyPickerProps {
  /** Slugs of the chosen technologies, in the order they show on the sites. */
  value: string[];
  onChange: (slugs: string[]) => void;
}

interface Choice {
  slug: string;
  name: string;
  /** Name plus every alias, so typing an old label still finds the record. */
  search: string;
}

// One object, not a literal per render: Syncfusion rebinds when a prop's
// identity changes, and rebinding a multi-select drops its selection.
const FIELDS = { text: "name", value: "slug" };
const LIST_FIELDS = { text: "name", value: "slug" };

/**
 * Picks technologies from the master list (Admin -> Technologies) and orders
 * them. The top control is for choosing: tick as many as you like, in any
 * order, searching by name or by any old name the record absorbed. The list
 * underneath is the chosen ones in the order the sites will show them; drag a
 * row to move it. Headings are not offered - a project is tagged with skills.
 */
export function TechnologyPicker({ value, onChange }: TechnologyPickerProps) {
  const list = useAllEntities<Technology>("technologies");
  const choices = useMemo<Choice[]>(
    () =>
      (list.items ?? [])
        .filter((record) => !record.isGrouping)
        .map((record) => ({
          slug: record.slug,
          name: record.name,
          search: [record.name, ...(record.aliases ?? [])].join(" ").toLowerCase(),
        })),
    [list.items],
  );
  const nameBySlug = useMemo(() => new Map(choices.map((choice) => [choice.slug, choice.name])), [choices]);

  // Chosen slugs the list no longer knows (deleted since) are kept in the
  // value so a save does not silently drop them, but shown by slug.
  const ordered = useMemo(
    () => value.map((slug) => ({ slug, name: nameBySlug.get(slug) ?? `${slug} (no longer in the list)` })),
    [value, nameBySlug],
  );

  const listRef = useRef<ListBoxComponent>(null);

  // Syncfusion's own filter only looks at the text field; this one also reads
  // the aliases, and hands the control the narrowed set.
  const filtering = (event: { text: string; updateData: (data: Choice[]) => void; preventDefaultAction?: boolean }) => {
    const term = event.text.trim().toLowerCase();
    event.preventDefaultAction = true;
    event.updateData(term ? choices.filter((choice) => choice.search.includes(term)) : choices);
  };

  // Ticking adds to the end; unticking removes; the order of what was already
  // there is kept, because that order is the sites' order.
  const onPick = (event: { value: string[] | null; isInteracted?: boolean }) => {
    if (!event.isInteracted) return;
    const picked = new Set(event.value ?? []);
    const kept = value.filter((slug) => picked.has(slug));
    const added = [...picked].filter((slug) => !value.includes(slug));
    onChange([...kept, ...added]);
  };

  // The list box reorders its own data source on a drop; read the new order
  // back from it rather than trying to compute where the row landed.
  const onDrop = () => {
    window.setTimeout(() => {
      const items = (listRef.current?.getDataList?.() as Choice[] | undefined) ?? [];
      const slugs = items.map((item) => item.slug);
      if (slugs.length === value.length && slugs.some((slug, index) => slug !== value[index])) onChange(slugs);
    }, 0);
  };

  const removeSelected = () => {
    // `value` is the public view of the selection: the chosen rows' slugs.
    const selected = (listRef.current?.value ?? []) as string[];
    if (selected.length === 0) return;
    const gone = new Set(selected);
    onChange(value.filter((slug) => !gone.has(slug)));
  };

  return (
    <div className="admin-tech-picker">
      <MultiSelectComponent
        dataSource={choices as unknown as { [key: string]: object }[]}
        fields={FIELDS}
        mode="CheckBox"
        allowFiltering
        filtering={filtering}
        filterBarPlaceholder="Type a name, or an old name it used to go by"
        showDropDownIcon
        placeholder={list.isLoading ? "Loading the technologies…" : "Choose technologies"}
        value={value}
        change={onPick}
      >
        <Inject services={[CheckBoxSelection]} />
      </MultiSelectComponent>

      {ordered.length > 0 ? (
        <div className="admin-tech-picker__order">
          <div className="admin-status" style={{ margin: "8px 0 4px" }}>
            In the order the sites show them. Drag a row to move it.
          </div>
          <ListBoxComponent
            ref={listRef}
            dataSource={ordered as unknown as { [key: string]: object }[]}
            fields={LIST_FIELDS}
            allowDragAndDrop
            drop={onDrop}
            selectionSettings={{ mode: "Multiple", showCheckbox: false }}
            height="auto"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
            <ButtonComponent cssClass="e-small e-flat e-outline" onClick={removeSelected}>
              Remove selected
            </ButtonComponent>
            <span className="admin-status">
              Not in the list?{" "}
              <Link to="/technologies/new" target="_blank" rel="noreferrer">
                Add a technology
              </Link>{" "}
              in a new tab, then pick it here.
            </span>
          </div>
        </div>
      ) : (
        <p className="admin-status" style={{ margin: "6px 0 0" }}>
          Nothing chosen yet.{" "}
          <Link to="/technologies/new" target="_blank" rel="noreferrer">
            Add a technology
          </Link>{" "}
          if the one you need is missing.
        </p>
      )}
    </div>
  );
}
