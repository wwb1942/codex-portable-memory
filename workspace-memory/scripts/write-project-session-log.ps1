param(
  [string]$ProjectRoot,
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [string]$Summary,
  [string]$TemplatePath = (Join-Path $PSScriptRoot '..\templates\SESSION-LOG.template.md')
)

. (Join-Path $PSScriptRoot 'memory-common.ps1')

function New-ProjectSessionLogContent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectName,
    [Parameter(Mandatory = $true)]
    [string]$Date,
    [Parameter(Mandatory = $true)]
    [string]$TemplatePath
  )

  if (Test-Path $TemplatePath) {
    $templateLines = Get-Content -Path $TemplatePath -Encoding UTF8
  } else {
    $templateLines = @(
      '# Session Log - YYYY-MM-DD',
      '',
      '## Scope',
      '',
      '- Project:',
      '- Date:',
      '',
      '## Work Summary',
      '',
      '## Current Result',
      ''
    )
  }

  $content = foreach ($line in $templateLines) {
    if ($line -eq '# Session Log - YYYY-MM-DD') {
      '# Session Log - ' + $Date
    } elseif ($line -eq '- Project:') {
      '- Project: `' + $ProjectName + '`'
    } elseif ($line -eq '- Date:') {
      '- Date: ' + $Date
    } else {
      $line
    }
  }

  return @($content)
}

function Write-ProjectSessionLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,
    [Parameter(Mandatory = $true)]
    [string]$Date,
    [Parameter(Mandatory = $true)]
    [string]$Summary,
    [string]$TemplatePath = (Join-Path $PSScriptRoot '..\templates\SESSION-LOG.template.md')
  )

  if (-not (Test-Path $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
  }

  $projectName = Split-Path -Path $ProjectRoot -Leaf
  $logPath = Join-Path $ProjectRoot ('session-log-' + $Date + '.md')
  $cleanSummary = (($Summary -replace '\r?\n', ' ') -replace '\s{2,}', ' ').Trim()

  if (-not (Test-Path $logPath)) {
    $initialContent = New-ProjectSessionLogContent -ProjectName $projectName -Date $Date -TemplatePath $TemplatePath
    Set-Content -Path $logPath -Value $initialContent -Encoding UTF8
  }

  $appendLines = @('')
  $logContent = Get-Content -Path $logPath -Raw -Encoding UTF8

  if ($logContent -notmatch '(?m)^## Assistant Updates$') {
    $appendLines += '## Assistant Updates'
    $appendLines += ''
  }

  $appendLines += '- ' + $cleanSummary
  $appendLines += ''
  Add-Content -Path $logPath -Value $appendLines -Encoding UTF8

  return $logPath
}

if ($MyInvocation.InvocationName -ne '.' -and $ProjectRoot -and $Summary) {
  Write-ProjectSessionLog -ProjectRoot $ProjectRoot -Date $Date -Summary $Summary -TemplatePath $TemplatePath
}
