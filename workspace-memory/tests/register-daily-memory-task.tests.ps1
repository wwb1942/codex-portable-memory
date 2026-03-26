$commonScriptPath = Join-Path $PSScriptRoot '..\scripts\memory-common.ps1'
$taskScriptPath = Join-Path $PSScriptRoot '..\scripts\register-daily-memory-task.ps1'

if (Test-Path $commonScriptPath) {
  . $commonScriptPath
}

if (Test-Path $taskScriptPath) {
  . $taskScriptPath
}

Describe 'scheduled task registration' {
  It 'builds a daily task at the configured time' {
    $config = [pscustomobject]@{
      workspaceRoot = 'D:\projects'
      memoryRoot = 'D:\projects\memory'
      schedule = [pscustomobject]@{
        time = '21:00'
        taskName = 'Codex Workspace Daily Memory'
      }
      lookbackHours = 24
      maxProjectsPerCheckpoint = 10
      maxFilesPerProject = 10
      exclusions = @('_archive', 'memory')
      excludedSubdirectories = @('.git', 'node_modules')
    }

    $task = New-DailyMemoryTaskDefinition -Config $config

    $task.TaskName | Should Be 'Codex Workspace Daily Memory'
    $task.Trigger.At.ToString('HH:mm') | Should Be '21:00'
    $task.Action.Execute | Should Be 'powershell.exe'
  }

  It 'describes the configured workspace root instead of a hardcoded path' {
    $workspaceRoot = Join-Path $TestDrive 'workspace-root'
    $memoryRoot = Join-Path $workspaceRoot 'memory'
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
      exclusions = @('_archive', 'memory')
      excludedSubdirectories = @('.git', 'node_modules')
    }

    $task = New-DailyMemoryTaskDefinition -Config $config

    $task.Description | Should Be ('Writes a daily workspace memory checkpoint for ' + $workspaceRoot + '.')
  }
}
