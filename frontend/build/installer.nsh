; HR Daddy — custom NSIS installer branding
; https://www.electron.build/nsis

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to HR Daddy"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will install HR Daddy on your computer.$\r$\n$\r$\n - Attendance and biometric integration$\r$\n - Payroll and payslips$\r$\n - Leave and holidays$\r$\n - Team chat and workflows$\r$\n$\r$\nPublisher: Raintech Software$\r$\nVersion: ${VERSION}$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "HR Daddy is ready"
  !define MUI_FINISHPAGE_TEXT "HR Daddy has been installed successfully.$\r$\n$\r$\nYou can launch the desktop client from your desktop or Start menu.$\r$\n$\r$\nClick Finish to close this wizard."
  !define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_FILENAME}"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch HR Daddy"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customInstall
  ; Create branded Start Menu folder
  CreateDirectory "$SMPROGRAMS\HR Daddy"
!macroend

!macro customUnInstall
  RMDir "$SMPROGRAMS\HR Daddy"
!macroend
