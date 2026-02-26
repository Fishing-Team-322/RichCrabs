param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$OwnerUserId = "00000000-0000-0000-0000-000000000001"
)

$createBody = @{
  ownerUserId = $OwnerUserId
  quizId = "demo-quiz"
  title = "Smoke game"
} | ConvertTo-Json

$create = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/games" -ContentType "application/json" -Body $createBody
$create | ConvertTo-Json -Depth 6

$joinBody = @{ name = "Smoke Player" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/games/$($create.pin)/join" -ContentType "application/json" -Body $joinBody | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/invites/$($create.inviteToken)/join" -ContentType "application/json" -Body $joinBody | ConvertTo-Json -Depth 6

$botBody = @{
  name = "Smoke Bot"
  version = "1.0.0"
  endpoint = "https://example.org/hook"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/bots" -ContentType "application/json" -Body $botBody | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Get -Uri "$BaseUrl/health?grpc=true" | ConvertTo-Json -Depth 6
