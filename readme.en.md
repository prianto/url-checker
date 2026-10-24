# URL Checker

Hourly Node.js script that checks whether a list of URLs answers **200 OK**.

- Uses `HEAD` first; retries once with `GET` if the server rejects `HEAD` (403/404/405/501).
- Follows redirects; only a final status of exactly `200` counts as OK.
- 15 second timeout per URL; all URLs are checked in parallel.
- Everything OK: runs silently, only appends to `url-check.log`.
- Something wrong: opens a terminal window titled "URL Check FAILED" listing the failures. It stays open until you close it.
- Exit code is `0` when all URLs are OK, `1` otherwise.

## Requirements

- Windows
- Node.js 18+ (developed on Node 24). No npm packages needed.

## Files

| File                | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `check-urls.mjs`    | The checker script                                                         |
| `urls.txt.example`  | Template for the URL list                                                  |
| `urls.txt`          | Your URL list (create it yourself; git-ignored)                            |
| `url-check.log`     | Appended on every run (generated, git-ignored)                             |
| `last-failures.txt` | Shown in the failure window (generated, git-ignored)                       |
| `run-hidden.vbs`    | Optional launcher that hides the console window (you create it, see below) |

## Setup

### 1. Create your URL list

`urls.txt` is git-ignored, so create it from the example:

```powershell
Copy-Item urls.txt.example urls.txt
```

Edit `urls.txt`: one URL per line, `#` starts a comment, blank lines are ignored.
You can edit it at any time; the next run picks up the change. A missing or
empty `urls.txt` is reported as a failure.

### 2. Test it manually

```powershell
node check-urls.mjs
```

You should see one `OK` line per URL. Check the exit code with `echo $LASTEXITCODE`.

### 3. Create the hidden launcher

Without this, the scheduled run flashes a console window every hour. Create
`run-hidden.vbs` (optionally, copy `run-hidden.vbs.example` to `run-hidden.vbs`) in the same folder
(adjust the paths to where you put the project and where `node.exe` lives; find it with `where node`):

```vbs
CreateObject("WScript.Shell").Run """C:\Program Files\nodejs\node.exe"" ""C:\tools\url-check\check-urls.mjs""", 0, False
```

Test it: `wscript C:\tools\url-check\run-hidden.vbs`. No window should appear
(the result is in `url-check.log`).

### 4. Register the hourly task

Run in PowerShell (adjust the folder):

```powershell
$dir = "C:\tools\url-check"
$action   = New-ScheduledTaskAction -Execute "wscript.exe" `
            -Argument "`"$dir\run-hidden.vbs`"" -WorkingDirectory $dir
$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date) `
            -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "UrlCheck" -Action $action `
            -Trigger $trigger -Settings $settings
```

- `-AllowStartIfOnBatteries` / `-DontStopIfGoingOnBatteries`: run on battery too.
- `-StartWhenAvailable`: if the computer was off at the scheduled time, run as soon as it is back.
- The hourly schedule is anchored to the time you register the task (for example, registered at 16:51 means it runs at :51 every hour).

## Everyday commands

```powershell
Start-ScheduledTask -TaskName UrlCheck       # run now
Get-ScheduledTaskInfo -TaskName UrlCheck     # last/next run time
Unregister-ScheduledTask -TaskName UrlCheck -Confirm:$false   # remove
Get-Content .\url-check.log -Tail 20         # recent results
```

Because the launcher does not wait for Node, `LastTaskResult` is always `0`.
Use `url-check.log` or the failure window to see real results.

## Testing the failure window

Temporarily add a URL that returns 404 to `urls.txt`, for example
`https://example.com/does-not-exist`, then run `wscript run-hidden.vbs`. A
terminal listing the failure should appear. Remove the URL afterwards.

Example of what the failure window shows (window title: `URL Check FAILED`):

```
URL CHECK FAILED at 10/24/2026, 5:51:35 PM

2026-10-24T10:51:35.412Z FAIL https://example.com/does-not-exist -> 404 [GET]

Full history: C:\tools\url-check\url-check.log
Close this window when done.

C:\tools\url-check>
```

Each failing URL gets its own `FAIL` line, ending with the HTTP status and the
method used (`[GET]` means `HEAD` was rejected and the `GET` retry was also not 200).
Other failure reasons look like this:

```
2026-10-24T10:51:35.412Z FAIL https://down.example.com -> ENOTFOUND
2026-10-24T10:51:35.412Z FAIL https://slow.example.com -> timeout
2026-10-24T10:51:35.412Z FAIL cannot read urls.txt -> ENOENT
```

The timestamps in the log are UTC (the trailing `Z`), while the first line of the
window uses your local time.

## Notes

- If a site stays down, a new failure window opens every hour. Close them manually.
- Only runs while the computer is on (missed runs are caught up when it wakes, per `-StartWhenAvailable`).
- On Windows, the script deliberately avoids `process.exit()` (it can crash with a libuv
  assertion while fetch connections are closing); it sets `process.exitCode` instead.
