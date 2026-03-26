$commonScriptPath = Join-Path $PSScriptRoot '..\scripts\memory-common.ps1'
if (Test-Path $commonScriptPath) {
  . $commonScriptPath
}

Describe 'workspace activity collection' {
  It 'excludes configured folders and returns git summary for repositories' {
    $workspaceRoot = Join-Path $TestDrive 'workspace'
    $memoryRoot = Join-Path $workspaceRoot 'memory'
    $archiveRoot = Join-Path $workspaceRoot '_archive'
    $sampleRepoRoot = Join-Path $workspaceRoot 'sample-repo'

    New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $memoryRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $archiveRoot | Out-Null
    New-Item -ItemType Directory -Force -Path $sampleRepoRoot | Out-Null

    & git init $sampleRepoRoot | Out-Null
    & git -C $sampleRepoRoot config user.email 'codex@example.com' | Out-Null
    & git -C $sampleRepoRoot config user.name 'Codex' | Out-Null

    $filePath = Join-Path $sampleRepoRoot 'notes.txt'
    Set-Content -Path $filePath -Value 'first version' -Encoding UTF8
    & git -C $sampleRepoRoot add notes.txt | Out-Null
    & git -C $sampleRepoRoot commit -m 'init' | Out-Null
    Set-Content -Path $filePath -Value 'updated version' -Encoding UTF8

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

    $activity = Get-WorkspaceProjectActivity -Config $config -Now '2026-03-24T21:00:00'
    $projectNames = @($activity | ForEach-Object { $_.projectName })
    $sampleRepo = $activity | Where-Object { $_.projectName -eq 'sample-repo' }

    ($projectNames -contains '_archive') | Should Be $false
    ($projectNames -contains 'sample-repo') | Should Be $true
    $sampleRepo.gitStatus | Should Match 'M notes.txt'
  }
}
