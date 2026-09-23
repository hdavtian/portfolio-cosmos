import type { Technology } from "@hd/content-schema";
import { ListBoxComponent } from "@syncfusion/ej2-react-dropdowns";
import { useMemo, useRef, useState } from "react";
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

// Constants handed to Syncfusion, so re-renders never rebuild the lists.
const FIELDS = { text: "name", value: "slug" };
const POOL_TOOLBAR = { items: ["moveTo", "moveFrom"] };
const CHOSEN_TOOLBAR = { items: ["moveUp", "moveDown"] };
const SELECTION = { mode: "Multiple" as const, showCheckbox: false };
const LIST_HEIGHT = "340px";

/**
 * Picks technologies from the master list (Admin -> Technologies) and orders
 * them: Syncfusion's dual list box. The pool on the left is every skill (not
 * headings), filtered by name or by any old name a record absorbed. Move rows
 * across with the arrows or by dragging; the right-hand list is the chosen
 * ones in the order the sites show them, moved up and down the same way.
 */
export function TechnologyPicker({ value, onChange }: TechnologyPickerProps) {
  const list = useAllEntities<Technology>("technologies");
  const all = useMemo<Choice[]>(
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
  const bySlug = useMemo(() => new Map(all.map((choice) => [choice.slug, choice])), [all]);

  // A chosen slug the list no longer knows (deleted since) is kept, so a save
  // cannot silently drop it, and shown by its slug.
  const chosen = useMemo<Choice[]>(
    () =>
      value.map(
        (slug) => bySlug.get(slug) ?? { slug, name: `${slug} (no longer in the list)`, search: slug },
      ),
    [value, bySlug],
  );
  // What is typed in the pool's filter box. The narrowing is done here, on
  // name and aliases alike, and handed to the list as its data - Syncfusion's
  // own filter only reads the text field and would drop an alias-only match.
  const [term, setTerm] = useState("");
  const pool = useMemo<Choice[]>(() => {
    const needle = term.trim().toLowerCase();
    return all.filter((choice) => !value.includes(choice.slug) && (!needle || choice.search.includes(needle)));
  }, [all, value, term]);

  const chosenRef = useRef<ListBoxComponent>(null);

  // After any move, up/down or drop, the chosen list's own data is the truth;
  // read it back rather than working out what the toolbar or the drag did.
  const readBack = () => {
    window.setTimeout(() => {
      const items = (chosenRef.current?.getDataList?.() as Choice[] | undefined) ?? [];
      const slugs = items.map((item) => item.slug);
      if (slugs.length !== value.length || slugs.some((slug, index) => slug !== value[index])) onChange(slugs);
    }, 0);
  };

  const filtering = (event: { text: string; preventDefaultAction?: boolean }) => {
    event.preventDefaultAction = true;
    setTerm(event.text ?? "");
  };

  return (
    <div className="admin-tech-picker">
      <div className="admin-tech-picker__lists">
        <div className="admin-tech-picker__pane">
          <div className="admin-status" style={{ margin: "0 0 4px" }}>
            {list.isLoading ? "Loading the technologies…" : `Available (${pool.length})`}
          </div>
          <ListBoxComponent
            dataSource={pool as unknown as { [key: string]: object }[]}
            fields={FIELDS}
            height={LIST_HEIGHT}
            scope="#technology-picker-chosen"
            toolbarSettings={POOL_TOOLBAR}
            allowDragAndDrop
            allowFiltering
            filterBarPlaceholder="Find by name, or by an old name it went by"
            filtering={filtering}
            selectionSettings={SELECTION}
            actionComplete={readBack}
            drop={readBack}
          />
        </div>
        <div className="admin-tech-picker__pane">
          <div className="admin-status" style={{ margin: "0 0 4px" }}>
            Chosen ({chosen.length}) - in the order the sites show them
          </div>
          <ListBoxComponent
            id="technology-picker-chosen"
            ref={chosenRef}
            dataSource={chosen as unknown as { [key: string]: object }[]}
            fields={FIELDS}
            height={LIST_HEIGHT}
            toolbarSettings={CHOSEN_TOOLBAR}
            allowDragAndDrop
            selectionSettings={SELECTION}
            actionComplete={readBack}
            drop={readBack}
          />
        </div>
      </div>
      <p className="admin-status" style={{ margin: "6px 0 0" }}>
        Select a row and use the arrows, or drag it across; drag or use the up and down arrows to order. Not in the
        list?{" "}
        <Link to="/technologies/new" target="_blank" rel="noreferrer">
          Add a technology
        </Link>{" "}
        in a new tab, then pick it here.
      </p>
    </div>
  );
}
