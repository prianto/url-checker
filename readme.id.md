# URL Checker

Script Node.js yang berjalan tiap jam untuk memeriksa apakah daftar URL menjawab **200 OK**.

- Memakai `HEAD` terlebih dahulu; jika server menolak `HEAD` (403/404/405/501), dicoba ulang satu kali dengan `GET`.
- Mengikuti redirect; hanya status akhir tepat `200` yang dianggap OK.
- Timeout 15 detik per URL; semua URL diperiksa secara paralel.
- Semua OK: berjalan senyap, hanya menambah baris ke `url-check.log`.
- Ada masalah: membuka jendela terminal berjudul "URL Check FAILED" berisi daftar yang gagal. Jendela tetap terbuka sampai Anda menutupnya.
- Exit code `0` jika semua URL OK, `1` jika ada yang gagal.

## Kebutuhan

- Windows
- Node.js 18+ (dikembangkan dengan Node 24). Tidak perlu paket npm.

## Berkas

| Berkas              | Fungsi                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- |
| `check-urls.mjs`    | Script pemeriksa                                                                       |
| `urls.txt.example`  | Template daftar URL                                                                    |
| `urls.txt`          | Daftar URL Anda (dibuat sendiri; diabaikan git)                                        |
| `url-check.log`     | Ditambah setiap kali dijalankan (dihasilkan otomatis, diabaikan git)                   |
| `last-failures.txt` | Ditampilkan di jendela kegagalan (dihasilkan otomatis, diabaikan git)                  |
| `run-hidden.vbs`    | Launcher opsional untuk menyembunyikan jendela konsol (dibuat sendiri, lihat di bawah) |

## Pemasangan

### 1. Buat daftar URL

`urls.txt` diabaikan git, jadi buat dari berkas contoh:

```powershell
Copy-Item urls.txt.example urls.txt
```

Edit `urls.txt`: satu URL per baris, `#` memulai komentar, baris kosong diabaikan.
Berkas ini boleh diubah kapan saja; proses berikutnya langsung memakai isi terbaru.
`urls.txt` yang hilang atau kosong dilaporkan sebagai kegagalan.

### 2. Uji secara manual

```powershell
node check-urls.mjs
```

Anda seharusnya melihat satu baris `OK` per URL. Cek exit code dengan `echo $LASTEXITCODE`.

### 3. Buat launcher tersembunyi

Tanpa ini, setiap jalannya tugas terjadwal akan memunculkan jendela konsol sekilas tiap jam.
Buat `run-hidden.vbs` (opsional: salin `run-hidden.vbs.example` menjadi `run-hidden.vbs`) di folder yang sama
(sesuaikan path ke lokasi proyek dan lokasi `node.exe`; cari dengan `where node`):

```vbs
CreateObject("WScript.Shell").Run """C:\Program Files\nodejs\node.exe"" ""C:\tools\url-check\check-urls.mjs""", 0, False
```

Coba: `wscript C:\tools\url-check\run-hidden.vbs`. Tidak boleh ada jendela yang muncul
(hasilnya ada di `url-check.log`).

### 4. Daftarkan tugas per jam

Jalankan di PowerShell (sesuaikan foldernya):

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

- `-AllowStartIfOnBatteries` / `-DontStopIfGoingOnBatteries`: tetap berjalan saat komputer memakai baterai.
- `-StartWhenAvailable`: jika komputer mati pada jadwalnya, tugas dijalankan begitu komputer menyala kembali.
- Jadwal per jam mengikuti waktu saat tugas didaftarkan (misalnya didaftarkan pukul 16:51, berarti berjalan pada menit ke-51 setiap jam).

## Perintah sehari-hari

```powershell
Start-ScheduledTask -TaskName UrlCheck       # jalankan sekarang
Get-ScheduledTaskInfo -TaskName UrlCheck     # waktu jalan terakhir/berikutnya
Unregister-ScheduledTask -TaskName UrlCheck -Confirm:$false   # hapus
Get-Content .\url-check.log -Tail 20         # hasil terbaru
```

Karena launcher tidak menunggu Node selesai, `LastTaskResult` selalu `0`.
Lihat `url-check.log` atau jendela kegagalan untuk hasil yang sebenarnya.

## Menguji jendela kegagalan

Tambahkan sementara URL yang mengembalikan 404 ke `urls.txt`, misalnya
`https://example.com/does-not-exist`, lalu jalankan `wscript run-hidden.vbs`. Sebuah
terminal berisi daftar kegagalan akan muncul. Hapus URL tersebut setelah selesai menguji.

Contoh isi jendela kegagalan (judul jendela: `URL Check FAILED`):

```
URL CHECK FAILED at 10/24/2026, 5:51:35 PM

2026-10-24T10:51:35.412Z FAIL https://example.com/does-not-exist -> 404 [GET]

Full history: C:\tools\url-check\url-check.log
Close this window when done.

C:\tools\url-check>
```

Setiap URL yang gagal mendapat satu baris `FAIL`, diakhiri status HTTP dan metode yang
dipakai (`[GET]` berarti `HEAD` ditolak dan percobaan ulang dengan `GET` juga bukan 200).
Penyebab kegagalan lain tampil seperti ini:

```
2026-10-24T10:51:35.412Z FAIL https://down.example.com -> ENOTFOUND
2026-10-24T10:51:35.412Z FAIL https://slow.example.com -> timeout
2026-10-24T10:51:35.412Z FAIL cannot read urls.txt -> ENOENT
```

Stempel waktu di log memakai UTC (huruf `Z` di belakang), sedangkan baris pertama
jendela memakai waktu lokal Anda. `ENOTFOUND` berarti domain tidak ditemukan,
`timeout` berarti server tidak menjawab dalam 15 detik, dan `ENOENT` berarti
`urls.txt` tidak ada.

## Catatan

- Jika sebuah situs terus mati, jendela kegagalan baru terbuka setiap jam. Tutup secara manual.
- Hanya berjalan saat komputer menyala (proses yang terlewat dikejar saat komputer bangun, berkat `-StartWhenAvailable`).
- Di Windows, script sengaja tidak memakai `process.exit()` (bisa crash dengan assertion libuv
  saat koneksi fetch sedang ditutup); script mengatur `process.exitCode` sebagai gantinya.
