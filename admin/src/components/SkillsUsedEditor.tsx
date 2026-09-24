import type { SkillUse, Technology } from "@hd/content-schema";
import { CheckBoxComponent } from "@syncfusion/ej2-react-buttons";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useMemo } from "react";
import { useAllEntities } from "../lib/entityApi";
import { TechnologyPicker } from "./TechnologyPicker";

interface SkillsUsedEditorProps {
  value: SkillUse[];
  onChange: (uses: SkillUse[]) => void;
  /** The job's own dates, MM/YYYY; the end blank for a current job. */
  jobStart: string;
  jobEnd?: string;
  /** Server validation messages for this section. */
  errors?: string[];
}

// Constants handed to Syncfusion, so re-renders never rebuild the lists.
const WHEN_OPTIONS = [
  { value: "", text: "—" },
  { value: "start", text: "Start of the job" },
  { value: "middle", text: "Middle" },
  { value: "end", text: "End of the job" },
];
const STYLE_OPTIONS = [
  { value: "", text: "Plain" },
  { value: "code", text: "Code" },
  { value: "handwritten", text: "Handwritten" },
];
const FIELDS = { text: "text", value: "value" };
const SURFACES: Array<{ value: SkillUse["surfaces"][number]; label: string; hint: string }> = [
  { value: "moonLabel", label: "Moon label", hint: "a label on the job's moon in the universe" },
  { value: "flyBy", label: "Fly-by", hint: "drifts past when you enter the moon's orbit" },
  { value: "filmDestination", label: "Film", hint: "a tower at this stop in the film" },
];

const DATE = /^(\d{4}|(0[1-9]|1[0-2])\/\d{4})$/;

/** "YYYY" or "MM/YYYY" as a fractional year; undefined when blank or malformed. */
const yearOf = (value: string | undefined): number | undefined => {
  const text = (value ?? "").trim();
  if (!DATE.test(text)) return undefined;
  const [first, second] = text.split("/");
  return second ? Number(second) + (Number(first) - 1) / 12 : Number(first);
};

const NOW = new Date().getFullYear() + new Date().getMonth() / 12;

/**
 * The span a use covers, by the film's own rule: exact dates win; else years
 * placed at the start, middle or end; else the whole job. Blank dates are
 * not errors - they mean "the whole job" - but a malformed or impossible
 * date is said so, next to the field, before anything is sent.
 */
const spanOf = (use: SkillUse, jobFrom: number, jobTo: number) => {
  const problems: string[] = [];
  const from = yearOf(use.from);
  const to = yearOf(use.to);
  if (use.from?.trim() && from === undefined) problems.push("From: use YYYY or MM/YYYY");
  if (use.to?.trim() && to === undefined) problems.push("To: use YYYY or MM/YYYY");
  if (from !== undefined && to !== undefined && to < from) problems.push("To is before From");
  // A bare year counts as the whole year (D18): "2018" is fine for a job that
  // began in April 2018, so bare years are checked against whole years.
  const bare = (text: string | undefined) => /^\d{4}$/.test((text ?? "").trim());
  const lowest = (text: string | undefined) => (bare(text) ? Math.floor(jobFrom) : jobFrom) - 0.01;
  const highest = (text: string | undefined) => (bare(text) ? Math.ceil(jobTo) : jobTo) + 0.01;
  if (from !== undefined && (from < lowest(use.from) || from > highest(use.from))) problems.push("From is outside the job's dates");
  if (to !== undefined && (to < lowest(use.to) || to > highest(use.to))) problems.push("To is outside the job's dates");
  const length = jobTo - jobFrom;
  let span: [number, number];
  // Drawn within the job whatever was typed; the film clips the same way.
  if (from !== undefined) span = [Math.max(jobFrom, from), Math.min(jobTo, to ?? jobTo)];
  else if (use.years !== undefined && use.years > 0) {
    const years = Math.min(use.years, Math.max(1, Math.round(length)));
    if (use.when === "end") span = [jobTo - years, jobTo];
    else if (use.when === "middle") span = [jobFrom + (length - years) / 2, jobTo - (length - years) / 2];
    else span = [jobFrom, jobFrom + years];
  } else span = [jobFrom, jobTo];
  return { span, problems };
};

const withField = <K extends keyof SkillUse>(use: SkillUse, key: K, value: SkillUse[K]): SkillUse => ({
  ...use,
  [key]: value,
});

/**
 * Skills used at one job (D20): which technologies, when, and where each
 * shows. Pick the skills with the two-list picker (the right-hand order is
 * the order of the moon's labels); each picked skill then has a row for its
 * dates, its ticks and its style, with a bar drawn on the job's own timeline
 * so the span reads without reading numbers. Rows save with the job.
 */
export function SkillsUsedEditor({ value, onChange, jobStart, jobEnd, errors = [] }: SkillsUsedEditorProps) {
  const technologies = useAllEntities<Technology>("technologies");
  const nameBySlug = useMemo(
    () => new Map((technologies.items ?? []).map((record) => [record.slug, record.name])),
    [technologies.items],
  );
  const jobFrom = yearOf(jobStart) ?? NOW - 1;
  const jobTo = yearOf(jobEnd) ?? NOW;
  const jobLength = Math.max(0.5, jobTo - jobFrom);

  const slugs = value.map((use) => use.technologySlug);
  const pick = (next: string[]) =>
    onChange(
      next.map(
        (slug) =>
          value.find((use) => use.technologySlug === slug) ?? {
            technologySlug: slug,
            surfaces: ["moonLabel", "flyBy", "filmDestination"],
            highlightMatches: [],
          },
      ),
    );
  const updateAt = (index: number, next: SkillUse) => onChange(value.map((use, i) => (i === index ? next : use)));

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <h2>Skills used</h2>
        <p>
          Which technologies this job used, for how long, and where each shows. Pick them below; the right-hand
          order is the order of the moon&apos;s labels. Then, per skill: dates if you know them (blank means the
          whole job), or roughly how many years and where in the job they fell.
        </p>
      </div>
      {errors.length > 0 ? (
        <ul className="admin-error">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <TechnologyPicker value={slugs} onChange={pick} />

      {value.length > 0 ? (
        <div className="admin-skill-uses">
          <div className="admin-skill-use admin-skill-use--head">
            <span>Skill</span>
            <span>From</span>
            <span>To</span>
            <span>or Years</span>
            <span>Where in the job</span>
            <span>Shown in</span>
            <span>Style</span>
          </div>
          {value.map((use, index) => {
            const { span, problems } = spanOf(use, jobFrom, jobTo);
            const left = Math.max(0, Math.min(1, (span[0] - jobFrom) / jobLength));
            const right = Math.max(left, Math.min(1, (span[1] - jobFrom) / jobLength));
            const exact = Boolean(use.from?.trim());
            return (
              <div className="admin-skill-use" key={use.technologySlug}>
                <div className="admin-skill-use__name">
                  {nameBySlug.get(use.technologySlug) ?? `${use.technologySlug} (no longer in the list)`}
                  <div className="admin-skill-use__bar" title={`${span[0].toFixed(1)} – ${span[1].toFixed(1)}`}>
                    <span
                      className={`admin-skill-use__span${exact ? "" : " is-rough"}`}
                      style={{ left: `${left * 100}%`, width: `${Math.max(1.5, (right - left) * 100)}%` }}
                    />
                  </div>
                  {problems.length > 0 ? <p className="admin-error">{problems.join(" · ")}</p> : null}
                </div>
                <TextBoxComponent
                  cssClass="e-small"
                  placeholder="YYYY"
                  value={use.from ?? ""}
                  input={(e: { value: string }) => updateAt(index, withField(use, "from", e.value))}
                />
                <TextBoxComponent
                  cssClass="e-small"
                  placeholder="YYYY"
                  value={use.to ?? ""}
                  input={(e: { value: string }) => updateAt(index, withField(use, "to", e.value))}
                />
                <TextBoxComponent
                  cssClass="e-small"
                  type="number"
                  placeholder="yrs"
                  value={use.years === undefined ? "" : String(use.years)}
                  input={(e: { value: string }) =>
                    updateAt(index, withField(use, "years", e.value.trim() === "" ? undefined : Number(e.value)))
                  }
                />
                <DropDownListComponent
                  cssClass="e-small"
                  dataSource={WHEN_OPTIONS}
                  fields={FIELDS}
                  value={use.when ?? ""}
                  change={(e: { value: string; isInteracted?: boolean }) => {
                    if (!e.isInteracted) return;
                    updateAt(index, withField(use, "when", (e.value || undefined) as SkillUse["when"]));
                  }}
                />
                <div className="admin-skill-use__ticks">
                  {SURFACES.map((surface) => (
                    <CheckBoxComponent
                      key={surface.value}
                      label={surface.label}
                      cssClass="e-small"
                      checked={use.surfaces.includes(surface.value)}
                      change={(e: { checked: boolean; event?: Event }) => {
                        if (!e.event) return;
                        updateAt(
                          index,
                          withField(
                            use,
                            "surfaces",
                            e.checked
                              ? [...use.surfaces, surface.value]
                              : use.surfaces.filter((entry) => entry !== surface.value),
                          ),
                        );
                      }}
                    />
                  ))}
                </div>
                <DropDownListComponent
                  cssClass="e-small"
                  dataSource={STYLE_OPTIONS}
                  fields={FIELDS}
                  value={use.style ?? ""}
                  change={(e: { value: string; isInteracted?: boolean }) => {
                    if (!e.isInteracted) return;
                    updateAt(index, withField(use, "style", (e.value || undefined) as SkillUse["style"]));
                  }}
                />
              </div>
            );
          })}
          <p className="admin-status">
            The bar is the span on this job&apos;s own timeline ({jobStart || "?"} – {jobEnd || "today"}); a hatched
            bar is a rough placement. {SURFACES.map((surface) => `${surface.label}: ${surface.hint}`).join(". ")}.
          </p>
        </div>
      ) : (
        <p className="admin-status">No skills picked yet. The moon shows no labels and the film no towers for this job.</p>
      )}
    </section>
  );
}
