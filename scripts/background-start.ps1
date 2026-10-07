param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeExecutable = (Resolve-Path -LiteralPath $NodePath).Path
$launcher = Join-Path $PSScriptRoot 'local.mjs'
$logDirectory = Join-Path $projectRoot 'logs'
[IO.Directory]::CreateDirectory($logDirectory) | Out-Null
$taskLog = Join-Path $logDirectory 'background-task.log'
try {
    if ([IO.Path]::GetFileName($nodeExecutable) -ne 'node.exe') { throw 'Expected node.exe.' }
    # A native Process handle waits for this launcher only, rather than the
    # descendant tree that includes the persistent collector. Keep its console
    # hidden and capture both streams without truncating an unknown exit code.
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodeExecutable
    $startInfo.Arguments = '"' + $launcher + '" worker'
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $child = [Diagnostics.Process]::Start($startInfo)
    $outputTask = $child.StandardOutput.ReadToEndAsync()
    $errorTask = $child.StandardError.ReadToEndAsync()
    $child.WaitForExit()
    $launcherExitCode = $child.ExitCode
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $logDirectory 'background-launch.out.log'), $outputTask.Result, $utf8)
    [IO.File]::WriteAllText((Join-Path $logDirectory 'background-launch.err.log'), $errorTask.Result, $utf8)
    $child.Dispose()
    Add-Content -LiteralPath $taskLog -Value ('{0} launcher exit={1}' -f [DateTime]::UtcNow.ToString('o'), $launcherExitCode)
    exit $launcherExitCode
} catch {
    Add-Content -LiteralPath $taskLog -Value ('{0} launcher failed: {1}' -f [DateTime]::UtcNow.ToString('o'), $_.Exception.Message)
    exit 1
}
