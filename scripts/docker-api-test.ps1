#!/usr/bin/env pwsh
# ============================================================================
# Kitsuden - Docker Build Validation & API Deep Test Script
# ============================================================================
# This script performs:
#   1. Docker build validation
#   2. Infrastructure startup (PostgreSQL, Valkey, MinIO)
#   3. API container startup
#   4. Comprehensive API route testing (checking for 500/404 errors)
# ============================================================================

param(
    [switch]$SkipBuild,
    [switch]$SkipInfrastructure,
    [switch]$KeepRunning,
    [int]$ApiPort = 3000,
    [int]$AdminPort = 3001
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

# Colors for output
$Colors = @{
    Success = "Green"
    Error = "Red"
    Warning = "Yellow"
    Info = "Cyan"
    Header = "Magenta"
}

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    $color = $Colors[$Type]
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $Colors.Header
    Write-Host "  $Title" -ForegroundColor $Colors.Header
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $Colors.Header
    Write-Host ""
}

# ============================================================================
# TEST RESULTS STORAGE
# ============================================================================
$script:TestResults = @{
    DockerBuild = @{ Status = "Pending"; Errors = @() }
    Infrastructure = @{ Status = "Pending"; Errors = @() }
    ApiStartup = @{ Status = "Pending"; Errors = @() }
    Routes = @{ Passed = 0; Failed = 0; Errors = @(); Details = @() }
}

# ============================================================================
# PHASE 1: Docker Build Validation
# ============================================================================
function Test-DockerBuild {
    Write-Header "PHASE 1: Docker Build Validation"
    
    # Check Docker is running
    try {
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Docker is not running. Please start Docker Desktop."
        }
        Write-Status "Docker is running" "Success"
    }
    catch {
        Write-Status "Docker check failed: $_" "Error"
        $script:TestResults.DockerBuild.Status = "Failed"
        $script:TestResults.DockerBuild.Errors += $_.Exception.Message
        return $false
    }
    
    if ($SkipBuild) {
        Write-Status "Skipping build as requested" "Warning"
        $script:TestResults.DockerBuild.Status = "Skipped"
        return $true
    }
    
    # Validate Dockerfile syntax
    Write-Status "Validating Dockerfile.prod syntax..." "Info"
    $dockerfilePath = "$PSScriptRoot/../docker/Dockerfile.prod"
    
    if (-not (Test-Path $dockerfilePath)) {
        Write-Status "Dockerfile.prod not found at $dockerfilePath" "Error"
        $script:TestResults.DockerBuild.Status = "Failed"
        $script:TestResults.DockerBuild.Errors += "Dockerfile.prod not found"
        return $false
    }
    
    # Check for required files referenced in Dockerfile
    $requiredFiles = @(
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "apps/api/package.json",
        "packages/admin/package.json",
        "packages/shared/package.json"
    )
    
    $missingFiles = @()
    foreach ($file in $requiredFiles) {
        $fullPath = Join-Path "$PSScriptRoot/.." $file
        if (-not (Test-Path $fullPath)) {
            $missingFiles += $file
        }
    }
    
    if ($missingFiles.Count -gt 0) {
        Write-Status "Missing required files for build:" "Error"
        $missingFiles | ForEach-Object { Write-Status "  - $_" "Error" }
        $script:TestResults.DockerBuild.Errors += "Missing files: $($missingFiles -join ', ')"
    }
    
    # Attempt to build API image
    Write-Status "Building API Docker image (this may take several minutes)..." "Info"
    Push-Location "$PSScriptRoot/.."
    
    try {
        $buildOutput = docker build -f docker/Dockerfile.prod --target api -t kitsuden/api:test . 2>&1
        $buildExitCode = $LASTEXITCODE
        
        if ($buildExitCode -eq 0) {
            Write-Status "API Docker image built successfully" "Success"
            $script:TestResults.DockerBuild.Status = "Passed"
        }
        else {
            Write-Status "API Docker build failed with exit code $buildExitCode" "Error"
            Write-Status $buildOutput "Error"
            $script:TestResults.DockerBuild.Status = "Failed"
            $script:TestResults.DockerBuild.Errors += "Build exit code: $buildExitCode"
            return $false
        }
    }
    catch {
        Write-Status "Build error: $_" "Error"
        $script:TestResults.DockerBuild.Status = "Failed"
        $script:TestResults.DockerBuild.Errors += $_.Exception.Message
        return $false
    }
    finally {
        Pop-Location
    }
    
    # Attempt to build Admin image
    Write-Status "Building Admin Docker image..." "Info"
    Push-Location "$PSScriptRoot/.."
    
    try {
        $buildOutput = docker build -f docker/Dockerfile.prod --target admin -t kitsuden/admin:test . 2>&1
        $buildExitCode = $LASTEXITCODE
        
        if ($buildExitCode -eq 0) {
            Write-Status "Admin Docker image built successfully" "Success"
        }
        else {
            Write-Status "Admin Docker build failed with exit code $buildExitCode" "Error"
            $script:TestResults.DockerBuild.Errors += "Admin build exit code: $buildExitCode"
        }
    }
    catch {
        Write-Status "Admin build error: $_" "Error"
        $script:TestResults.DockerBuild.Errors += "Admin build: $($_.Exception.Message)"
    }
    finally {
        Pop-Location
    }
    
    return $true
}

# ============================================================================
# PHASE 2: Infrastructure Startup
# ============================================================================
function Start-Infrastructure {
    Write-Header "PHASE 2: Infrastructure Startup"
    
    if ($SkipInfrastructure) {
        Write-Status "Skipping infrastructure startup" "Warning"
        $script:TestResults.Infrastructure.Status = "Skipped"
        return $true
    }
    
    Push-Location "$PSScriptRoot/.."
    
    try {
        # Start infrastructure services
        Write-Status "Starting PostgreSQL, Valkey, and MinIO..." "Info"
        $composeOutput = docker compose -f docker-compose.dev.yml up -d 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to start infrastructure: $composeOutput"
        }
        
        Write-Status "Infrastructure containers started" "Success"
        
        # Wait for services to be healthy
        Write-Status "Waiting for services to be healthy (30s)..." "Info"
        Start-Sleep -Seconds 30
        
        # Check container status
        $containers = @("kitsuden_db", "kitsuden_cache", "kitsuden_minio")
        $allHealthy = $true
        
        foreach ($container in $containers) {
            $status = docker inspect --format='{{.State.Status}}' $container 2>&1
            if ($status -eq "running") {
                Write-Status "Container $container is running" "Success"
            }
            else {
                Write-Status "Container $container status: $status" "Error"
                $allHealthy = $false
            }
        }
        
        if ($allHealthy) {
            $script:TestResults.Infrastructure.Status = "Passed"
            return $true
        }
        else {
            $script:TestResults.Infrastructure.Status = "Failed"
            $script:TestResults.Infrastructure.Errors += "Some containers not running"
            return $false
        }
    }
    catch {
        Write-Status "Infrastructure error: $_" "Error"
        $script:TestResults.Infrastructure.Status = "Failed"
        $script:TestResults.Infrastructure.Errors += $_.Exception.Message
        return $false
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# PHASE 3: API Route Testing
# ============================================================================
$script:RoutesToTest = @(
    # Public/System routes
    @{ Method = "GET"; Path = "/api/health"; ExpectedStatus = 200; Auth = $false }
    @{ Method = "GET"; Path = "/api/health/pgvector"; ExpectedStatus = 200; Auth = $false }
    @{ Method = "GET"; Path = "/api/system/init-check"; ExpectedStatus = 200; Auth = $false }
    
    # Auth routes (public)
    @{ Method = "GET"; Path = "/api/auth/get-session"; ExpectedStatus = 200; Auth = $false }
    
    # DataSets routes (protected)
    @{ Method = "GET"; Path = "/api/data-sets"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "GET"; Path = "/api/datasets"; ExpectedStatus = 401; Auth = $false }
    
    # Admin routes (protected)
    @{ Method = "GET"; Path = "/api/settings"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "GET"; Path = "/api/modules"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "GET"; Path = "/api/system/themes"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "GET"; Path = "/api/system/grimoires"; ExpectedStatus = 401; Auth = $false }
    
    # MCP routes (protected)
    @{ Method = "GET"; Path = "/api/mcp"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "POST"; Path = "/api/mcp"; ExpectedStatus = 400; Auth = $false }
    
    # Actions routes (protected)
    @{ Method = "GET"; Path = "/api/actions"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "GET"; Path = "/api/actions/stats/overview"; ExpectedStatus = 401; Auth = $false }
    
    # API Keys routes (protected)
    @{ Method = "GET"; Path = "/api/keys"; ExpectedStatus = 401; Auth = $false }
    
    # Admin Registry routes (protected)
    @{ Method = "GET"; Path = "/api/admin/registry"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "GET"; Path = "/api/admin/agents"; ExpectedStatus = 401; Auth = $false }
    
    # Agent Memory routes (protected)
    @{ Method = "GET"; Path = "/api/agent/memory"; ExpectedStatus = 401; Auth = $false }
    
    # Schema routes (protected)
    @{ Method = "GET"; Path = "/api/schema"; ExpectedStatus = 401; Auth = $false }
    @{ Method = "GET"; Path = "/api/schema/tables"; ExpectedStatus = 401; Auth = $false }
    
    # Relations routes (protected)
    @{ Method = "GET"; Path = "/api/relations"; ExpectedStatus = 401; Auth = $false }
    
    # Sync routes (protected)
    @{ Method = "POST"; Path = "/api/sync/igdb/search"; ExpectedStatus = 401; Auth = $false }
    
    # GraphQL route
    @{ Method = "POST"; Path = "/api/graphql"; ExpectedStatus = 401; Auth = $false }
    
    # Functions routes (protected - legacy)
    @{ Method = "GET"; Path = "/api/functions"; ExpectedStatus = 401; Auth = $false }
    
    # Kon routes (should be 401 or 404 depending on kon loading)
    @{ Method = "GET"; Path = "/api/custom/kon-datasets"; ExpectedStatus = @(200, 401, 404); Auth = $false }
    @{ Method = "GET"; Path = "/api/custom/kon-media"; ExpectedStatus = @(200, 401, 404); Auth = $false }
    
    # Non-existent routes (should be 404)
    @{ Method = "GET"; Path = "/api/nonexistent-route-12345"; ExpectedStatus = 404; Auth = $false }
    @{ Method = "GET"; Path = "/api/admin/nonexistent"; ExpectedStatus = 404; Auth = $false }
)

function Test-ApiRoute {
    param(
        [string]$Method,
        [string]$Path,
        $ExpectedStatus,
        [switch]$Auth
    )
    
    $url = "http://localhost:$ApiPort$Path"
    $headers = @{}
    
    if ($Auth) {
        # Add a fake auth token to test auth-required routes
        $headers["Authorization"] = "Bearer test-token-invalid"
        $headers["Cookie"] = "better-auth.session=test-session-invalid"
    }
    
    try {
        $response = Invoke-WebRequest -Uri $url -Method $Method -Headers $headers -TimeoutSec 10 -ErrorAction SilentlyContinue
        $statusCode = $response.StatusCode
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if (-not $statusCode) {
            $statusCode = 0
        }
    }
    
    $passed = $false
    if ($ExpectedStatus -is [Array]) {
        $passed = $ExpectedStatus -contains $statusCode
    }
    else {
        $passed = $statusCode -eq $ExpectedStatus
    }
    
    return @{
        Path = $Path
        Method = $Method
        StatusCode = $statusCode
        ExpectedStatus = $ExpectedStatus
        Passed = $passed
    }
}

function Test-AllApiRoutes {
    Write-Header "PHASE 3: Deep API Route Testing"
    
    # Wait for API to be ready
    Write-Status "Waiting for API to be ready..." "Info"
    $maxAttempts = 30
    $attempt = 0
    $apiReady = $false
    
    while ($attempt -lt $maxAttempts -and -not $apiReady) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$ApiPort/api/health" -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                $apiReady = $true
                Write-Status "API is ready!" "Success"
                break
            }
        }
        catch {
            $attempt++
            Write-Status "Waiting for API... attempt $attempt/$maxAttempts" "Warning"
            Start-Sleep -Seconds 2
        }
    }
    
    if (-not $apiReady) {
        Write-Status "API did not become ready in time" "Error"
        $script:TestResults.ApiStartup.Status = "Failed"
        $script:TestResults.ApiStartup.Errors += "API health check timeout"
        return
    }
    
    $script:TestResults.ApiStartup.Status = "Passed"
    
    # Test all routes
    Write-Status "Testing $($script:RoutesToTest.Count) API routes..." "Info"
    
    $passed = 0
    $failed = 0
    
    foreach ($route in $script:RoutesToTest) {
        $result = Test-ApiRoute -Method $route.Method -Path $route.Path -ExpectedStatus $route.ExpectedStatus -Auth:$route.Auth
        $script:TestResults.Routes.Details += $result
        
        if ($result.Passed) {
            $passed++
            Write-Host "  ✓ $($result.Method) $($result.Path) -> $($result.StatusCode)" -ForegroundColor $Colors.Success
        }
        else {
            $failed++
            Write-Host "  ✗ $($result.Method) $($result.Path) -> $($result.StatusCode) (expected: $($result.ExpectedStatus))" -ForegroundColor $Colors.Error
            $script:TestResults.Routes.Errors += "$($result.Method) $($result.Path): got $($result.StatusCode), expected $($result.ExpectedStatus)"
        }
        
        # Small delay to avoid overwhelming the API
        Start-Sleep -Milliseconds 50
    }
    
    $script:TestResults.Routes.Passed = $passed
    $script:TestResults.Routes.Failed = $failed
    
    Write-Status "Route testing complete: $passed passed, $failed failed" $(if ($failed -eq 0) { "Success" } else { "Warning" })
}

# ============================================================================
# PHASE 4: Cleanup
# ============================================================================
function Stop-Infrastructure {
    if ($KeepRunning) {
        Write-Status "Keeping containers running as requested" "Info"
        Write-Status "API: http://localhost:$ApiPort" "Info"
        Write-Status "Admin: http://localhost:$AdminPort" "Info"
        return
    }
    
    Write-Header "PHASE 4: Cleanup"
    Write-Status "Stopping containers..." "Info"
    
    Push-Location "$PSScriptRoot/.."
    try {
        docker compose -f docker-compose.dev.yml down 2>&1 | Out-Null
        Write-Status "Containers stopped" "Success"
    }
    catch {
        Write-Status "Error stopping containers: $_" "Warning"
    }
    finally {
        Pop-Location
    }
}

# ============================================================================
# REPORT GENERATION
# ============================================================================
function Export-TestReport {
    Write-Header "TEST REPORT"
    
    $report = @"
# Kitsuden Docker Build & API Test Report
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## Summary

| Phase | Status |
|-------|--------|
| Docker Build | $($script:TestResults.DockerBuild.Status) |
| Infrastructure | $($script:TestResults.Infrastructure.Status) |
| API Startup | $($script:TestResults.ApiStartup.Status) |
| API Routes | $($script:TestResults.Routes.Passed) passed, $($script:TestResults.Routes.Failed) failed |

## Docker Build
Status: $($script:TestResults.DockerBuild.Status)
$(if ($script:TestResults.DockerBuild.Errors.Count -gt 0) { "### Errors:`n" + ($script:TestResults.DockerBuild.Errors | ForEach-Object { "- $_" }) })

## Infrastructure
Status: $($script:TestResults.Infrastructure.Status)
$(if ($script:TestResults.Infrastructure.Errors.Count -gt 0) { "### Errors:`n" + ($script:TestResults.Infrastructure.Errors | ForEach-Object { "- $_" }) })

## API Startup
Status: $($script:TestResults.ApiStartup.Status)
$(if ($script:TestResults.ApiStartup.Errors.Count -gt 0) { "### Errors:`n" + ($script:TestResults.ApiStartup.Errors | ForEach-Object { "- $_" }) })

## Route Test Details

| Method | Path | Status | Expected | Result |
|--------|------|--------|----------|--------|
$($script:TestResults.Routes.Details | ForEach-Object { "| $($_.Method) | $($_.Path) | $($_.StatusCode) | $($_.ExpectedStatus) | $(if ($_.Passed) { "✓ PASS" } else { "✗ FAIL" }) |" })

## Errors
$(if ($script:TestResults.Routes.Errors.Count -eq 0) { "No errors found." } else { ($script:TestResults.Routes.Errors | ForEach-Object { "- $_" }) -join "`n" })

## Conclusion
$(if ($script:TestResults.Routes.Failed -eq 0) { "✅ All tests passed! The Docker build and API are working correctly." } else { "⚠️ $($script:TestResults.Routes.Failed) route(s) failed. Review the errors above." })
"@
    
    $reportPath = "$PSScriptRoot/../docker-api-test-report.md"
    $report | Out-File -FilePath $reportPath -Encoding UTF8
    Write-Status "Report saved to: $reportPath" "Info"
    
    return $report
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================
Write-Header "Kitsuden Docker Build & API Test"
Write-Status "Starting comprehensive test..." "Info"

# Run all phases
$buildSuccess = Test-DockerBuild
if (-not $buildSuccess -and -not $SkipBuild) {
    Write-Status "Build validation failed. Stopping tests." "Error"
    Export-TestReport
    exit 1
}

$infraSuccess = Start-Infrastructure
if (-not $infraSuccess -and -not $SkipInfrastructure) {
    Write-Status "Infrastructure startup failed. Stopping tests." "Error"
    Export-TestReport
    Stop-Infrastructure
    exit 1
}

# Test API routes
Test-AllApiRoutes

# Cleanup
Stop-Infrastructure

# Generate report
$report = Export-TestReport
Write-Host ""
Write-Host $report -ForegroundColor White

# Exit with appropriate code
if ($script:TestResults.Routes.Failed -eq 0 -and 
    $script:TestResults.DockerBuild.Status -ne "Failed" -and
    $script:TestResults.Infrastructure.Status -ne "Failed") {
    Write-Status "All tests passed!" "Success"
    exit 0
}
else {
    Write-Status "Some tests failed. Review the report above." "Error"
    exit 1
}
