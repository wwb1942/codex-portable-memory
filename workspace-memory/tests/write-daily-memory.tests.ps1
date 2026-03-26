$commonScriptPath = Join-Path $PSScriptRoot '..\scripts\memory-common.ps1'
$writerScriptPath = Join-Path $PSScriptRoot '..\scripts\write-daily-memory.ps1'

if (Test-Path $commonScriptPath) {
  . $commonScriptPath
}

if (Test-Path $writerScriptPath) {
  . $writerScriptPath
}

Describe 'daily workspace memory writer' {
  It 'creates the current daily file with the standard sections' {
    $workspaceRoot = Join-Path $TestDrive 'workspace'
    $memoryRoot = Join-Path $workspaceRoot 'memory'
    New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $memoryRoot | Out-Null

    $config = [pscustomobject]@{
      workspaceRoot = $workspaceRoot
      memoryRoot = $memoryRoot
      schedule = [pscustomobject]@{
        time = '21:00'
        taskName = 'Codex Workspace Daily Memory'
      }
      lookbackHours = 24
      maxProjectsPerCheckpoint = 10
      maxFilesPerProject = 10
      exclusions = @('memory')
      excludedSubdirectories = @('.git', 'node_modules')
    }

    $result = Write-DailyMemoryCheckpoint -Config $config -Date '2026-03-24' -Now '2026-03-24T21:00:00'
    $content = Get-Content -Path $result.dailyFilePath -Raw -Encoding UTF8

    (Test-Path $result.dailyFilePath) | Should Be $true
    $content | Should Match '## Automated Checkpoints'
    $content | Should Match '2026-03-24'
  }

  It 'writes the configured workspace root into the daily file header' {
    $workspaceRoot = Join-Path $TestDrive 'workspace-custom-root'
    $memoryRoot = Join-Path $workspaceRoot 'memory'
    New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $memoryRoot | Out-Null

    $config = [pscustomobject]@{
      workspaceRoot = $workspaceRoot
      memoryRoot = $memoryRoot
      schedule = [pscustomobject]@{
        time = '21:00'
        taskName = 'Codex Workspace Daily Memory'
      }
      lookbackHours = 24
      maxProjectsPerCheckpoint = 10
      maxFilesPerProject = 10
      exclusions = @('memory')
      excludedSubdirectories = @('.git', 'node_modules')
    }

    $result = Write-DailyMemoryCheckpoint -Config $config -Date '2026-03-24' -Now '2026-03-24T21:00:00'
    $content = Get-Content -Path $result.dailyFilePath -Raw -Encoding UTF8
    $expectedLine = [regex]::Escape('- Workspace: `' + $workspaceRoot + '`')

    $content | Should Match $expectedLine
  }

  It 'appends an assistant summary when provided' {
    $workspaceRoot = Join-Path $TestDrive 'workspace-summary'
    $memoryRoot = Join-Path $workspaceRoot 'memory'
    New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $memoryRoot | Out-Null

    $config = [pscustomobject]@{
      workspaceRoot = $workspaceRoot
      memoryRoot = $memoryRoot
      schedule = [pscustomobject]@{
        time = '21:00'
        taskName = 'Codex Workspace Daily Memory'
      }
      lookbackHours = 24
      maxProjectsPerCheckpoint = 10
      maxFilesPerProject = 10
      exclusions = @('memory')
      excludedSubdirectories = @('.git', 'node_modules')
    }

    $result = Write-DailyMemoryCheckpoint `
      -Config $config `
      -Date '2026-03-24' `
      -Now '2026-03-24T21:15:00' `
      -Source 'assistant-session' `
      -Summary 'Added workspace memory scripts and tests'

    $content = Get-Content -Path $result.dailyFilePath -Raw -Encoding UTF8

    $content | Should Match 'assistant-session'
    $content | Should Match 'Added workspace memory scripts and tests'
  }
}
