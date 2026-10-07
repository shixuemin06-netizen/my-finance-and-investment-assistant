param(
    [ValidateSet('Install','Status','Remove')][string]$Mode = 'Status',
    [string]$NodePath = '',
    [switch]$StartNow
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$hash = [Security.Cryptography.SHA256]::Create()
try {
    $keyBytes = $hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant()))
    $projectKey = -join ($keyBytes | ForEach-Object { $_.ToString('x2') })
} finally { $hash.Dispose() }
$taskName = 'FinanceReader-' + $projectKey.Substring(0,16)
$taskPath = '\'
$description = 'Finance Reader background worker; project=' + $projectRoot
$backgroundScript = Join-Path $PSScriptRoot 'background-start.ps1'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$userSid = $identity.User.Value
function Escape-Xml([string]$value) { return [Security.SecurityElement]::Escape($value) }
function Get-OwnedTask {
    $existing = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
    if ($existing) {
        if ($existing.Description -ne $description -or $existing.Actions.Count -ne 1 -or $existing.Actions[0].Arguments -notlike ('*"' + $backgroundScript + '"*')) {
            throw 'A task with this name belongs to another action; it was not changed.'
        }
    }
    return $existing
}
$existing = Get-OwnedTask
if ($Mode -eq 'Remove') {
    if ($existing) { Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false }
    [PSCustomObject]@{installed=$false;taskName=$taskName;projectRoot=$projectRoot} | ConvertTo-Json -Compress
    exit
}
if ($Mode -eq 'Install') {
    if (!$NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    $nodeExecutable = (Resolve-Path -LiteralPath $NodePath).Path
    if ([IO.Path]::GetFileName($nodeExecutable) -ne 'node.exe') { throw 'Expected node.exe.' }
    if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'local.mjs')) -or !(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/tsx/dist/loader.mjs'))) {
        throw 'The project runtime or dependencies are missing.'
    }
    $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
    $actionArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $backgroundScript + '" -NodePath "' + $nodeExecutable + '"'
    $start = [DateTime]::Now.AddMinutes(60).ToString('yyyy-MM-ddTHH:mm:ss')
    $subscription = '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name=''Microsoft-Windows-Power-Troubleshooter''] and EventID=1]]</Select></Query></QueryList>'
    # InteractiveToken needs no stored Windows password. It also works while
    # the current user's session is locked; it does not run after user logoff.
    # WakeToRun stays false: Modern Standby may suspend ordinary Node programs.
    $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$(Escape-Xml $description)</Description><URI>\$taskName</URI></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>$(Escape-Xml $userSid)</UserId><Delay>PT15S</Delay></LogonTrigger>
    <TimeTrigger><Repetition><Interval>PT1H</Interval></Repetition><StartBoundary>$start</StartBoundary><Enabled>true</Enabled></TimeTrigger>
    <EventTrigger><Enabled>true</Enabled><Subscription>$(Escape-Xml $subscription)</Subscription><Delay>PT30S</Delay></EventTrigger>
    <SessionStateChangeTrigger><Enabled>true</Enabled><UserId>$(Escape-Xml $userSid)</UserId><StateChange>SessionUnlock</StateChange><Delay>PT15S</Delay></SessionStateChangeTrigger>
  </Triggers>
  <Principals><Principal id="CurrentUser"><UserId>$(Escape-Xml $userSid)</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT2M</ExecutionTimeLimit><Priority>7</Priority><RestartOnFailure><Interval>PT5M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions Context="CurrentUser"><Exec><Command>$(Escape-Xml $powershell)</Command><Arguments>$(Escape-Xml $actionArguments)</Arguments><WorkingDirectory>$(Escape-Xml $projectRoot)</WorkingDirectory></Exec></Actions>
</Task>
"@
    Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Xml $xml -Force | Out-Null
    if ($StartNow) { Start-ScheduledTask -TaskName $taskName -TaskPath $taskPath }
    $existing = Get-OwnedTask
}
if (!$existing) {
    [PSCustomObject]@{installed=$false;taskName=$taskName;projectRoot=$projectRoot} | ConvertTo-Json -Compress
    exit
}
$info = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath $taskPath
[PSCustomObject]@{
    installed=$true
    taskName=$taskName
    taskPath=$taskPath
    state=[string]$existing.State
    enabled=$existing.Settings.Enabled
    hidden=$existing.Settings.Hidden
    wakeToRun=$existing.Settings.WakeToRun
    startWhenAvailable=$existing.Settings.StartWhenAvailable
    triggerCount=$existing.Triggers.Count
    nextRunTime=$info.NextRunTime.ToString('o')
    lastRunTime=$info.LastRunTime.ToString('o')
    lastTaskResult=$info.LastTaskResult
    projectRoot=$projectRoot
} | ConvertTo-Json -Compress
