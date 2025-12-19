# run_dev.ps1
# تشغيل الباك اند على ويندوز

Set-Location (Join-Path $PSScriptRoot "..")

python -m venv .venv
.\.venv\Scripts\activate

pip install -r requirements.txt

$env:API_HOST="0.0.0.0"
$env:API_PORT="5000"

uvicorn app.main:app --host $env:API_HOST --port $env:API_PORT --reload
