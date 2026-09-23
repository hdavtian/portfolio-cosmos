import type { PortfolioEntry, Technology } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/apiClient";
import {
  useAllEntities,
  withoutMeta,
  type EntityRecord,
} from "../lib/entityApi";
import { useStatus } from "../lib/status";

/**
 * Tagging: every project as a card on the right, every skill on the left.
 * Drag a skill onto a card to add it, drag a chip off a card onto the list to
 * remove it - or click either and press the small action that appears, which
 * is quicker and cannot happen by accident. Each change saves at once and can
 * be undone. Client variants are cards of their own: a client site and the
 * platform it was built on are different work, so they never share tags.
 */

type EntryRecord = EntityRecord<PortfolioEntry>;

interface Card {
  /** Entry slug, or entry/variant for a client variant. */
  key: string;
  entrySlug: string;
  /** Index into the entry's clientVariants, or null for the entry itself. */
  variantIndex: number | null;
  title: string;
  core: string;
  year: number | null;
  slugs: string[];
}

interface Skill {
  slug: string;
  name: string;
  heading: string;
  search: string;
}

interface Change {
  card: Card;
  previous: string[];
  label: string;
}

const SKILL_TYPE = "application/x-skill";
const CHIP_TYPE = "application/x-card-chip";

const cardsOf = (records: EntryRecord[]): Card[] =>
  records
    .flatMap((entry) => [
      {
        key: entry.slug,
        entrySlug: entry.slug,
        variantIndex: null,
        title: entry.title,
        core: entry.coreSlug,
        year: entry.year ?? null,
        slugs: entry.technologySlugs ?? [],
      },
      ...(entry.clientVariants ?? []).map((variant, index) => ({
        key: `${entry.slug}/${variant.slug}`,
        entrySlug: entry.slug,
        variantIndex: index,
        title: variant.title,
        core: entry.coreSlug,
        year: variant.year ?? null,
        slugs: variant.technologySlugs ?? [],
      })),
    ])
    // Newest first; no year last; ties keep the admin's order.
    .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));

/** The record with one card's tags replaced, ready to save. */
const withTags = (
  record: EntryRecord,
  card: Card,
  slugs: string[],
): PortfolioEntry => {
  const content = withoutMeta(record);
  if (card.variantIndex === null) return { ...content, technologySlugs: slugs };
  return {
    ...content,
    clientVariants: content.clientVariants.map((variant, index) =>
      index === card.variantIndex
        ? { ...variant, technologySlugs: slugs }
        : variant,
    ),
  };
};

export function TaggingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useStatus();
  const technologies = useAllEntities<Technology>("technologies");
  const entries = useAllEntities<PortfolioEntry>("portfolioEntries");

  // The entries are held locally so a save's result (new version, new tags)
  // replaces one record without refetching the list under the cards.
  const [records, setRecords] = useState<EntryRecord[] | null>(null);
  useEffect(() => {
    if (entries.items) setRecords(entries.items as EntryRecord[]);
  }, [entries.items]);

  const skills = useMemo<Skill[]>(() => {
    const all = technologies.items ?? [];
    const bySlug = new Map(all.map((record) => [record.slug, record]));
    const headingOf = (record: Technology) => {
      let current: Technology | undefined = record;
      const seen = new Set<string>();
      while (current?.parentSlug && !seen.has(current.slug)) {
        seen.add(current.slug);
        current = bySlug.get(current.parentSlug);
      }
      return current?.name ?? "";
    };
    return all
      .filter((record) => !record.isGrouping)
      .map((record) => ({
        slug: record.slug,
        name: record.name,
        heading: headingOf(record),
        search: [record.name, ...(record.aliases ?? [])]
          .join(" ")
          .toLowerCase(),
      }))
      .sort(
        (a, b) =>
          a.heading.localeCompare(b.heading) ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [technologies.items]);
  const nameBySlug = useMemo(
    () => new Map(skills.map((skill) => [skill.slug, skill.name])),
    [skills],
  );

  const cards = useMemo(() => (records ? cardsOf(records) : []), [records]);

  const [skillFilter, setSkillFilter] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** The chip whose action button is showing: a skill slug, or card|slug. */
  const [armed, setArmed] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<Change | null>(null);

  const selected = cards.find((card) => card.key === selectedKey) ?? null;
  const assigned = useMemo(() => new Set(selected?.slugs ?? []), [selected]);

  const visibleSkills = useMemo(() => {
    const term = skillFilter.trim().toLowerCase();
    return term
      ? skills.filter((skill) => skill.search.includes(term))
      : skills;
  }, [skills, skillFilter]);
  const visibleCards = useMemo(() => {
    const term = cardFilter.trim().toLowerCase();
    return term
      ? cards.filter((card) => card.title.toLowerCase().includes(term))
      : cards;
  }, [cards, cardFilter]);

  const save = async (
    card: Card,
    slugs: string[],
    label: string,
    remember = true,
  ) => {
    const record = records?.find((entry) => entry.slug === card.entrySlug);
    if (!record) return;
    setSaving(card.key);
    try {
      const saved = await api.put<EntryRecord>(
        `/api/v2/admin/portfolioEntries/${card.entrySlug}`,
        {
          ...withTags(record, card, slugs),
          version: record.version,
        },
      );
      setRecords((current) =>
        (current ?? []).map((entry) =>
          entry.slug === saved.slug ? saved : entry,
        ),
      );
      if (remember) setLastChange({ card, previous: card.slugs, label });
      status.success(`${label}. Publish to show it on the sites.`);
    } catch (error) {
      status.error(error, `Could not save ${card.title}.`);
      // A conflict means the record changed elsewhere: take the current one.
      void queryClient.invalidateQueries({ queryKey: ["portfolioEntries"] });
    } finally {
      setSaving(null);
      setArmed(null);
    }
  };

  const add = (card: Card, slug: string) => {
    if (card.slugs.includes(slug)) return;
    void save(
      card,
      [...card.slugs, slug],
      `Added ${nameBySlug.get(slug) ?? slug} to ${card.title}`,
    );
  };
  const remove = (card: Card, slug: string) => {
    void save(
      card,
      card.slugs.filter((item) => item !== slug),
      `Removed ${nameBySlug.get(slug) ?? slug} from ${card.title}`,
    );
  };
  const undo = () => {
    if (!lastChange) return;
    const card = cards.find((item) => item.key === lastChange.card.key);
    if (!card) return;
    void save(
      card,
      lastChange.previous,
      `Undid: ${lastChange.label.toLowerCase()}`,
      false,
    );
    setLastChange(null);
  };

  // ---- drag and drop: a skill onto a card, or a chip off a card onto the list.
  const startSkillDrag = (event: DragEvent, slug: string) => {
    event.dataTransfer.setData(SKILL_TYPE, slug);
    event.dataTransfer.effectAllowed = "copy";
  };
  const startChipDrag = (event: DragEvent, card: Card, slug: string) => {
    event.dataTransfer.setData(CHIP_TYPE, `${card.key}|${slug}`);
    event.dataTransfer.effectAllowed = "move";
  };
  const overCard = (event: DragEvent, card: Card) => {
    if (!event.dataTransfer.types.includes(SKILL_TYPE)) return;
    // The dragged slug cannot be read until the drop, so the card lights for
    // any skill and refuses a duplicate when it lands.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (dragOver !== card.key) setDragOver(card.key);
  };
  const dropOnCard = (event: DragEvent, card: Card) => {
    event.preventDefault();
    setDragOver(null);
    const slug = event.dataTransfer.getData(SKILL_TYPE);
    if (!slug) return;
    if (card.slugs.includes(slug)) {
      status.info(`${card.title} already has ${nameBySlug.get(slug) ?? slug}.`);
      return;
    }
    add(card, slug);
  };
  const overList = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(CHIP_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOver !== "list") setDragOver("list");
  };
  const dropOnList = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(null);
    const payload = event.dataTransfer.getData(CHIP_TYPE);
    if (!payload) return;
    const [key, slug] = payload.split("|");
    const card = cards.find((item) => item.key === key);
    if (card && slug) remove(card, slug);
  };

  const loading =
    technologies.isLoading || entries.isLoading || records === null;

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Tag technologies</h1>
          <p>
            Every project and client site is a card; every skill is on the left.
            Drag a skill onto a card, or click a card, click a skill and press{" "}
            <strong>Add</strong>. Click a chip on a card and press{" "}
            <strong>Remove</strong>, or drag it back to the list. Each change
            saves straight away.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonComponent
            cssClass="e-flat e-outline"
            disabled={!lastChange || saving !== null}
            onClick={undo}
          >
            {lastChange ? `Undo: ${lastChange.label}` : "Undo"}
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-flat e-outline"
            onClick={() => navigate("/portfolioEntries")}
          >
            Back to projects
          </ButtonComponent>
        </div>
      </div>

      {loading ? <p className="admin-status">Loading…</p> : null}

      <div className="tagging">
        <section
          className={`tagging__skills${dragOver === "list" ? " is-drop-target" : ""}`}
          onDragOver={overList}
          onDragLeave={() => dragOver === "list" && setDragOver(null)}
          onDrop={dropOnList}
          aria-label="Skills"
        >
          <div className="tagging__toolbar">
            <TextBoxComponent
              placeholder="Find a skill by name, or an old name"
              value={skillFilter}
              input={(event: { value: string }) => setSkillFilter(event.value)}
            />
            <span className="admin-status">
              {selected
                ? `Highlighted: on ${selected.title}`
                : "Click a card to see which skills it has"}
            </span>
          </div>
          <div className="tagging__list">
            {visibleSkills.map((skill, index) => {
              const showHeading =
                index === 0 ||
                visibleSkills[index - 1].heading !== skill.heading;
              const has = assigned.has(skill.slug);
              const isArmed = armed === skill.slug;
              return (
                <div key={skill.slug}>
                  {showHeading ? (
                    <div className="tagging__heading">{skill.heading}</div>
                  ) : null}
                  <div
                    className={`tagging__skill${has ? " is-assigned" : ""}${isArmed ? " is-armed" : ""}`}
                    draggable={!has || !selected}
                    onDragStart={(event) => startSkillDrag(event, skill.slug)}
                    onClick={() => setArmed(isArmed ? null : skill.slug)}
                    title={
                      has
                        ? `Already on ${selected?.title}`
                        : "Drag onto a card, or click for Add"
                    }
                  >
                    <span className="tagging__skill-name">{skill.name}</span>
                    {isArmed && selected && !has ? (
                      <button
                        type="button"
                        className="tagging__action tagging__action--add"
                        disabled={saving !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          add(selected, skill.slug);
                        }}
                      >
                        + Add to {selected.title}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="tagging__cards" aria-label="Projects">
          <div className="tagging__toolbar">
            <TextBoxComponent
              placeholder="Find a project"
              value={cardFilter}
              input={(event: { value: string }) => setCardFilter(event.value)}
            />
            <span className="admin-status">
              {visibleCards.length} of {cards.length}, newest first
            </span>
          </div>
          <div className="tagging__grid">
            {visibleCards.map((card) => (
              <article
                key={card.key}
                className={`tagging__card${card.key === selectedKey ? " is-selected" : ""}${dragOver === card.key ? " is-drop-target" : ""}${saving === card.key ? " is-saving" : ""}`}
                onClick={() => {
                  setSelectedKey(card.key);
                  setArmed(null);
                }}
                onDragOver={(event) => overCard(event, card)}
                onDragLeave={() => dragOver === card.key && setDragOver(null)}
                onDrop={(event) => dropOnCard(event, card)}
              >
                <div className="tagging__card-head">
                  <span className="tagging__card-title">{card.title}</span>
                  <span className="tagging__card-meta">
                    {card.variantIndex !== null ? "client site · " : ""}
                    {card.core}
                    {card.year ? ` · ${card.year}` : ""}
                  </span>
                </div>
                <div className="tagging__chips">
                  {card.slugs.length === 0 ? (
                    <span className="tagging__empty">No skills yet</span>
                  ) : null}
                  {card.slugs.map((slug) => {
                    const chipKey = `${card.key}|${slug}`;
                    const isArmed = armed === chipKey;
                    return (
                      <span
                        key={slug}
                        className={`tagging__chip${isArmed ? " is-armed" : ""}`}
                        draggable
                        onDragStart={(event) =>
                          startChipDrag(event, card, slug)
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedKey(card.key);
                          setArmed(isArmed ? null : chipKey);
                        }}
                      >
                        {nameBySlug.get(slug) ?? slug}
                        {isArmed ? (
                          <button
                            type="button"
                            className="tagging__action tagging__action--remove"
                            disabled={saving !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              remove(card, slug);
                            }}
                          >
                            × Remove
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
