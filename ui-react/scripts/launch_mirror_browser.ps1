param(
    [string]$Url = "http://192.168.1.102:5173/"
)

$chromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$browserPath = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browserPath) {
    throw "No supported Chrome/Edge browser was found."
}

$origin = ([Uri]$Url).GetLeftPart([System.UriPartial]::Authority)
$profileDir = Join-Path $PSScriptRoot "..\.mirror-browser-profile"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$arguments = @(
    "--new-window",
    "--user-data-dir=$profileDir",
    "--autoplay-policy=no-user-gesture-required",
    "--unsafely-treat-insecure-origin-as-secure=$origin",
    "--use-fake-ui-for-media-stream",
    $Url
)

Start-Process -FilePath $browserPath -ArgumentList $arguments
