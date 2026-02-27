#!/bin/bash
# Post-installation script for Linux

# Update desktop database for file associations
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database /usr/share/applications
fi

# Update MIME database
if command -v update-mime-database &> /dev/null; then
    update-mime-database /usr/share/mime
fi

# Register MIME type for .pnotes files
MIME_FILE="/usr/share/mime/packages/bluearkive.xml"
cat > "$MIME_FILE" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-bluearkive">
    <comment>BlueArkive Meeting File</comment>
    <glob pattern="*.pnotes"/>
    <icon name="bluearkive"/>
  </mime-type>
</mime-info>
EOF

# Update icon cache
if command -v gtk-update-icon-cache &> /dev/null; then
    gtk-update-icon-cache -f -t /usr/share/icons/hicolor
fi

echo "BlueArkive installation complete!"
