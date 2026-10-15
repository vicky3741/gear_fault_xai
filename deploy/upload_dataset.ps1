<#
.SYNOPSIS
  Uploads the local "time domain" folder (Desktop\time domain) to S3 with `aws s3 sync`.
  Run this on Windows.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\upload_dataset.ps1 -Bucket my-gear-bucket
  powershell -ExecutionPolicy Bypass -File deploy\upload_dataset.ps1 -Bucket my-gear-bucket -DryRun

.NOTES
  Needs the AWS CLI v2 and credentials from `aws configure` (or -Profile).
  Files go to s3://<Bucket>/<Prefix>, which defaults to raw/time domain/.
  The server copies them back with deploy/sync_dataset.sh.
#>
param(
    [string] $Bucket = $env:S3_BUCKET,
    [string] $Prefix = "raw/time domain/",
    [string] $Source = (Join-Path $PSScriptRoot "..\..\time domain"),
    [string] $Region = $env:AWS_REGION,
    [string] $Profile = "",
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"

if (-not $Bucket) { throw "No bucket given. Pass -Bucket <name> or set the S3_BUCKET environment variable." }
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw "AWS CLI not found. Install AWS CLI v2 first." }

$src = (Resolve-Path -LiteralPath $Source).Path   # stops with a clear error if the folder is missing
if (-not $Prefix.EndsWith("/")) { $Prefix = "$Prefix/" }
$dest = "s3://$Bucket/$Prefix"

$cliArgs = @("s3", "sync", $src, $dest)
if ($Region) { $cliArgs += @("--region", $Region) }
if ($Profile) { $cliArgs += @("--profile", $Profile) }
if ($DryRun) { $cliArgs += "--dryrun" }

Write-Host "Syncing '$src' -> '$dest'"
& aws @cliArgs
if ($LASTEXITCODE -ne 0) { throw "aws s3 sync failed (exit code $LASTEXITCODE)" }
Write-Host "Done."
