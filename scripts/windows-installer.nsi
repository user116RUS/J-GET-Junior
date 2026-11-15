# -*- coding: utf-8 -*-
Unicode true
RequestExecutionLevel user
ManifestDPIAware true
ManifestSupportedOS all
SetCompressor /SOLID lzma
SetCompressorDictSize 32
AllowSkipFiles off
Name "ScratchJGET"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\ScratchJr-Classroom"
BrandingText "ScratchJGET"
VIProductVersion "${APP_FILE_VERSION}"
VIAddVersionKey "ProductName" "ScratchJGET"
VIAddVersionKey "FileDescription" "Установка ScratchJGET для Windows"
VIAddVersionKey "FileVersion" "${APP_FILE_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "ScratchJr contributors. Community bug-fix build."

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ScratchJr-Classroom"
!define MUI_ICON "${PAYLOAD_DIR}/resources/app/src/icons/win/icon.ico"
!define MUI_UNICON "${PAYLOAD_DIR}/resources/app/src/icons/win/icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Установка ScratchJGET"
!define MUI_WELCOMEPAGE_TEXT "ScratchJGET: программирование для детей, управление с клавиатуры, касание персонажа и библиотека звуков.$\r$\n$\r$\nПрограмма установится для текущего пользователя. На рабочем столе и в меню «Пуск» появится ярлык ScratchJGET.$\r$\n$\r$\nРанее сохранённые проекты останутся доступны.$\r$\n$\r$\nПеред продолжением закройте ScratchJGET, J-GET Junior и ScratchJr Classroom."
!define MUI_FINISHPAGE_RUN "$INSTDIR\app\ScratchJGET.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить ScratchJGET"
!define MUI_FINISHPAGE_TEXT "Исправленная версия установлена.$\r$\n$\r$\nДля занятий используйте ярлык ScratchJGET на рабочем столе."
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "Russian"

!macro LockInstaller
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\ScratchJrClassroomSetup") p .r0 ?e'
  Pop $1
  ${If} $1 = 183
    MessageBox MB_OK|MB_ICONINFORMATION "Установка или удаление ScratchJGET уже выполняется." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
!macroend

Function .onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Для этой версии требуется 64-разрядная Windows." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetRegView 64
  # Keep application files outside the project library, also for silent installs.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\ScratchJr-Classroom"
  !insertmacro LockInstaller
FunctionEnd

!macro CheckClosed PREFIX
Function ${PREFIX}CheckClosed
  retry:
  IfFileExists "$INSTDIR\app\ScratchJr.exe" 0 check_junior
  ClearErrors
  FileOpen $0 "$INSTDIR\app\ScratchJr.exe" a
  ${If} ${Errors}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Закройте ScratchJr Classroom и нажмите «Повторить»." /SD IDCANCEL IDRETRY retry
    SetErrorLevel 1
    Abort
  ${EndIf}
  FileClose $0
  check_junior:
  IfFileExists "$INSTDIR\app\J-GET-Junior.exe" 0 check_new
  ClearErrors
  FileOpen $0 "$INSTDIR\app\J-GET-Junior.exe" a
  ${If} ${Errors}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Закройте J-GET Junior и нажмите «Повторить»." /SD IDCANCEL IDRETRY retry
    SetErrorLevel 1
    Abort
  ${EndIf}
  FileClose $0
  check_new:
  IfFileExists "$INSTDIR\app\ScratchJGET.exe" 0 done
  ClearErrors
  FileOpen $0 "$INSTDIR\app\ScratchJGET.exe" a
  ${If} ${Errors}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Закройте ScratchJGET и нажмите «Повторить»." /SD IDCANCEL IDRETRY retry
    SetErrorLevel 1
    Abort
  ${EndIf}
  FileClose $0
  Goto done
  done:
FunctionEnd
!macroend
!insertmacro CheckClosed ""
!insertmacro CheckClosed "un."

Section "ScratchJGET"
  Call CheckClosed
  SetOutPath "$INSTDIR\app"
  File /r "${PAYLOAD_DIR}/*"
  !include "${REMOVE_OBSOLETE}"
  # Replace old launch targets and shortcuts, retaining the installation identity.
  Delete "$INSTDIR\app\J-GET-Junior.exe"
  Delete "$INSTDIR\app\ScratchJr.exe"
  Delete "$INSTDIR\app\ScratchJr_ExecutionStub.exe"
  Delete "$DESKTOP\J-GET Junior.lnk"
  Delete "$SMPROGRAMS\J-GET Junior.lnk"
  Delete "$DESKTOP\ScratchJr Classroom.lnk"
  Delete "$SMPROGRAMS\ScratchJr Classroom.lnk"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\ScratchJGET.lnk" "$INSTDIR\app\ScratchJGET.exe" "" "$INSTDIR\app\ScratchJGET.exe"
  CreateShortcut "$SMPROGRAMS\ScratchJGET.lnk" "$INSTDIR\app\ScratchJGET.exe" "" "$INSTDIR\app\ScratchJGET.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "ScratchJGET"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\app\ScratchJGET.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${INSTALLED_KIB}
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  !insertmacro LockInstaller
FunctionEnd

Section "Uninstall"
  Call un.CheckClosed
  SetOutPath "$TEMP"
  # Delete only the packaged files. Projects are in a separate directory.
  !include "${REMOVE_MANIFEST}"
  Delete "$DESKTOP\ScratchJGET.lnk"
  Delete "$SMPROGRAMS\ScratchJGET.lnk"
  Delete "$DESKTOP\J-GET Junior.lnk"
  Delete "$SMPROGRAMS\J-GET Junior.lnk"
  Delete "$DESKTOP\ScratchJr Classroom.lnk"
  Delete "$SMPROGRAMS\ScratchJr Classroom.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
