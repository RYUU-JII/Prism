param(
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
  Write-Host "[Prism] $Message"
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $ProjectRoot "manifest.json"

if (!(Test-Path $ManifestPath)) {
  throw "manifest.json not found at: $ManifestPath"
}

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$version = if ($manifest.version) { [string]$manifest.version } else { "0.0.0" }
$nameSafe = $manifest.name
if (-not $nameSafe) { $nameSafe = "Prism" }
$nameSafe = ($nameSafe -replace "[^a-zA-Z0-9._-]", "-")

$DistDir = Join-Path $ProjectRoot $OutputDir
$StagingDir = Join-Path $DistDir "_staging"
$ZipPath = Join-Path $DistDir ("{0}-{1}.zip" -f $nameSafe, $version)

$excludeDirNames = @(
  ".git",
  ".github",
  ".vscode",
  ".codemirror-build",
  "node_modules",
  $OutputDir,
  "scripts"
)

$excludeFileNames = @(
  ".DS_Store",
  "Thumbs.db",
  ".gitignore",
  ".gitattributes",
  "README.md",
  "CONTRIBUTING.md"
)

$excludeExtensions = @(
  ".log"
)

Write-Info "Packaging extension..."
Write-Info "Root: $ProjectRoot"
Write-Info "Version: $version"

Write-Info "Building Tailwind CSS..."
$sidepanelDir = Join-Path $ProjectRoot "sidepanel"
$tailwindInput = Join-Path $sidepanelDir "tailwind.input.css"
$tailwindConfig = Join-Path $sidepanelDir "tailwind.config.js"
if (Test-Path $sidepanelDir) {
  if ((Test-Path $tailwindInput) -and (Test-Path $tailwindConfig)) {
    Push-Location $sidepanelDir
    try {
      npm run tailwind:build
    } finally {
      Pop-Location
    }
  } else {
    Write-Info "Skipped Tailwind build (missing tailwind.input.css or tailwind.config.js)."
  }
} else {
  Write-Info "Skipped Tailwind build (sidepanel directory not found)."
}

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

$files = Get-ChildItem -Path $ProjectRoot -Recurse -File -Force | Where-Object {
  $full = $_.FullName
  $rel = $full.Substring($ProjectRoot.Length).TrimStart("\", "/")

  foreach ($dirName in $excludeDirNames) {
    if ($rel -match ("(^|[\\/]){0}([\\/]|$)" -f [regex]::Escape($dirName))) { return $false }
  }

  if ($excludeFileNames -contains $_.Name) { return $false }
  if ($excludeExtensions -contains $_.Extension) { return $false }

  return $true
}

foreach ($file in $files) {
  $rel = $file.FullName.Substring($ProjectRoot.Length).TrimStart("\", "/")
  $dest = Join-Path $StagingDir $rel
  $destDir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -Force -LiteralPath $file.FullName -Destination $dest

  # Remove console.log statements from JavaScript files for production build
  if ($file.Extension -eq ".js" -and $rel -notmatch '(^|[\\/])vendor([\\/]|$)') {
    $content = Get-Content -LiteralPath $dest -Raw
    # Regex: Case-insensitive, matches console.log/info/debug(...) including multiline and optional semicolon
    $minified = [regex]::Replace($content, "(?si)\bconsole\.(log|info|debug)\s*\(.*?\);?", "")
    
    # Minification: Remove comments and collapse whitespace
    # 1. Remove multi-line comments (/* ... */)
    $minified = [regex]::Replace($minified, "(?s)/\*.*?\*/", "")
    # 2. Remove single-line comments (// ...) - only at start of line or preceded by whitespace
    $minified = [regex]::Replace($minified, "(?m)^\s*//.*|(?<=\s)//.*", "")
    # 3. Trim each line and remove empty lines
    $minified = ($minified -split '\r?\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }) -join "`n"

    Set-Content -LiteralPath $dest -Value $minified -Encoding UTF8
  }
}

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $StagingDir "*") -DestinationPath $ZipPath -Force

Remove-Item -Recurse -Force $StagingDir

Write-Info "Done."
Write-Info "Output: $ZipPath"

# Open the output directory automatically
Invoke-Item $DistDir
