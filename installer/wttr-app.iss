#define MyAppName "War Thunder Türkiye"
#define MyAppVersion "1.1.3"
#ifndef SourceDir
  #define SourceDir "..\dist\win-unpacked"
#endif
#define MyAppPublisher "Cengiz Kemec"
#define MyAppURL "https://warthunder.tr/"
#define MyAppExeName "wttr-app.exe"

[Setup]
AppId={{A4B6E2C1-6D7F-4B3A-9C2E-8F1D5A7B6C90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\wttr
DefaultGroupName=WTTR
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist-installer
OutputBaseFilename=wttr-app-Setup-{#MyAppVersion}
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
VersionInfoVersion={#MyAppVersion}.0
VersionInfoDescription={#MyAppName} Setup
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: files; Name: "{autodesktop}\wttr.lnk"
Type: files; Name: "{autodesktop}\wttr-app.lnk"
Type: files; Name: "{autoprograms}\wttr-app.lnk"
Type: filesandordirs; Name: "{autoprograms}\wttr"

[Icons]
Name: "{autoprograms}\WTTR\WTTR"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; AppUserModelID: "tr.warthunder.desktop"
Name: "{autoprograms}\WTTR\Kaldır"; Filename: "{uninstallexe}"
Name: "{autodesktop}\WTTR"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; AppUserModelID: "tr.warthunder.desktop"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "wttr'u başlat"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
