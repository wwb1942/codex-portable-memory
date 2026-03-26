param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot '..\config\memory-config.json'),
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [string]$Now = (Get-Date).ToString('s')
)

. (Join-Path $PSScriptRoot 'memory-common.ps1')

function Get-DailyMemoryFilePath {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,
    [Parameter(Mandatory = $true)]
    [string]$Date
  )

  $dailyRoot = Join-Path $Config.memoryRoot 'daily'
  if (-not (Test-Path $dailyRoot)) {
    New-Item -ItemType Directory -Force -Path $dailyRoot | Out-Null
  }

  return (Join-Path $dailyRoot ($Date + '.md'))
}

function Initialize-DailyMemoryFile {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Date
  )

  if (Test-Path $Path) {
    return
  }

  $content = @(
    '# Workspace Daily Memory - ' + $Date,
    '',
    '## Scope',
    '',
    '- Workspace: `' + $Config.workspaceRoot + '`',
    '- Date: ' + $Date,
    '',
    '## Automated Checkpoints',
    ''
  )

  Set-Content -Path $Path -Value $content -Encoding UTF8
}

function Write-DailyMemoryCheckpoint {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config,
    [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
    [string]$Now = (Get-Date).ToString('s'),
    [string]$Source = 'scheduled/local run',
    [string]$Summary
  )

  $null = Assert-MemoryConfig -Config $Config
  $dailyFilePath = Get-DailyMemoryFilePath -Config $Config -Date $Date
  Initialize-DailyMemoryFile -Config $Config -Path $dailyFilePath -Date $Date
  $activity = Get-WorkspaceProjectActivity -Config $Config -Now $Now

  $checkpoint = New-Object System.Collections.Generic.List[string]
  $checkpoint.Add('### Checkpoint ' + $Now)
  $checkpoint.Add('')
  $checkpoint.Add('- Source: ' + $Source)
  $checkpoint.Add('- Status: daily file ensured')

  if ($Summary) {
    $checkpoint.Add('- Summary: ' + $Summary)
  }

  if ($activity.Count -eq 0) {
    $checkpoint.Add('- Activity: no recent project activity detected')
  } else {
    foreach ($projectActivity in $activity) {
      $checkpoint.Add('- Project: `' + $projectActivity.projectName + '`')

      if ($projectActivity.modifiedFiles.Count -gt 0) {
        $recentFiles = @($projectActivity.modifiedFiles | ForEach-Object { Split-Path $_ -Leaf }) -join ', '
        $checkpoint.Add('- Recent files: ' + $recentFiles)
      }

      if ($projectActivity.gitStatus) {
        $checkpoint.Add('- Git status: ' + $projectActivity.gitStatus)
      }
    }
  }

  $checkpoint.Add('')

  Add-Content -Path $dailyFilePath -Value $checkpoint -Encoding UTF8

  return [pscustomobject]@{
    dailyFilePath = $dailyFilePath
    timestamp = $Now
    projectCount = $activity.Count
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  $config = Get-MemoryConfig -Path $ConfigPath
  Write-DailyMemoryCheckpoint -Config $config -Date $Date -Now $Now
}
