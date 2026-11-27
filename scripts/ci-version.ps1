param(
    [string] $Ref = $env:GITHUB_REF,
    [string] $RunNumber = $env:GITHUB_RUN_NUMBER,
    [string] $RunAttempt = $env:GITHUB_RUN_ATTEMPT
)

$ErrorActionPreference = 'Stop'
$tag = $Ref.StartsWith('refs/tags/')
$release = $Ref.StartsWith('refs/heads/release/')

if ($tag -or $release) {
    $name = $Ref -creplace '^refs/(tags/|heads/release/)', ''
    $identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
    $pattern = "^(?<year>[1-9][0-9]{3})\.(?<week>0?[1-9]|[1-4][0-9]|5[0-3])\.(?<sequence>0*[1-9][0-9]*)(?:-(?<label>$identifier(?:\.$identifier)*))?\z"
    if ($name -cnotmatch $pattern) {
        throw "Invalid release version in '$Ref'. Expected year.week.number with an optional prerelease suffix."
    }
    $base = '{0}.{1}.{2}' -f $Matches.year, ([int]$Matches.week), $Matches.sequence.TrimStart('0')
    $label = $Matches.label
    if ($tag) {
        if ($label) { return "$base-$label" }
        return $base
    }
    if (!$label) { $label = 'rc' }
    $prefix = "$base-$label"
} elseif ($Ref -cmatch '^refs/pull/([1-9][0-9]*)/(merge|head)$') {
    $prefix = "0.0.0-pr.$($Matches[1])"
} elseif ($Ref -clike 'refs/heads/*') {
    $prefix = '0.0.0-ci'
} else {
    throw "Unsupported Git ref '$Ref'."
}

if ($RunNumber -notmatch '^[1-9][0-9]*\z' -or $RunAttempt -notmatch '^[1-9][0-9]*\z') {
    throw 'A build requires a positive GitHub run number and attempt.'
}
"$prefix.$RunNumber.$RunAttempt"
