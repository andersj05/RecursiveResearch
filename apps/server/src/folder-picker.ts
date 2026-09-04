import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from './errors.js';

const run = promisify(execFile);
let choosing = false;

/** The picker opens only after an explicit click. No user text becomes executable code. */
export async function pickFolder(): Promise<string | null> {
  if (process.platform !== 'win32')
    throw new AppError(
      501,
      'PICKER_UNAVAILABLE',
      'Paste the full path of an existing folder on this platform.',
    );
  if (choosing) throw new AppError(409, 'PICKER_OPEN', 'A folder chooser is already open.');
  choosing = true;
  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      Add-Type -AssemblyName System.Windows.Forms
      $picker = New-Object System.Windows.Forms.FolderBrowserDialog
      $picker.Description = 'Choose a folder for your RecursiveResearch project'
      try {
        if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          [Console]::Write($picker.SelectedPath)
        }
      } finally { $picker.Dispose() }
    `;
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 120000, encoding: 'utf8' },
    );
    return stdout.trim().replace(/^\uFEFF/, '') || null;
  } catch {
    throw new AppError(
      503,
      'PICKER_FAILED',
      'The folder chooser could not open or timed out. Paste the full folder path instead.',
    );
  } finally {
    choosing = false;
  }
}
