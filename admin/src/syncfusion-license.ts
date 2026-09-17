import { registerLicense } from "@syncfusion/ej2-base";

// Harma's own Community Licence (never the client's key). Supplied at build
// time from the repo-root .env locally, and from the GitHub Actions secret
// SYNCFUSION_LICENSE_KEY in production.
const licenseKey = import.meta.env.VITE_SYNCFUSION_LICENSE_KEY as string | undefined;

if (licenseKey?.trim()) {
  registerLicense(licenseKey.trim());
} else {
  console.warn(
    "[Syncfusion] VITE_SYNCFUSION_LICENSE_KEY is missing from the repo-root .env. Components will show a licence banner.",
  );
}
