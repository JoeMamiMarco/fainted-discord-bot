$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repositoryPath = Split-Path -Parent $PSScriptRoot
$runtimeTarget = [IO.Path]::GetFullPath((Join-Path $repositoryPath 'runtime/ollama'))
[IO.Directory]::CreateDirectory($runtimeTarget) | Out-Null
$zipPath = Join-Path $repositoryPath 'runtime/ollama-download.zip'
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  foreach ($entry in $archive.Entries) {
    if ($entry.FullName -match '(?i)cuda|vulkan|mlx') { continue }
    $destination = [IO.Path]::GetFullPath((Join-Path $runtimeTarget $entry.FullName))
    if (-not $destination.StartsWith($runtimeTarget + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid archive path' }
    if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($destination) | Out-Null; continue }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
  }
} finally { $archive.Dispose() }
