import type { Profile } from "@hd/content-schema";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FormField } from "../components/FormField";
import { useStatus } from "../lib/status";
import { api, ApiError } from "../lib/apiClient";

interface SingletonResponse<T> {
  key: string;
  data: T;
  version: number;
  updatedAt?: string;
  updatedBy?: string;
}

const EMPTY: Profile = { name: "", title: "", email: "", phone: "", location: "", summary: "" };

const FIELDS: Array<{ key: keyof Profile; label: string; hint?: string; multiline?: boolean }> = [
  { key: "name", label: "Name" },
  { key: "title", label: "Title", hint: "Headline role, e.g. Full Stack Engineer" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "summary", label: "Summary", hint: "The paragraph at the top of the resume", multiline: true },
];

const queryKey = ["singletons", "profile"] as const;

/** The profile is a single record, so it has an editor page but no list. */
export function ProfilePage() {
  const profile = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await api.get<SingletonResponse<Profile>>("/api/v2/admin/singletons/profile");
      } catch (error) {
        // Never saved yet: start from a blank profile at version 0.
        if (error instanceof ApiError && error.status === 404) {
          return { key: "profile", data: EMPTY, version: 0 } satisfies SingletonResponse<Profile>;
        }
        throw error;
      }
    },
  });

  if (profile.isLoading) return <p className="admin-status">Loading…</p>;
  if (profile.isError || !profile.data) {
    return <p className="admin-error">Could not load the profile.</p>;
  }

  return (
    <ProfileEditor
      key={profile.data.version}
      initial={profile.data.data}
      initialVersion={profile.data.version}
      updatedBy={profile.data.updatedBy}
    />
  );
}

function ProfileEditor({
  initial,
  initialVersion,
  updatedBy,
}: {
  initial: Profile;
  initialVersion: number;
  updatedBy?: string;
}) {
  const queryClient = useQueryClient();
  const status = useStatus();
  const [draft, setDraft] = useState<Profile>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (data: Profile) =>
      api.put<SingletonResponse<Profile>>("/api/v2/admin/singletons/profile", { data, version }),
    onSuccess: (response) => {
      status.success(`Saved (version ${response.version}). Publish to show changes on the sites.`);
      setVersion(response.version);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError) setFieldErrors(error.fieldErrors);
      status.error(error, "Could not save.");
    },
  });

  const submit = () => {
    setFieldErrors({});
    const trimmed = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, value.trim()]),
    ) as Profile;
    save.mutate(trimmed);
  };

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Profile</h1>
          <p>
            {version === 0
              ? "Not saved yet."
              : `Version ${version} · last saved by ${updatedBy ?? "unknown"} · changes go live only when published`}
          </p>
        </div>
        <ButtonComponent cssClass="e-primary e-outline" disabled={save.isPending} onClick={submit}>
          {save.isPending ? "Saving…" : "Save"}
        </ButtonComponent>
      </div>

      <section className="admin-card">
        {FIELDS.map((field) => (
          <FormField key={field.key} label={field.label} hint={field.hint} error={fieldErrors[field.key]}>
            <TextBoxComponent
              multiline={field.multiline}
              value={draft[field.key]}
              input={(event: { value: string }) =>
                setDraft((current) => ({ ...current, [field.key]: event.value }))
              }
            />
          </FormField>
        ))}
      </section>
    </>
  );
}
