[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidatePattern("^[a-z][a-z0-9-]{4,28}[a-z0-9]$")]
  [string]$ProjectId,

  [string]$Region = "asia-south1",
  [Parameter(Mandatory)]
  [string]$Network,
  [Parameter(Mandatory)]
  [string]$Subnet,
  [string]$ArtifactRepository = "sigulon",
  [string]$Tag = "latest",
  [string]$GkeClusterName = "sigulon-campaign-workers",
  [string]$WorkerSecretFile,
  [switch]$SkipBuild,
  [switch]$SkipWorker
)

# Builds the three images, deploys the public Cloud Run services, then creates
# (or reuses) an Autopilot cluster and installs the KEDA-scaled worker.
# Secrets are deliberately not created or read by this script. Provision the
# Secret Manager values and the Kubernetes worker secret first; README.md lists
# the exact names and safe commands.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "'$Name' is required but was not found on PATH."
  }
}

function Invoke-Gcloud([string[]]$Arguments) {
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud command failed: gcloud $($Arguments -join ' ')"
  }
}

function Test-Gcloud([string[]]$Arguments) {
  & gcloud @Arguments 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Get-CloudRunUrl([string]$Service) {
  $url = (& gcloud run services describe $Service "--region=$Region" "--project=$ProjectId" "--format=value(status.url)" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $url) {
    throw "Could not resolve the Cloud Run URL for $Service."
  }
  return $url
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$registryHost = "$Region-docker.pkg.dev"
$imageRoot = "$registryHost/$ProjectId/$ArtifactRepository"
$webImage = "$imageRoot/sigulon-web:$Tag"
$runtimeImage = "$imageRoot/sigulon-runtime:$Tag"
$workerImage = "$imageRoot/sigulon-worker:$Tag"
$serviceAccountName = "sigulon-run"
$serviceAccountEmail = "$serviceAccountName@$ProjectId.iam.gserviceaccount.com"

foreach ($command in @("gcloud")) { Require-Command $command }
if (-not $SkipWorker) {
  foreach ($command in @("kubectl", "helm")) { Require-Command $command }
  if ($WorkerSecretFile -and -not (Test-Path -LiteralPath $WorkerSecretFile -PathType Leaf)) {
    throw "WorkerSecretFile does not exist: $WorkerSecretFile"
  }
}

$requiredSecretNames = @(
  "sigulon-mongodb-uri",
  "sigulon-redis-url",
  "sigulon-internal-api-secret",
  "sigulon-encryption-secret",
  "sigulon-plivo-auth-id",
  "sigulon-plivo-auth-token",
  "sigulon-cartesia-api-key",
  "sigulon-cartesia-webhook-secret",
  "sigulon-openrouter-api-key",
  "sigulon-smtp-host",
  "sigulon-smtp-user",
  "sigulon-smtp-password",
  "sigulon-email-from"
)

$workDir = Join-Path ([System.IO.Path]::GetTempPath()) "sigulon-gcp-$PID"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

function Render-Manifest([string]$Template, [hashtable]$Values) {
  $content = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot $Template)
  foreach ($token in $Values.Keys) {
    $content = $content.Replace($token, $Values[$token])
  }
  if ($content -match "__[A-Z0-9_]+__") {
    throw "Unresolved token in $Template."
  }
  $output = Join-Path $workDir ($Template -replace "[\\/]", "-")
  [System.IO.File]::WriteAllText($output, $content, [System.Text.UTF8Encoding]::new($false))
  return $output
}

try {
  Invoke-Gcloud @(
    "services", "enable",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "container.googleapis.com",
    "compute.googleapis.com",
    "secretmanager.googleapis.com",
    "--project=$ProjectId"
  )

  foreach ($secretName in $requiredSecretNames) {
    if (-not (Test-Gcloud @("secrets", "describe", $secretName, "--project=$ProjectId"))) {
      throw "Missing Secret Manager secret '$secretName'. Follow deploy/gcp/README.md before deploying."
    }
  }

  if (-not (Test-Gcloud @("artifacts", "repositories", "describe", $ArtifactRepository, "--location=$Region", "--project=$ProjectId"))) {
    Invoke-Gcloud @(
      "artifacts", "repositories", "create", $ArtifactRepository,
      "--repository-format=docker",
      "--location=$Region",
      "--project=$ProjectId"
    )
  }

  if (-not (Test-Gcloud @("iam", "service-accounts", "describe", $serviceAccountEmail, "--project=$ProjectId"))) {
    Invoke-Gcloud @(
      "iam", "service-accounts", "create", $serviceAccountName,
      "--display-name=Sigulon Cloud Run",
      "--project=$ProjectId"
    )
  }

  # A production project can replace this project-level grant with one binding
  # per required secret. The baseline grant lets the generated services start.
  Invoke-Gcloud @(
    "projects", "add-iam-policy-binding", $ProjectId,
    "--member=serviceAccount:$serviceAccountEmail",
    "--role=roles/secretmanager.secretAccessor",
    "--condition=None",
    "--quiet"
  )

  if (-not $SkipBuild) {
    Invoke-Gcloud @("builds", "submit", $repoRoot, "--tag=$webImage", "--project=$ProjectId")
    Invoke-Gcloud @("builds", "submit", (Join-Path $repoRoot "voice-runtime"), "--tag=$runtimeImage", "--project=$ProjectId")
    Invoke-Gcloud @("builds", "submit", (Join-Path $repoRoot "services/campaign-worker"), "--tag=$workerImage", "--project=$ProjectId")
  }

  # Deploy the web service once to obtain its HTTPS URL. It is immediately
  # redeployed after the runtime URL is known, so no placeholder is retained.
  $firstWeb = Render-Manifest "cloudrun-web.yaml" @{
    "__PROJECT_ID__" = $ProjectId
    "__WEB_IMAGE__" = $webImage
    "__WEB_URL__" = "https://web.invalid"
    "__RUNTIME_URL__" = "https://runtime.invalid"
    "__NETWORK__" = $Network
    "__SUBNET__" = $Subnet
  }
  Invoke-Gcloud @("run", "services", "replace", $firstWeb, "--region=$Region", "--project=$ProjectId", "--quiet")
  Invoke-Gcloud @("run", "services", "add-iam-policy-binding", "sigulon-web", "--region=$Region", "--project=$ProjectId", "--member=allUsers", "--role=roles/run.invoker", "--quiet")
  $webUrl = Get-CloudRunUrl "sigulon-web"

  $runtimeManifest = Render-Manifest "cloudrun-runtime.yaml" @{
    "__PROJECT_ID__" = $ProjectId
    "__RUNTIME_IMAGE__" = $runtimeImage
    "__WEB_URL__" = $webUrl
    "__NETWORK__" = $Network
    "__SUBNET__" = $Subnet
  }
  Invoke-Gcloud @("run", "services", "replace", $runtimeManifest, "--region=$Region", "--project=$ProjectId", "--quiet")
  # Plivo initiates the WebSocket, so Cloud Run IAM cannot require an identity
  # token here. The runtime rejects unknown calls and the webhooks verify Plivo
  # signatures before opening a stream.
  Invoke-Gcloud @("run", "services", "add-iam-policy-binding", "sigulon-voice-runtime", "--region=$Region", "--project=$ProjectId", "--member=allUsers", "--role=roles/run.invoker", "--quiet")
  $runtimeUrl = Get-CloudRunUrl "sigulon-voice-runtime"

  $finalWeb = Render-Manifest "cloudrun-web.yaml" @{
    "__PROJECT_ID__" = $ProjectId
    "__WEB_IMAGE__" = $webImage
    "__WEB_URL__" = $webUrl
    "__RUNTIME_URL__" = $runtimeUrl
    "__NETWORK__" = $Network
    "__SUBNET__" = $Subnet
  }
  Invoke-Gcloud @("run", "services", "replace", $finalWeb, "--region=$Region", "--project=$ProjectId", "--quiet")

  if (-not $SkipWorker) {
    if (-not (Test-Gcloud @("container", "clusters", "describe", $GkeClusterName, "--region=$Region", "--project=$ProjectId"))) {
      Invoke-Gcloud @("container", "clusters", "create-auto", $GkeClusterName, "--region=$Region", "--network=$Network", "--subnetwork=$Subnet", "--project=$ProjectId", "--quiet")
    }
    Invoke-Gcloud @("container", "clusters", "get-credentials", $GkeClusterName, "--region=$Region", "--project=$ProjectId", "--quiet")

    & helm repo add kedacore https://kedacore.github.io/charts --force-update
    if ($LASTEXITCODE -ne 0) { throw "Could not add the KEDA Helm repository." }
    & helm upgrade --install keda kedacore/keda --namespace keda --create-namespace --version 2.20.0 --wait
    if ($LASTEXITCODE -ne 0) { throw "Could not install KEDA." }

    & kubectl apply -f (Join-Path $PSScriptRoot "worker\namespace.yaml")
    if ($LASTEXITCODE -ne 0) { throw "Could not create the sigulon namespace." }
    if ($WorkerSecretFile) {
      & kubectl apply -f (Resolve-Path -LiteralPath $WorkerSecretFile)
      if ($LASTEXITCODE -ne 0) { throw "Could not apply WorkerSecretFile." }
    }
    & kubectl get secret sigulon-worker-secrets --namespace sigulon 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "The Kubernetes secret sigulon-worker-secrets is missing. Create it from worker/secret.example.yaml, outside this repository."
    }

    $values = @{ "__WEB_URL__" = $webUrl; "__WORKER_IMAGE__" = $workerImage }
    $workerConfig = Render-Manifest "worker\configmap.yaml" $values
    $workerDeployment = Render-Manifest "worker\deployment.yaml" $values
    foreach ($manifest in @($workerConfig, $workerDeployment, (Join-Path $PSScriptRoot "worker\pdb.yaml"), (Join-Path $PSScriptRoot "worker\scaledobject.yaml"))) {
      & kubectl apply -f $manifest
      if ($LASTEXITCODE -ne 0) { throw "Could not apply $manifest." }
    }
    & kubectl rollout status deployment/sigulon-campaign-worker --namespace sigulon --timeout=180s
    if ($LASTEXITCODE -ne 0) { throw "Campaign worker did not become ready." }
  }

  Write-Host "Sigulon web:     $webUrl"
  Write-Host "Voice runtime:   $runtimeUrl"
  Write-Host "Campaign worker: GKE Autopilot + KEDA (queue autoscaling enabled)"
}
finally {
  if (Test-Path -LiteralPath $workDir) {
    Remove-Item -LiteralPath $workDir -Recurse -Force
  }
}
