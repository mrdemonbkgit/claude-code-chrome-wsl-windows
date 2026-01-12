$pipeName = "claude-mcp-browser-bridge-Tony"

function Send-Message($pipe, $msg) {
    $msgBytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
    $lenBytes = [BitConverter]::GetBytes([int32]$msgBytes.Length)
    $pipe.Write($lenBytes, 0, 4)
    $pipe.Write($msgBytes, 0, $msgBytes.Length)
    $pipe.Flush()
}

function Read-Response($pipe) {
    Start-Sleep -Milliseconds 500
    $lenBuffer = New-Object byte[] 4
    $bytesRead = $pipe.Read($lenBuffer, 0, 4)
    if ($bytesRead -eq 4) {
        $respLen = [BitConverter]::ToInt32($lenBuffer, 0)
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
    return "No response"
}

# Test different message formats
$testMessages = @(
    '{"type":"tool_req","method":"list_tools","params":{}}',
    '{"type":"tool_request","method":"list_tools","params":{}}',
    '{"method":"list_tools","params":{}}',
    '{"type":"list_tools"}',
    '{"type":"ping"}',
    '{"type":"get_tools"}',
    '{"type":"help"}',
    '{"jsonrpc":"2.0","method":"tools/list","id":1}',
    '{"jsonrpc":"2.0","method":"list","id":1}'
)

foreach ($msg in $testMessages) {
    try {
        $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
        $pipe.Connect(2000)

        Write-Host "`nSending: $msg"
        Send-Message $pipe $msg
        $response = Read-Response $pipe
        Write-Host "Response: $response"

        $pipe.Close()
    } catch {
        Write-Host "Error: $($_.Exception.Message)"
    }
}
