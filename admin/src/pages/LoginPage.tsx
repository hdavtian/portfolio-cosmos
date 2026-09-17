import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/apiClient";
import { useLoginMutation, useSessionQuery } from "../lib/session";

export function LoginPage() {
  const navigate = useNavigate();
  const session = useSessionQuery();
  const login = useLoginMutation();
  const [password, setPassword] = useState("");

  if (session.data?.authenticated) {
    return <Navigate to="/" replace />;
  }

  const errorMessage =
    login.error instanceof ApiError
      ? login.error.status === 429
        ? "Too many attempts. Wait a few minutes and try again."
        : login.error.message
      : login.error
        ? "Could not reach the API."
        : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    login.mutate(password, { onSuccess: () => navigate("/", { replace: true }) });
  };

  return (
    <div className="admin-login">
      <form className="admin-login__panel" onSubmit={submit}>
        <h1>Content Admin</h1>
        <p className="admin-login__hint">
          Signing in here also signs you in to the other harmadavtian.com tools.
        </p>

        {errorMessage ? <p className="admin-error">{errorMessage}</p> : null}

        <div className="admin-login__field">
          <TextBoxComponent
            type="password"
            placeholder="Password"
            floatLabelType="Auto"
            autocomplete="current-password"
            input={(event: { value: string }) => setPassword(event.value)}
          />
        </div>

        <ButtonComponent
          cssClass="e-primary e-outline"
          isPrimary
          type="submit"
          disabled={login.isPending || password.length === 0}
        >
          {login.isPending ? "Signing in…" : "Sign in"}
        </ButtonComponent>
      </form>
    </div>
  );
}
