$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path;
node (Join-Path $repoRoot 'scripts/bootstrap.mjs') @args;
exit $LASTEXITCODE;
