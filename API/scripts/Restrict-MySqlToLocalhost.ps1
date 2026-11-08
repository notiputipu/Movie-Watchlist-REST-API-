[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$ServiceName = 'MySQL80')

$ErrorActionPreference = 'Stop'
$serviceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$imagePath = (Get-ItemProperty -LiteralPath $serviceKey -Name ImagePath).ImagePath
$match = [regex]::Match($imagePath, '--defaults-file="([^"]+)"')
if (-not $match.Success) { throw 'Could not locate the service configuration file.' }
$iniPath = (Resolve-Path -LiteralPath $match.Groups[1].Value).Path
$original = [System.IO.File]::ReadAllText($iniPath)
$lines = [regex]::Split($original, '\r?\n')
$updated = New-Object 'System.Collections.Generic.List[string]'
$inServerSection = $false
$foundServerSection = $false
foreach ($line in $lines) {
    if ($line -match '^\s*\[([^]]+)\]\s*$') {
        $inServerSection = $Matches[1] -eq 'mysqld'
        $updated.Add($line)
        if ($inServerSection) {
            $foundServerSection = $true
            $updated.Add('bind-address=127.0.0.1')
            $updated.Add('mysqlx-bind-address=127.0.0.1')
        }
    } elseif (-not ($inServerSection -and $line -match '^\s*(bind-address|mysqlx-bind-address)\s*=')) {
        $updated.Add($line)
    }
}
if (-not $foundServerSection) { throw 'No [mysqld] section found; configuration was not changed.' }
Write-Output "Configuration: $iniPath"
Write-Output 'Proposed [mysqld] settings: bind-address=127.0.0.1; mysqlx-bind-address=127.0.0.1'
if ($PSCmdlet.ShouldProcess($iniPath, "Back up configuration, restrict both MySQL listeners to loopback, and restart $ServiceName")) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script from an Administrator PowerShell. No changes were made.'
    }
    $backup = $iniPath + '.filmlog-' + [Guid]::NewGuid().ToString('N') + '.bak'
    Copy-Item -LiteralPath $iniPath -Destination $backup -ErrorAction Stop
    $encoding = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($iniPath, ($updated -join "`r`n"), $encoding)
        Restart-Service -Name $ServiceName -ErrorAction Stop
        (Get-Service -Name $ServiceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
        Write-Output "MySQL is running with loopback bindings. Backup: $backup"
    } catch {
        [System.IO.File]::WriteAllText($iniPath, $original, $encoding)
        if ((Get-Service -Name $ServiceName).Status -ne 'Running') { Start-Service -Name $ServiceName }
        throw
    }
}
