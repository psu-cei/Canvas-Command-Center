# File: scripts/Test-CanvasConnection.ps1
# READ ONLY — verifies your Canvas token works. Changes nothing in Canvas.
#
# Endpoints used:
#   GET /api/v1/users/self                         -> who the token belongs to
#   GET /api/v1/courses?enrollment_state=active    -> your active courses (paginated)
#
# Usage (PowerShell 7+):
#   $env:CANVAS_BASE_URL = 'https://[PLACEHOLDER].instructure.com'
#   $env:CANVAS_TOKEN    = Read-Host 'Canvas token' -MaskInput
#   pwsh ./scripts/Test-CanvasConnection.ps1
#
# Setting the variables this way keeps the token in memory for this terminal
# session only — it is not written to disk or shell history.

$ErrorActionPreference = 'Stop'

if (-not $env:CANVAS_BASE_URL -or -not $env:CANVAS_TOKEN) {
    Write-Host 'Set $env:CANVAS_BASE_URL and $env:CANVAS_TOKEN first (see the top of this file).' -ForegroundColor Yellow
    exit 1
}

$base    = $env:CANVAS_BASE_URL.TrimEnd('/')
$headers = @{ Authorization = "Bearer $($env:CANVAS_TOKEN)" }

# --- Step 1: who am I? -------------------------------------------------------
try {
    $me = Invoke-RestMethod -Uri "$base/api/v1/users/self" -Headers $headers -Method Get
    Write-Host "✔ Connected to Canvas as: $($me.name) (user id $($me.id))" -ForegroundColor Green
}
catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "✖ Request failed (HTTP $code)." -ForegroundColor Red
    switch ($code) {
        401 { Write-Host '  Token is missing, expired, or revoked.' }
        404 { Write-Host '  Check CANVAS_BASE_URL — it should be the Canvas address you use in the browser.' }
        default { Write-Host "  $($_.Exception.Message)" }
    }
    exit 1
}

# --- Step 2: list active courses, following pagination ------------------------
# -FollowRelLink makes PowerShell 7 follow Canvas's Link: rel="next" headers.
$pages = Invoke-RestMethod -Uri "$base/api/v1/courses?enrollment_state=active&per_page=100" `
    -Headers $headers -Method Get -FollowRelLink -MaximumFollowRelLink 20
$courses = $pages | ForEach-Object { $_ }   # flatten page arrays into one list

Write-Host "✔ Found $($courses.Count) active course(s):" -ForegroundColor Green
$courses | Where-Object { $_.name } |
    Select-Object id, course_code, name, workflow_state |
    Format-Table -AutoSize
