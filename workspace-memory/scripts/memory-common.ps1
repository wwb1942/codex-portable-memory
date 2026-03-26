function Assert-MemoryConfig {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  if (-not $Config.workspaceRoot) {
    throw 'Config missing workspaceRoot.'
  }

  if (-not $Config.memoryRoot) {
    throw 'Config missing memoryRoot.'
  }

  if (-not $Config.schedule -or -not $Config.schedule.time) {
    throw 'Config missing schedule.time.'
  }

  if (-not $Config.exclusions) {
    throw 'Config missing exclusions.'
  }

  if (-not $Config.excludedSubdirectories) {
    throw 'Config missing excludedSubdirectories.'
  }

  return $Config
}

function Get-MemoryConfig {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    throw "Config file not found: $Path"
  }

  $config = Get-Content -Path $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  $config = Assert-MemoryConfig -Config $config

  $config | Add-Member -NotePropertyName configPath -NotePropertyValue (Resolve-Path $Path).Path -Force
  return $config
}

function Test-ExcludedSubdirectoryPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [object[]]$ExcludedSubdirectories
  )

  foreach ($excludedName in $ExcludedSubdirectories) {
    $escapedName = [regex]::Escape([string]$excludedName)
    if ($Path -match ('[\\/]' + $escapedName + '([\\/]|$)')) {
      return $true
    }
  }

  return $false
}

function Get-RecentProjectFiles {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,
    [Parameter(Mandatory = $true)]
    [datetime]$Since,
    [Parameter(Mandatory = $true)]
    [int]$MaxFiles,
    [Parameter(Mandatory = $true)]
    [object[]]$ExcludedSubdirectories
  )

  $files = Get-ChildItem -Path $ProjectRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LastWriteTime -ge $Since -and -not (Test-ExcludedSubdirectoryPath -Path $_.FullName -ExcludedSubdirectories $ExcludedSubdirectories)
    } |
    Sort-Object -Property LastWriteTime -Descending |
    Select-Object -First $MaxFiles

  return @($files)
}

function Get-GitStatusSummary {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
  )

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    return $null
  }

  if (-not (Test-Path (Join-Path $ProjectRoot '.git'))) {
    return $null
  }

  $output = & git -C $ProjectRoot status --short 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  return (($output | Where-Object { $_ -and $_.Trim() }) -join '; ')
}

function Get-WorkspaceProjectActivity {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,
    [string]$Now = (Get-Date).ToString('s')
  )

  $null = Assert-MemoryConfig -Config $Config
  $nowValue = [datetime]$Now
  $since = $nowValue.AddHours(-1 * [int]$Config.lookbackHours)

  $projectDirectories = Get-ChildItem -Path $Config.workspaceRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $Config.exclusions -notcontains $_.Name }

  $activity = @()

  foreach ($projectDirectory in $projectDirectories) {
    $recentFiles = Get-RecentProjectFiles `
      -ProjectRoot $projectDirectory.FullName `
      -Since $since `
      -MaxFiles ([int]$Config.maxFilesPerProject) `
      -ExcludedSubdirectories $Config.excludedSubdirectories

    $gitStatus = Get-GitStatusSummary -ProjectRoot $projectDirectory.FullName

    if ($recentFiles.Count -eq 0 -and -not $gitStatus) {
      continue
    }

    $lastModified = $null
    if ($recentFiles.Count -gt 0) {
      $lastModified = ($recentFiles | Select-Object -First 1).LastWriteTime
    }

    $activity += [pscustomobject]@{
      projectName = $projectDirectory.Name
      projectRoot = $projectDirectory.FullName
      modifiedFiles = @($recentFiles | ForEach-Object { $_.FullName })
      gitStatus = $gitStatus
      lastModified = $lastModified
    }
  }

  $sortedActivity = $activity | Sort-Object -Property @{ Expression = { if ($_.lastModified) { $_.lastModified } else { [datetime]::MinValue } } } -Descending |
    Select-Object -First ([int]$Config.maxProjectsPerCheckpoint)

  return @($sortedActivity)
}
