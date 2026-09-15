<#
Fails unless the Azure CLI is signed in to Harma's personal subscription.

The same username (harmadavtian@gmail.com) also reaches the client
"Hydrodent Production" subscription, and AI sessions working on that site
switch the active subscription. The username proves nothing, so this checks
the subscription id AND tenant id. It never switches subscriptions itself.

Every az command in this project must still pass
--subscription 0aebe465-2471-45ac-a357-6f84975876ed explicitly.
#>
$ErrorActionPreference = 'Stop'

$ExpectedSubscriptionId = '0aebe465-2471-45ac-a357-6f84975876ed'
$ExpectedTenantId = 'd8d8bac7-defe-43b2-bdff-2574356ff7cf'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  Write-Host 'AZ GUARD FAILED: Azure CLI (az) is not installed or not on PATH.' -ForegroundColor Red
  exit 1
}

$raw = az account show --query '{name:name,id:id,tenantId:tenantId,user:user.name}' -o json 2>$null
if ($LASTEXITCODE -ne 0 -or -not $raw) {
  Write-Host 'AZ GUARD FAILED: not signed in. Run: az login' -ForegroundColor Red
  exit 1
}

$account = $raw | ConvertFrom-Json

if ($account.id -ne $ExpectedSubscriptionId -or $account.tenantId -ne $ExpectedTenantId) {
  Write-Host 'AZ GUARD FAILED: the active Azure subscription is NOT Harma''s personal subscription.' -ForegroundColor Red
  Write-Host "  Active:   $($account.name) ($($account.id)), tenant $($account.tenantId)"
  Write-Host "  Expected: Azure subscription 1 - Support Basic ($ExpectedSubscriptionId), tenant $ExpectedTenantId"
  Write-Host "  Fix:      az account set --subscription $ExpectedSubscriptionId"
  exit 1
}

Write-Host "AZ GUARD OK: $($account.name) ($($account.id)) as $($account.user)" -ForegroundColor Green
exit 0
