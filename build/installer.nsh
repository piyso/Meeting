; Custom NSIS installer script for BlueArkive
; This script adds custom installation steps

!macro customInstall
  ; Create file association for .pnotes files
  WriteRegStr HKCR ".pnotes" "" "BlueArkive.Meeting"
  WriteRegStr HKCR "BlueArkive.Meeting" "" "BlueArkive Meeting"
  WriteRegStr HKCR "BlueArkive.Meeting\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "BlueArkive.Meeting\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; Register protocol handler
  WriteRegStr HKCR "bluearkive" "" "URL:BlueArkive Protocol"
  WriteRegStr HKCR "bluearkive" "URL Protocol" ""
  WriteRegStr HKCR "bluearkive\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCR "bluearkive\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; Refresh shell icons
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  ; Remove file associations
  DeleteRegKey HKCR ".pnotes"
  DeleteRegKey HKCR "BlueArkive.Meeting"
  DeleteRegKey HKCR "bluearkive"
  
  ; Refresh shell icons
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend
