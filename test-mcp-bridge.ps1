$pipeName = "claude-mcp-browser-bridge-Tony"
$pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut)

try {
    Write-Host "Connecting to pipe: $pipeName"
    $pipe.Connect(3000)
    Write-Host "Connected successfully!"

    # MCP protocol uses JSON-RPC 2.0 with 4-byte length prefix
    $msg = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}'
    $msgBytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
    $lenBytes = [BitConverter]::GetBytes([int32]$msgBytes.Length)

    Write-Host "Sending: $msg"
    $pipe.Write($lenBytes, 0, 4)
    $pipe.Write($msgBytes, 0, $msgBytes.Length)
    $pipe.Flush()

    # Read response
    Start-Sleep -Milliseconds 1000

    $lenBuffer = New-Object byte[] 4
    $bytesRead = $pipe.Read($lenBuffer, 0, 4)

    if ($bytesRead -eq 4) {
        $respLen = [BitConverter]::ToInt32($lenBuffer, 0)
        Write-Host "Response length: $respLen bytes"

        if ($respLen -gt 0 -and $respLen -lt 1000000) {
            $respBuffer = New-Object byte[] $respLen
            $totalRead = 0
            while ($totalRead -lt $respLen) {
                $read = $pipe.Read($respBuffer, $totalRead, $respLen - $totalRead)
                $totalRead += $read
            }
            $response = [System.Text.Encoding]::UTF8.GetString($respBuffer)
            Write-Host "Response: $response"
        }
    } else {
        Write-Host "No response received (read $bytesRead bytes)"
    }

} catch {
    Write-Host "Error: $($_.Exception.Message)"
} finally {
    if ($pipe) { $pipe.Close() }
}
