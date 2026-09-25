import { resumeSkillLines, type ResumeSkills, type Technology } from "@hd/content-schema";
import { CheckBoxComponent } from "@syncfusion/ej2-react-buttons";
import { ColumnDirective } from "@syncfusion/ej2-react-grids";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { EntityGrid } from "../components/EntityGrid";
import { api, ApiError } from "../lib/apiClient";
import { useAllEntities } from "../lib/entityApi";
import { useStatus } from "../lib/status";

interface SingletonResponse<T> {
  key: string;
  data: T;
  version: number;
}

const queryKey = ["singletons", "resumeSkills"] as const;
const EMPTY: ResumeSkills = { headingOrder: [], closingLines: [] };

/**
 * The resume's skills section as it will print, one row per line, dragged
 * into the order it prints in (D28). The lines themselves come from
 * Technologies - the Resume tick decides what is on them - so nothing here
 * is edited but the order. Each drop saves the order at once.
 */
export function ResumeSkillsPage() {
  const queryClient = useQueryClient();
  const status = useStatus();
  const technologies = useAllEntities<Technology>("technologies");
  const order = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await api.get<SingletonResponse<ResumeSkills>>("/api/v2/admin/singletons/resumeSkills");
      } catch (error) {
        // Never saved yet: the lines print in tree order until the first drag.
        if (error instanceof ApiError && error.status === 404) {
          return { key: "resumeSkills", data: EMPTY, version: 0 } satisfies SingletonResponse<ResumeSkills>;
        }
        throw error;
      }
    },
  });

  const lines = useMemo(
    () => resumeSkillLines(technologies.items ?? [], order.data?.data.headingOrder ?? []),
    [technologies.items, order.data],
  );
  const closingLines = order.data?.data.closingLines ?? [];
  const rows = useMemo(
    () =>
      lines.map((line) => ({
        slug: line.slug,
        heading: line.name,
        skills: line.skills.join(", "),
        closing: closingLines.length === 0 || closingLines.includes(line.slug),
      })),
    [lines, closingLines],
  );

  const save = useMutation({
    mutationFn: (data: ResumeSkills) =>
      api.put<SingletonResponse<ResumeSkills>>("/api/v2/admin/singletons/resumeSkills", {
        data,
        version: order.data?.version ?? 0,
      }),
    onSuccess: () => {
      status.success("Saved. Publish to show it on the resume and the film.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => status.error(error, "Could not save."),
  });
  const saveOrder = (headingOrder: string[]) => save.mutate({ headingOrder, closingLines });
  // A tick saves at once. With nothing ticked yet every line shows, so the
  // first untick records the rest as chosen and drops this one.
  const toggleClosing = (slug: string, on: boolean) => {
    const current = closingLines.length === 0 ? lines.map((line) => line.slug) : closingLines;
    const next = on ? [...new Set([...current, slug])] : current.filter((entry) => entry !== slug);
    save.mutate({ headingOrder: order.data?.data.headingOrder ?? [], closingLines: next });
  };

  // The template is created once and reads the handler through a ref: a new
  // template per render makes the grid rebuild every cell and re-render React.
  const latest = useRef(toggleClosing);
  latest.current = toggleClosing;
  const closingTemplate = useMemo(
    () => (row: { slug: string; closing: boolean }) => (
      <CheckBoxComponent
        checked={row.closing}
        change={(event: { checked: boolean; event?: Event }) => {
          if (event.event) latest.current(row.slug, event.checked);
        }}
      />
    ),
    [],
  );

  if (technologies.isLoading || order.isLoading) return <p className="admin-status">Loading…</p>;
  if (technologies.isError || order.isError) return <p className="admin-error">Could not load the resume skills.</p>;

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Resume skills</h1>
          <p>
            The skills section exactly as the resume prints it: one line per heading ticked <strong>Resume</strong> in{" "}
            <Link to="/technologies">Technologies</Link>, with the skills ticked under it. Drag a row by its handle to
            change the order, and each drop saves. <strong>Closing screen</strong> chooses which lines the film shows
            with their years at the end, in this order; every line stays in the film&apos;s Skill Progress panel
            regardless. What is on a line, and which lines exist, is decided by the ticks in Technologies.
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="admin-status">
          No lines yet: tick <strong>Resume</strong> on a heading and on the skills under it in Technologies.
        </p>
      ) : (
        <div className="admin-grid-wrap">
          <EntityGrid gridId="resume-skills-v2" rows={rows} mode="local" onReorder={saveOrder}>
            <ColumnDirective field="heading" headerText="Line" width={220} />
            <ColumnDirective field="skills" headerText="Skills, as printed" />
            <ColumnDirective field="closing" headerText="Closing screen" width={140} textAlign="Center" template={closingTemplate} />
          </EntityGrid>
        </div>
      )}
    </>
  );
}
