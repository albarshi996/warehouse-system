# ═══════════════════════════════════════════════════════════════════════════
#  Firebase Export  —  READ ONLY
# ═══════════════════════════════════════════════════════════════════════════
#  انقر نقرتين على «تصدير-البيانات.bat» — لا تشغّل هذا الملفّ مباشرةً.
#
#  ★ العربيّة في نوافذ الحوار (ويندوز يعرضها صحيحةً)، والإنجليزيّة في
#    الطرفيّة — لأنّ طرفيّة ويندوز تقلب الحروف العربيّة ولا تعالجها.
# ═══════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ── نافذةُ الحوار: بريدٌ وكلمةُ مرور ───────────────────────────────────────
function Show-LoginDialog {
    $f = New-Object System.Windows.Forms.Form
    $f.Text = 'تصدير بيانات Firebase'
    $f.Size = New-Object System.Drawing.Size(470, 290)
    $f.StartPosition = 'CenterScreen'
    $f.FormBorderStyle = 'FixedDialog'
    $f.MaximizeBox = $false
    $f.RightToLeft = 'Yes'
    $f.RightToLeftLayout = $true
    $f.Font = New-Object System.Drawing.Font('Segoe UI', 10)

    $note = New-Object System.Windows.Forms.Label
    $note.Text = "يقرأ بياناتك من Firebase وينسخها.`nلا يحذف ولا يعدّل شيئًا — قراءةٌ فقط."
    $note.SetBounds(20, 15, 415, 45)
    $note.ForeColor = [System.Drawing.Color]::FromArgb(0, 120, 60)
    $f.Controls.Add($note)

    $lblE = New-Object System.Windows.Forms.Label
    $lblE.Text = 'البريد الإلكتروني'
    $lblE.SetBounds(20, 72, 415, 22)
    $f.Controls.Add($lblE)

    $txtE = New-Object System.Windows.Forms.TextBox
    $txtE.SetBounds(20, 95, 415, 26)
    $txtE.Text = 'albarshi.96@gmail.com'
    $txtE.RightToLeft = 'No'
    $f.Controls.Add($txtE)

    $lblP = New-Object System.Windows.Forms.Label
    $lblP.Text = 'كلمة المرور'
    $lblP.SetBounds(20, 130, 415, 22)
    $f.Controls.Add($lblP)

    $txtP = New-Object System.Windows.Forms.TextBox
    $txtP.SetBounds(20, 153, 415, 26)
    $txtP.UseSystemPasswordChar = $true
    $txtP.RightToLeft = 'No'
    $f.Controls.Add($txtP)

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = 'ابدأ'
    $ok.SetBounds(20, 200, 130, 34)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $f.Controls.Add($ok)
    $f.AcceptButton = $ok

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'إلغاء'
    $cancel.SetBounds(165, 200, 110, 34)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $f.Controls.Add($cancel)
    $f.CancelButton = $cancel

    $f.Add_Shown({ $txtP.Focus() })
    $res = $f.ShowDialog()

    if ($res -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return @{ Email = $txtE.Text.Trim(); Password = $txtP.Text }
}

$creds = Show-LoginDialog
if ($null -eq $creds -or [string]::IsNullOrWhiteSpace($creds.Password)) {
    Write-Host 'Cancelled. Nothing was read or written.' -ForegroundColor Gray
    Start-Sleep -Seconds 2
    exit 0
}

$env:FIREBASE_EMAIL = $creds.Email
$env:FIREBASE_PASSWORD = $creds.Password

# ── الجولة الأولى: عدٌّ بلا كتابة ─────────────────────────────────────────
Write-Host ''
Write-Host '=== PASS 1 : COUNT ONLY (no files written) ===' -ForegroundColor Yellow
Write-Host ''

node scripts/firestore-export.mjs --dry

if ($LASTEXITCODE -ne 0) {
    $env:FIREBASE_PASSWORD = $null
    [System.Windows.Forms.MessageBox]::Show(
        "تعذّر الاتّصال.`n`nراجع البريد وكلمة المرور والإنترنت،`nثمّ انسخ الرسالة الحمراء من النافذة وأرسلها.",
        'فشل الاتّصال', 'OK', 'Error') | Out-Null
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 1
}

# ── الجولة الثانية: بإذنٍ صريح ────────────────────────────────────────────
$ask = [System.Windows.Forms.MessageBox]::Show(
    "تمّ العدّ بنجاح — ولم يُكتب أيُّ ملفّ.`n`nهل نكتب النسخة الآن على جهازك؟`n(لا شيءَ في Firebase يتغيّر بحال)",
    'كتابة النسخة؟', 'YesNo', 'Question')

if ($ask -eq [System.Windows.Forms.DialogResult]::Yes) {
    Write-Host ''
    Write-Host '=== PASS 2 : WRITING to db/dump/ ===' -ForegroundColor Yellow
    Write-Host ''
    node scripts/firestore-export.mjs
    Write-Host ''
    Write-Host 'Done. Files are in: db\dump\' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host 'Nothing written. Count only.' -ForegroundColor Gray
}

$env:FIREBASE_PASSWORD = $null
$creds = $null

Write-Host ''
Read-Host 'Press Enter to close'
