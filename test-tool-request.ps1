$pipeName = "claude-mcp-browser-bridge-Tony"

function Send-Message($pipe, $msg) {
    $msgBytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
    $lenBytes = [BitConverter]::GetBytes([int32]$msgBytes.Length)
    $pipe.Write($lenBytes, 0, 4)
    $pipe.Write($msgBytes, 0, $msgBytes.Length)
    $pipe.Flush()
    Write-Host "Sent: $msg"
}

function Read-Response($pipe, $timeout = 5000) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $timeout) {
        if ($pipe.Length -gt 0 -or $pipe.IsConnected) {
            try {
                $lenBuffer = New-Object byte[] 4
                $pipe.ReadTimeout = 1000
                $bytesRead = $pipe.Read($lenBuffer, 0, 4)
                if ($bytesRead -eq 4) {
                    $respLen = [BitConverter]::ToInt32($lenBuffer, 0)
                    Write-Host "Response length: $respLen"
                    if ($respLen -gt 0 -and $respLen -lt 1000000) {
                        $respBuffer = New-Object byte[] $respLen
                        $totalRead = 0
                        while ($totalRead -lt $respLen) {
                            $read = $pipe.Read($respBuffer, $totalRead, $respLen - $totalRead)
                            $totalRead += $read
                        }
                        return [System.Text.Encoding]::UTF8.GetString($respBuffer)
                    }
                }
            } catch {
                Start-Sleep -Milliseconds 100
            }
        }
    }
    return "Timeout waiting for response"
}

# Test with tool_request format
$testMessages = @(
    # Based on the service worker analysis
    '{"type":"tool_request","method":"execute_tool","params":{"tool":"get_status","client_id":"test-1"}}',
    '{"type":"tool_request","method":"execute_tool","params":{"tool":"screenshot","client_id":"test-1"}}',
    '{"type":"get_status"}',
    '{"type":"ping"}'
)

foreach ($msg in $testMessages) {
    try {
        $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
        $pipe.Connect(3000)
        Write-Host "`n--- Testing ---"

        Send-Message $pipe $msg
        $response = Read-Response $pipe
        Write-Host "Response: $response"

        $pipe.Close()
    } catch {
        Write-Host "Error: $($_.Exception.Message)"
    }
}
