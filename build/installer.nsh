; Custom NSIS installer script for PiyAPI Notes
; This script adds custom installation steps

!macro customInstall
  ; Create file association for .pnotes files
  WriteRegStr HKCR ".pnotes" "" "PiyAPINotes.Meeting"
  WriteRegStr HKCR "PiyAPINotes.Meeting" "" "PiyAPI Notes Meeting"
  WriteRegStr HKCR "PiyAPINotes.Meeting\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "PiyAPINotes.Meeting\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; Register protocol handler
  WriteRegStr HKCR "piyapi-notes" "" "URL:PiyAPI Notes Protocol"
  WriteRegStr HKCR "piyapi-notes" "URL Protocol" ""
  WriteRegStr HKCR "piyapi-notes\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "piyapi-notes\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; Refresh shell icons
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  ; Remove file associations
  DeleteRegKey HKCR ".pnotes"
  DeleteRegKey HKCR "PiyAPINotes.Meeting"
  DeleteRegKey HKCR "piyapi-notes"
  
  ; Refresh shell icons
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend
