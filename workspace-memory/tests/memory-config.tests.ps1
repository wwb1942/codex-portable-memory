$scriptPath = Join-Path $PSScriptRoot '..\scripts\memory-common.ps1'
if (Test-Path $scriptPath) {
  . $scriptPath
}

Describe 'memory config' {
  It 'loads the example schedule and excluded directories' {
    $configPath = Join-Path $PSScriptRoot '..\config\memory-config.example.json'
    $config = Get-MemoryConfig -Path $configPath

    $config.schedule.time | Should Be '21:00'
    ($config.exclusions -contains '_archive') | Should Be $true
    ($config.exclusions -contains 'memory') | Should Be $true
    $config.memoryRoot | Should Match 'workspace-memory'
  }
}
