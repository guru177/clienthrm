# Dot-source: . .\scripts\test-attendance-setup.ps1
function Ensure-TodayRosterForClockIn {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Api,
        [Parameter(Mandatory = $true)]
        [string]$Token
    )
    $today = (Get-Date).ToString("yyyy-MM-dd")
    $sh = & $Api "GET" "/admin/shifts" $null $Token
    $shiftId = $null
    if ($sh.Ok -and $sh.Json.data) {
        $def = @($sh.Json.data | Where-Object { $_.is_default -eq $true } | Select-Object -First 1)
        if ($def.Count -gt 0) { $shiftId = $def[0].id }
        elseif ($sh.Json.data.Count -gt 0) { $shiftId = $sh.Json.data[0].id }
    }
    if (-not $shiftId) { return }
    $me = & $Api "GET" "/auth/me" $null $Token
    $uid = 1
    if ($me.Ok -and $me.Json.data.id) { $uid = [int]$me.Json.data.id }
    & $Api "POST" "/admin/shifts/daily-roster" @{
        entries = @(
            @{
                user_id             = $uid
                roster_date         = $today
                shift_template_id   = $shiftId
                is_day_off          = $false
            }
        )
    } $Token | Out-Null
}
