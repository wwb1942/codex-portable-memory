param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot '..\config\memory-config.json')
)

. (Join-Path $PSScriptRoot 'memory-common.ps1')

function New-DailyMemoryTaskDefinition {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Config
  )

  $null = Assert-MemoryConfig -Config $Config

  $triggerAt = [datetime]::ParseExact([string]$Config.schedule.time, 'HH:mm', $null)
  $scriptPath = Join-Path $Config.memoryRoot 'scripts\write-daily-memory.ps1'
  $resolvedConfigPath = if ($Config.configPath) { $Config.configPath } else { Join-Path $Config.memoryRoot 'config\memory-config.json' }
  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ConfigPath "{1}"' -f $scriptPath, $resolvedConfigPath

  return [pscustomobject]@{
    TaskName = [string]$Config.schedule.taskName
    Trigger = [pscustomobject]@{
      At = $triggerAt
      Time = [string]$Config.schedule.time
    }
    Action = [pscustomobject]@{
      Execute = 'powershell.exe'
      Arguments = $arguments
    }
    Description = ('Writes a daily workspace memory checkpoint for ' + [string]$Config.workspaceRoot + '.')
  }
}

function Register-DailyMemoryTask {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$TaskDefinition
  )

  $commandLine = '{0} {1}' -f $TaskDefinition.Action.Execute, $TaskDefinition.Action.Arguments
  $arguments = @(
    '/Create',
    '/F',
    '/SC', 'DAILY',
    '/ST', $TaskDefinition.Trigger.Time,
    '/TN', $TaskDefinition.TaskName,
    '/TR', $commandLine
  )

  $output = & schtasks.exe @arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ('Failed to register scheduled task: ' + ($output -join ' '))
  }

  return [pscustomobject]@{
    TaskName = $TaskDefinition.TaskName
    Output = ($output -join [Environment]::NewLine)
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  $config = Get-MemoryConfig -Path $ConfigPath
  $taskDefinition = New-DailyMemoryTaskDefinition -Config $config
  Register-DailyMemoryTask -TaskDefinition $taskDefinition
}
