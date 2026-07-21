
$BASE = "http://127.0.0.1:3001"
$EMAIL = "guruprasad6282@gmail.com"
$PASSWORD = "Guru@1234"
$script:TOKEN = ""
$script:PASS = 0
$script:FAIL = 0
$script:WARNS = [System.Collections.Generic.List[string]]::new()

function req([string]$Label, [string]$Method="GET", [string]$Url, [string]$Body="", [switch]$NoAuth, [int]$Expect=0) {
    $hdrs = @{ "Content-Type"="application/json" }
    if ((-not $NoAuth) -and $script:TOKEN) { $hdrs["Authorization"] = "Bearer $($script:TOKEN)" }
    try {
        $p = @{ Uri=$Url; Method=$Method; Headers=$hdrs; UseBasicParsing=$true; TimeoutSec=15 }
        if ($Body) { $p["Body"] = $Body }
        $r = Invoke-WebRequest @p
        $code = $r.StatusCode
        $ok = ($Expect -eq 0 -and $code -lt 400) -or ($Expect -gt 0 -and $code -eq $Expect)
        if ($ok) { $script:PASS++; Write-Host "  OK [$code] $Label" -ForegroundColor Green }
        else      { $script:FAIL++; Write-Host "  FAIL [$code] $Label" -ForegroundColor Red; $wMsg = "[" + $code + "] " + $Label; $script:WARNS.Add($wMsg) }
        return $r.Content
    } catch {
        $code = try { $_.Exception.Response.StatusCode.value__ } catch { 0 }
        $msg  = try { $_.ErrorDetails.Message } catch { $_.Exception.Message }
        $ok = ($Expect -gt 0 -and $code -eq $Expect)
        if ($ok) { $script:PASS++; Write-Host "  OK [$code] $Label (expected error)" -ForegroundColor Green }
        else      { $script:FAIL++; Write-Host "  FAIL [$code] $Label - $msg" -ForegroundColor Red; $wMsg = "[" + $code + "] " + $Label + " - " + $msg; $script:WARNS.Add($wMsg) }
        return $msg
    }
}

$TODAY = (Get-Date -Format "yyyy-MM-dd")
$MONTH = (Get-Date).Month
$YEAR  = (Get-Date).Year

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  HRM LOCAL API TEST  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
Write-Host "=====================================`n" -ForegroundColor Cyan

# HEALTH
Write-Host "--- HEALTH ---" -ForegroundColor Yellow
$raw = req "Health" -Url "$BASE/api/health" -NoAuth
try { $h = $raw | ConvertFrom-Json; Write-Host "    DB=$($h.database.backend) OK=$($h.database.ok)" -ForegroundColor DarkCyan } catch {}

# AUTH
Write-Host "`n--- AUTH ---" -ForegroundColor Yellow
$loginRaw = req "Login" -Method POST -Url "$BASE/api/auth/login" -Body "{`"email`":`"$EMAIL`",`"password`":`"$PASSWORD`"}" -NoAuth
try {
    $ld = $loginRaw | ConvertFrom-Json
    $script:TOKEN = $ld.data.token
    $ORG_ID = $ld.data.user.organization_id
    Write-Host "    OrgID=$ORG_ID  Token=$($script:TOKEN.Substring(0,30))..." -ForegroundColor DarkCyan
} catch { Write-Host "    Could not parse login" -ForegroundColor Red }

req "Me /auth/me" -Url "$BASE/api/auth/me" | Out-Null
req "Bad Login expect-401" -Method POST -Url "$BASE/api/auth/login" -Body "{`"email`":`"$EMAIL`",`"password`":`"wrongpass`"}" -NoAuth -Expect 401 | Out-Null

# USERS
Write-Host "`n--- USERS ---" -ForegroundColor Yellow
req "List Users" -Url "$BASE/api/admin/users" | Out-Null
req "List Users page=1" -Url "$BASE/api/admin/users?page=1&per_page=5" | Out-Null
req "Search Users" -Url "$BASE/api/admin/users?search=guru" | Out-Null
$RND = Get-Random -Maximum 9999
$cuRaw = req "Create User" -Method POST -Url "$BASE/api/admin/users" -Body "{`"name`":`"TestEmp$RND`",`"email`":`"test$RND@hrm.test`",`"password`":`"Test@1234`",`"status`":`"active`"}" -Expect 201
$NEW_UID = 0
try { $NEW_UID = ($cuRaw | ConvertFrom-Json).data.id; Write-Host "    Created user ID=$NEW_UID" -ForegroundColor DarkCyan } catch {}
if ($NEW_UID -gt 0) {
    req "Get User $NEW_UID" -Url "$BASE/api/admin/users/$NEW_UID" | Out-Null
    req "Update User $NEW_UID" -Method PUT -Url "$BASE/api/admin/users/$NEW_UID" -Body "{`"status`":`"inactive`"}" | Out-Null
}

# DEPARTMENTS
Write-Host "`n--- DEPARTMENTS ---" -ForegroundColor Yellow
req "List Depts" -Url "$BASE/api/admin/departments" | Out-Null
$cdRaw = req "Create Dept" -Method POST -Url "$BASE/api/admin/departments" -Body "{`"name`":`"TestDept$RND`"}" -Expect 201
$DEPT_ID = 0
try { $DEPT_ID = ($cdRaw | ConvertFrom-Json).data.id; Write-Host "    Created dept ID=$DEPT_ID" -ForegroundColor DarkCyan } catch {}
if ($DEPT_ID -gt 0) {
    req "Update Dept $DEPT_ID" -Method PUT -Url "$BASE/api/admin/departments/$DEPT_ID" -Body "{`"name`":`"Updated$RND`"}" | Out-Null
    req "Delete Dept $DEPT_ID" -Method DELETE -Url "$BASE/api/admin/departments/$DEPT_ID" | Out-Null
}

# DESIGNATIONS
Write-Host "`n--- DESIGNATIONS ---" -ForegroundColor Yellow
req "List Designations" -Url "$BASE/api/admin/designations" | Out-Null
$cdesRaw = req "Create Designation" -Method POST -Url "$BASE/api/admin/designations" -Body "{`"name`":`"TestDesg$RND`"}" -Expect 201
$DESG_ID = 0
try { $DESG_ID = ($cdesRaw | ConvertFrom-Json).data.id; Write-Host "    Created desg ID=$DESG_ID" -ForegroundColor DarkCyan } catch {}

# ROLES
Write-Host "`n--- ROLES ---" -ForegroundColor Yellow
req "List Roles" -Url "$BASE/api/admin/roles" | Out-Null
req "List Permissions" -Url "$BASE/api/admin/permissions" | Out-Null

# ATTENDANCE
Write-Host "`n--- ATTENDANCE ---" -ForegroundColor Yellow
req "Today Attendance" -Url "$BASE/api/admin/attendance/today" | Out-Null
req "Attendance List" -Url "$BASE/api/admin/attendance" | Out-Null
req "Attendance Stats" -Url "$BASE/api/admin/attendance/stats" | Out-Null

# REPORTS
Write-Host "`n--- REPORTS ---" -ForegroundColor Yellow
req "Daily Attendance Report" -Url "$BASE/api/admin/reports/daily-attendance?date=$TODAY" | Out-Null
req "Attendance Summary" -Url "$BASE/api/admin/reports/attendance-summary?month=$MONTH&year=$YEAR" | Out-Null
req "Leave Balance Report" -Url "$BASE/api/admin/reports/leave-balance" | Out-Null
req "Payroll Register" -Url "$BASE/api/admin/reports/payroll-register?month=$MONTH&year=$YEAR" | Out-Null
req "Payroll Split" -Url "$BASE/api/admin/reports/payroll-split?month=$MONTH&year=$YEAR" | Out-Null
req "Attendance Register" -Url "$BASE/api/admin/reports/attendance-register" | Out-Null
req "Employee Attendance Log" -Url "$BASE/api/admin/reports/employee-attendance-log?user_id=156" | Out-Null

# LEAVE
Write-Host "`n--- LEAVE ---" -ForegroundColor Yellow
req "Leave Types" -Url "$BASE/api/admin/leave-types" | Out-Null
req "Leave Requests" -Url "$BASE/api/admin/leave-requests" | Out-Null
req "Leave Credits" -Url "$BASE/api/admin/leave-credits" | Out-Null

# PAYROLL
Write-Host "`n--- PAYROLL ---" -ForegroundColor Yellow
req "Payroll Month" -Url "$BASE/api/admin/payroll?month=$MONTH&year=$YEAR" | Out-Null
req "Payslips" -Url "$BASE/api/admin/payslips" | Out-Null
req "Salaries" -Url "$BASE/api/admin/salaries" | Out-Null

# SHIFTS
Write-Host "`n--- SHIFTS ---" -ForegroundColor Yellow
req "Shift Templates" -Url "$BASE/api/admin/shifts" | Out-Null
req "Shift Assignments" -Url "$BASE/api/admin/shifts/assignments" | Out-Null

# HOLIDAYS
Write-Host "`n--- HOLIDAYS ---" -ForegroundColor Yellow
req "Holidays" -Url "$BASE/api/admin/holidays" | Out-Null

# SETTINGS
Write-Host "`n--- SETTINGS ---" -ForegroundColor Yellow
req "App Settings" -Url "$BASE/api/admin/settings" | Out-Null

# BIOMETRIC
Write-Host "`n--- BIOMETRIC ---" -ForegroundColor Yellow
req "Biometric Devices" -Url "$BASE/api/admin/biometric/devices" | Out-Null
req "Biometric Punches" -Url "$BASE/api/admin/biometric/punches" | Out-Null

# ANALYTICS
Write-Host "`n--- ANALYTICS ---" -ForegroundColor Yellow
req "Analytics Dashboard" -Url "$BASE/api/admin/analytics/dashboard" | Out-Null
req "Analytics Overview" -Url "$BASE/api/admin/analytics/overview" | Out-Null

# NOTIFICATIONS
Write-Host "`n--- NOTIFICATIONS ---" -ForegroundColor Yellow
req "Org Notifications" -Url "$BASE/api/admin/notifications" | Out-Null

# WORKFLOWS
Write-Host "`n--- WORKFLOWS ---" -ForegroundColor Yellow
req "Workflows" -Url "$BASE/api/admin/workflows" | Out-Null

# SUBSCRIPTION / BILLING
Write-Host "`n--- SUBSCRIPTION / BILLING ---" -ForegroundColor Yellow
req "Subscription" -Url "$BASE/api/admin/subscription" | Out-Null
req "Plans" -Url "$BASE/api/admin/subscription/plans" | Out-Null
req "Billing" -Url "$BASE/api/admin/billing" | Out-Null

# CHAT
Write-Host "`n--- CHAT ---" -ForegroundColor Yellow
req "Chat Channels" -Url "$BASE/api/admin/chat/channels" | Out-Null

# PROJECTS
Write-Host "`n--- PROJECTS ---" -ForegroundColor Yellow
req "Projects" -Url "$BASE/api/admin/projects" | Out-Null

# CLEANUP
if ($NEW_UID -gt 0) {
    Write-Host "`n--- CLEANUP ---" -ForegroundColor Yellow
    req "Delete Test User" -Method DELETE -Url "$BASE/api/admin/users/$NEW_UID" | Out-Null
}

# SUMMARY
$TOTAL = $script:PASS + $script:FAIL
$PCT   = if ($TOTAL -gt 0) { [math]::Round(($script:PASS / $TOTAL) * 100, 1) } else { 0 }
$COLOR = if ($script:FAIL -eq 0) { "Green" } elseif ($script:FAIL -lt 5) { "Yellow" } else { "Red" }

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  RESULTS: $($script:PASS)/$TOTAL PASSED ($PCT%)" -ForegroundColor $COLOR
Write-Host "=====================================" -ForegroundColor Cyan

if ($script:WARNS.Count -gt 0) {
    Write-Host "`nFAILED ENDPOINTS ($($script:WARNS.Count)):" -ForegroundColor Red
    foreach ($w in $script:WARNS) { Write-Host "  - $w" -ForegroundColor Red }
}
Write-Host ""
