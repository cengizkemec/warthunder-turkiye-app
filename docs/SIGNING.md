# Code signing — SignPath Foundation

`wttr-app` is applying to the **SignPath Foundation** program, which provides free
code signing for open source projects. The certificate is issued to SignPath
Foundation; SignPath verifies that every signed file was built by this
repository's GitHub Actions workflow and requires manual approval for each
release.

- Project: <https://github.com/cengizkemec/warthunder-turkiye-app>
- Homepage: <https://warthunder.tr>
- License: MIT
- Build system: GitHub Actions on GitHub-hosted Windows runners
- Signing targets: `wttr-app.exe`, `resources/ptt-helper.exe`,
  `wttr-app-Setup-<version>.exe`

> Status: application submitted on 16 November 2026; awaiting SignPath review.
> Until SignPath approves the project, release files remain unsigned. Do not
> claim that a release is signed before `Get-AuthenticodeSignature` reports
> `Valid`.

## 1. Eligibility checklist

SignPath Foundation requires:

- [x] Public source repository and OSI-approved license (MIT).
- [x] Released software in the form to be signed (v1.1.3 installer).
- [x] Documented functionality (README and <https://warthunder.tr>).
- [x] No malware, miners, obfuscation, or unwanted programs.
- [x] No proprietary components; Electron and Rust dependencies are open source.
- [x] Active maintenance.
- [x] GitHub Actions build on GitHub-hosted runners.
- [x] Code signing policy on the project homepage (README section).
- [x] Privacy policy ([PRIVACY.md](PRIVACY.md)).
- [x] Uninstaller (Inno Setup).
- [x] SignPath Foundation application submitted (16 November 2026).
- [ ] SignPath Foundation application approved.
- [ ] SignPath project, artifact configurations, and signing policy created.
- [ ] SignPath GitHub App installed and trusted build system linked.
- [ ] `SIGNPATH_API_TOKEN` and `SIGNPATH_ORGANIZATION_ID` repository secrets set.

The main risk is the **reputation** requirement: SignPath wants evidence that the
software is widely used or trusted. The repository is new, so the application
should include community evidence from warthunder.tr (member count, traffic,
downloads, announcements) in addition to GitHub release statistics.

## 2. Application answers

Use these values in <https://signpath.org/apply>. Replace the email placeholder
with the maintainer's address.

| Field | Value |
| --- | --- |
| Project Name | `wttr-app` |
| Repository URL | `https://github.com/cengizkemec/warthunder-turkiye-app` |
| Homepage URL | `https://warthunder.tr` |
| Download URL | `https://github.com/cengizkemec/warthunder-turkiye-app/releases/latest` |
| Privacy Policy URL | `https://github.com/cengizkemec/warthunder-turkiye-app/blob/main/docs/PRIVACY.md` |
| Wikipedia URL | empty |
| Tagline | `Windows desktop client for the War Thunder Türkiye community, with Flarum Social voice rooms and global push-to-talk.` |
| Category | `Gaming` |
| Maintainer Type | `Independent community project (no formal organization)` |
| Build System | `GitHub Actions` |
| First Name | `Cengiz` |
| Last Name | `Kemec` |
| Email | `<maintainer email>` |
| Company Name | empty |
| Primary Discovery Channel | `AI / LLM tools` (or the channel that actually applies) |
| Exact source | `OpenCode AI assistant recommendation` |

Description:

```text
wttr-app is the open source Windows desktop client for the War Thunder Türkiye
community at warthunder.tr. It wraps the community's Flarum forum and Flarum
Social voice rooms in an Electron shell, keeps the normal Flarum login, and adds
global push-to-talk, a voice-room overlay, Windows notifications, screen sharing,
and signed automatic updates. The client is distributed as an Inno Setup
installer and is built entirely by GitHub Actions from the public MIT-licensed
repository.
```

Reputation:

```text
The application is distributed to the War Thunder Türkiye community through
warthunder.tr and its GitHub releases. The community site provides the forum,
social feed, and voice rooms that the client connects to. Release history:
https://github.com/cengizkemec/warthunder-turkiye-app/releases
GitHub repository insights:
https://github.com/cengizkemec/warthunder-turkiye-app/graphs/traffic
Community: https://warthunder.tr/social
```

If available, add concrete numbers: registered forum members, monthly visits,
voice-room users, or download counts. SignPath reviews reputation manually.

Consent checkboxes:

- [x] I have read and agree to the SignPath Foundation Code of Conduct.
- [ ] I agree to receive other communications from SignPath (optional).
- [x] I agree to allow SignPath to store and process my personal data.

## 3. After approval: SignPath setup

1. Accept the invitation and sign in at <https://app.signpath.io>.
2. Create or select the organization. Copy the **organization ID**.
3. Install the [SignPath GitHub App](https://github.com/apps/signpath) and grant
   it access to `cengizkemec/warthunder-turkiye-app`.
4. In **Trusted Build Systems**, add **GitHub.com** to the organization and link
   it to the project. This lets SignPath verify the workflow run, commit, and
   artifact origin.
5. Create the project `wttr-app` with slug `wttr-app`.
6. Create a signing policy named `release-signing` (slug `release-signing`) that
   requires manual approval. Add `@cengizkemec` as approver.
7. Create the artifact configurations below. Slugs:
   - `wttr-app-app` for the unpacked application ZIP.
   - `wttr-app-installer` for the Inno Setup installer ZIP.
8. Add repository secrets:
   - `SIGNPATH_API_TOKEN`: API token for a user with submitter permission on the
     project/signing policy.
   - `SIGNPATH_ORGANIZATION_ID`: organization ID from step 2.
9. Copy the workflow in section 5, set the project/policy/artifact slugs, and run
   it with `workflow_dispatch`. Approve the signing request in SignPath when it
   appears.

## 4. Artifact configurations

The application is signed first. The signed `wttr-app.exe` and
`resources/ptt-helper.exe` are then placed back into `dist/win-unpacked`, and the
Inno Setup installer is compiled from those signed files. The installer is signed
in a second request. This avoids shipping an installer that contains unsigned
executables.

### 4.1 Application ZIP (`wttr-app-app`)

Input ZIP structure:

```text
wttr-app.exe
resources/ptt-helper.exe
```

Configuration:

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <parameters>
    <parameter name="version" required="true" />
  </parameters>
  <zip-file>
    <pe-file path="wttr-app.exe"
             product-name="wttr-app"
             product-version="${version}"
             company-name="Cengiz Kemec"
             copyright="Copyright (c) 2026 Cengiz Kemec"
             file-description="wttr-app">
      <authenticode-sign />
    </pe-file>
    <pe-file path="resources/ptt-helper.exe"
             product-name="wttr-app"
             product-version="${version}"
             company-name="Cengiz Kemec"
             copyright="Copyright (c) 2026 Cengiz Kemec"
             file-description="wttr-app push-to-talk helper"
             original-filename="ptt-helper.exe">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```

Pass `version: "1.1.3.0"` as the signing-request parameter. Both executables
carry matching product name, product version, company name, and copyright
metadata.

### 4.2 Installer ZIP (`wttr-app-installer`)

Input ZIP structure:

```text
wttr-app-Setup-1.1.3.exe
```

Configuration:

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <parameters>
    <parameter name="version" required="true" />
  </parameters>
  <zip-file>
    <pe-file path="wttr-app-Setup-*.exe"
             product-name="wttr-app"
             product-version="${version}"
             company-name="Cengiz Kemec"
             copyright="Copyright (c) 2026 Cengiz Kemec">
      <authenticode-sign />
    </pe-file>
  </zip-file>
</artifact-configuration>
```

## 5. GitHub Actions signing workflow

> The ready-to-run workflow is
> [`.github/workflows/signpath-release.yml`](../.github/workflows/signpath-release.yml).
> It performs the two-stage signing flow below, checks that the requested
> version matches `package.json` and the Inno Setup script, and uploads the
> signed installer. The snippet here documents the same flow for review.

The build must run on GitHub-hosted runners and the unsigned artifact must be
uploaded with `actions/upload-artifact` before the signing request. The SignPath
action waits for manual approval; set a generous timeout.

```yaml
name: release-signpath

on:
  workflow_dispatch:
    inputs:
      version:
        description: "Version without v prefix, e.g. 1.1.4"
        required: true

permissions:
  actions: read
  contents: write

jobs:
  sign:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        shell: pwsh
        run: |
          npm ci
          node node_modules/electron/install.js

      - name: Build push-to-talk helper
        run: cargo build --release --manifest-path ptt-helper/Cargo.toml

      - name: Package application
        run: npx electron-builder --win dir
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: "false"

      - name: Prepare application signing input
        shell: pwsh
        run: |
          New-Item -ItemType Directory -Force -Path sign-input-app\resources | Out-Null
          Copy-Item dist\win-unpacked\wttr-app.exe sign-input-app\wttr-app.exe
          Copy-Item dist\win-unpacked\resources\ptt-helper.exe sign-input-app\resources\ptt-helper.exe
          Compress-Archive -Path sign-input-app\* -DestinationPath unsigned-app.zip -Force

      - name: Upload unsigned application
        id: upload-app
        uses: actions/upload-artifact@v4
        with:
          name: unsigned-app
          path: unsigned-app.zip
          archive: false
          if-no-files-found: error

      - name: Sign application
        uses: signpath/github-action-submit-signing-request@v3
        with:
          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id: ${{ secrets.SIGNPATH_ORGANIZATION_ID }}
          project-slug: wttr-app
          signing-policy-slug: release-signing
          artifact-configuration-slug: wttr-app-app
          github-artifact-id: ${{ steps.upload-app.outputs.artifact-id }}
          wait-for-completion: true
          wait-for-completion-timeout-in-seconds: 3600
          output-artifact-directory: signed-app
          skip-decompress: true
          parameters: |
            version: "${{ inputs.version }}.0"

      - name: Restore signed application files
        shell: pwsh
        run: |
          Expand-Archive signed-app\unsigned-app.zip -DestinationPath signed-app-extracted -Force
          Copy-Item signed-app-extracted\wttr-app.exe dist\win-unpacked\wttr-app.exe -Force
          Copy-Item signed-app-extracted\resources\ptt-helper.exe dist\win-unpacked\resources\ptt-helper.exe -Force

      - name: Build Inno Setup installer
        shell: pwsh
        run: |
          $iscc = @(
            "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
            "C:\Program Files\Inno Setup 6\ISCC.exe",
            "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
            "C:\Program Files\Inno Setup 7\ISCC.exe"
          ) | Where-Object { Test-Path $_ } | Select-Object -First 1
          if (-not $iscc) { throw "ISCC.exe not found" }
          & $iscc "/DSourceDir=..\dist\win-unpacked" "installer\wttr-app.iss"
          if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }

      - name: Prepare installer signing input
        shell: pwsh
        run: |
          Compress-Archive -Path "dist-installer\wttr-app-Setup-${{ inputs.version }}.exe" `
            -DestinationPath unsigned-installer.zip -Force

      - name: Upload unsigned installer
        id: upload-installer
        uses: actions/upload-artifact@v4
        with:
          name: unsigned-installer
          path: unsigned-installer.zip
          archive: false
          if-no-files-found: error

      - name: Sign installer
        uses: signpath/github-action-submit-signing-request@v3
        with:
          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id: ${{ secrets.SIGNPATH_ORGANIZATION_ID }}
          project-slug: wttr-app
          signing-policy-slug: release-signing
          artifact-configuration-slug: wttr-app-installer
          github-artifact-id: ${{ steps.upload-installer.outputs.artifact-id }}
          wait-for-completion: true
          wait-for-completion-timeout-in-seconds: 3600
          output-artifact-directory: signed-installer
          skip-decompress: true
          parameters: |
            version: "${{ inputs.version }}.0"

      - name: Collect signed installer
        shell: pwsh
        run: |
          Expand-Archive signed-installer\unsigned-installer.zip -DestinationPath signed-installer-extracted -Force
          Copy-Item "signed-installer-extracted\wttr-app-Setup-${{ inputs.version }}.exe" `
            "dist-installer\wttr-app-Setup-${{ inputs.version }}.exe" -Force

      - name: Verify signatures
        shell: pwsh
        run: |
          $files = @(
            "dist\win-unpacked\wttr-app.exe",
            "dist\win-unpacked\resources\ptt-helper.exe",
            "dist-installer\wttr-app-Setup-${{ inputs.version }}.exe"
          )
          foreach ($file in $files) {
            $sig = Get-AuthenticodeSignature $file
            Write-Host "$file -> $($sig.Status) / $($sig.SignerCertificate.Subject)"
            if ($sig.Status -ne "Valid") { throw "Signature is not valid: $file" }
          }

      - name: Write SHA-256
        shell: pwsh
        run: |
          $file = "dist-installer\wttr-app-Setup-${{ inputs.version }}.exe"
          $hash = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
          "$hash  $(Split-Path $file -Leaf)" | Set-Content -Encoding ASCII "$file.sha256"

      - uses: actions/upload-artifact@v4
        with:
          name: wttr-app-signed
          path: |
            dist-installer/wttr-app-Setup-${{ inputs.version }}.exe
            dist-installer/wttr-app-Setup-${{ inputs.version }}.exe.sha256
```

Notes:

- `wait-for-completion-timeout-in-seconds: 3600` keeps the job alive while a
  maintainer approves the request in SignPath.
- The two signing requests are intentional. Signing the app first and then
  rebuilding the installer ensures the installer contains signed executables.
- If the action's output is not a ZIP for a given configuration, inspect
  `signed-app`/`signed-installer` and adjust the extraction step. The SignPath
  action and artifact configuration must agree on the artifact type.
- Do not put the API token in source. Use repository secrets.
- After the signed installer is published, update the GitHub release, the bridge
  `desktopApp` manifest (`latestVersion`, `installerUrl`, `sha256`), and the site.

## 6. Verification

On Windows:

```powershell
Get-AuthenticodeSignature .\wttr-app.exe | Format-List Status,StatusMessage,SignerCertificate
Get-AuthenticodeSignature .\ptt-helper.exe | Format-List Status,StatusMessage,SignerCertificate
Get-AuthenticodeSignature .\wttr-app-Setup-1.1.4.exe | Format-List Status,StatusMessage,SignerCertificate
```

Or with the Windows SDK:

```powershell
signtool verify /pa /v wttr-app.exe
signtool verify /pa /v ptt-helper.exe
signtool verify /pa /v wttr-app-Setup-1.1.4.exe
```

Expected signer subject:

```text
CN=SignPath Foundation, O=SignPath Foundation, ...
```

A valid signature removes the “Unknown publisher” label. SmartScreen reputation
is built over time and is not guaranteed by the first signed release.

## 7. Release checklist

1. Bump `package.json`, `installer/wttr-app.iss`, and `ptt-helper` metadata.
2. Run the signing workflow on a tag or `workflow_dispatch`.
3. Approve the app signing request, then the installer signing request.
4. Confirm all three signatures are `Valid`.
5. Publish the signed installer and `.sha256` on GitHub.
6. Update the bridge `desktopApp` manifest and deploy it.
7. Edit the release notes with the code signing policy and privacy policy links.
8. Verify the downloaded installer on a clean Windows VM.

## 8. Fallbacks

If SignPath rejects the project:

1. **Certum Open Source Code Signing** — discounted/free for some OSS projects;
   identity verification and possibly a cloud token fee.
2. **Microsoft Store / MSIX** — store-signed package, but requires a developer
   account and full-trust packaging for the PTT helper.
3. **Self-signed certificate** — free but only suitable for community/test use.
   Users must trust the `.cer` manually.

Self-signed helper scripts:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-selfsigned-cert.ps1
powershell -ExecutionPolicy Bypass -File scripts\sign-windows.ps1 `
  -PfxPath dist-signing\wttr-selfsigned.pfx `
  -PfxPassword "<sifre>" `
  -AppDir dist\win-unpacked `
  -InstallerDir dist-installer
```

`sign-windows.ps1` signs `wttr-app.exe`, `resources/ptt-helper.exe`, and the
newest `wttr-app-Setup-*.exe`. It never overwrites the released 1.1.3 installer
unless you point it at that directory and run it deliberately.

False-positive reports:

- Microsoft: <https://www.microsoft.com/en-us/wdsi/filesubmission>
- Norton: <https://submit.norton.com/>
- VirusTotal: <https://www.virustotal.com/>

Do not use leaked certificates, another project's certificate, or globally
disable antivirus software.
