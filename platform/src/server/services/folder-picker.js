import { execFile } from "node:child_process";

/**
 * Open a native Windows folder-picker dialog (the platform runs locally, so the
 * dialog appears on the user's desktop) and return the chosen absolute path.
 * Returns { ok, path } — path is null if cancelled or unsupported.
 */
const PS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Choisir un dossier'
if ($env:PICK_INIT -and (Test-Path $env:PICK_INIT)) { $dlg.SelectedPath = $env:PICK_INIT }
$r = $dlg.ShowDialog($owner)
if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dlg.SelectedPath) }
$owner.Dispose()
`;

export function pickFolder(initial) {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "Sélecteur natif disponible uniquement sous Windows." });
  }
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-STA", "-Command", PS_SCRIPT],
      { env: { ...process.env, PICK_INIT: initial || "" }, timeout: 300000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: "Sélecteur indisponible." });
          return;
        }
        const path = (stdout || "").toString().trim();
        resolve({ ok: true, path: path || null });
      }
    );
  });
}
