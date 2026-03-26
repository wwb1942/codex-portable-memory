$commonScriptPath = Join-Path $PSScriptRoot '..\scripts\memory-common.ps1'
$sessionScriptPath = Join-Path $PSScriptRoot '..\scripts\write-project-session-log.ps1'

if (Test-Path $commonScriptPath) {
  . $commonScriptPath
}

if (Test-Path $sessionScriptPath) {
  . $sessionScriptPath
}

Describe 'project session log writer' {
  It 'creates a project session log using the existing template convention' {
    $projectRoot = Join-Path $TestDrive 'sample-app'
    $templatePath = Join-Path $TestDrive 'SESSION-LOG.template.md'
    New-Item -ItemType Directory -Force -Path $projectRoot | Out-Null

    $templateContent = @(
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
    Set-Content -Path $templatePath -Value $templateContent -Encoding UTF8

    $path = Write-ProjectSessionLog `
      -ProjectRoot $projectRoot `
      -Date '2026-03-24' `
      -Summary 'Validated daily memory setup' `
      -TemplatePath $templatePath

    $content = Get-Content -Path $path -Raw -Encoding UTF8

    (Test-Path $path) | Should Be $true
    $content | Should Match '## Work Summary'
    $content | Should Match 'Validated daily memory setup'
  }

  It 'normalizes multi-line summaries into a single bullet line' {
    $projectRoot = Join-Path $TestDrive 'sample-app-multiline'
    $templatePath = Join-Path $TestDrive 'SESSION-LOG.template.md'
    New-Item -ItemType Directory -Force -Path $projectRoot | Out-Null

    $templateContent = @(
      '# Session Log - YYYY-MM-DD',
      '',
      '## Work Summary',
      ''
    )
    Set-Content -Path $templatePath -Value $templateContent -Encoding UTF8

    $path = Write-ProjectSessionLog `
      -ProjectRoot $projectRoot `
      -Date '2026-03-24' `
      -Summary "Line one`r`nLine two" `
      -TemplatePath $templatePath

    $content = Get-Content -Path $path -Raw -Encoding UTF8

    $content | Should Match '- Line one Line two'
  }
}
