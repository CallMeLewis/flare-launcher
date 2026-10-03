; The launcher was first called DayZ Server Launcher. Windows keys an install on its name (the folder, the Add or
; Remove Programs entry, the shortcuts), so without this the first Flare Launcher update would install beside the old
; copy. The old copy is uninstalled first, and its shortcuts come back under the new name. Settings, favourites and the
; window position stay: they live under the app's identifier, which hasn't changed, and a silent uninstall keeps them.

!define OLD_PRODUCTNAME "DayZ Server Launcher"

; Whether the old copy had a desktop shortcut: "1" or "0" when it was found, empty on a fresh install.
Var OldDesktopShortcut

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R9 HKCU "Software\${MANUFACTURER}\${OLD_PRODUCTNAME}" ""
  ${If} $R9 != ""
  ${AndIf} ${FileExists} "$R9\uninstall.exe"
    StrCpy $OldDesktopShortcut "0"
    ${If} ${FileExists} "$DESKTOP\${OLD_PRODUCTNAME}.lnk"
      StrCpy $OldDesktopShortcut "1"
    ${EndIf}
    ; _?= makes the uninstaller run in place and wait. It then can't delete itself or its folder, so that's done here.
    ExecWait '"$R9\uninstall.exe" /S _?=$R9'
    Delete "$R9\uninstall.exe"
    RMDir "$R9"
    DeleteRegKey HKCU "Software\${MANUFACTURER}\${OLD_PRODUCTNAME}"
    ; An update normally leaves shortcuts alone, but the new name has none yet, so let this install create them.
    StrCpy $UpdateMode 0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; A silent install always adds a desktop shortcut. Keep it only if the old copy had one.
  ${If} $OldDesktopShortcut == "0"
    Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
!macroend
