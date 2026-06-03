import re

with open('/Users/piyushkumar/Desktop/1.piynoteskiro/src/renderer/components/settings/SettingsView.tsx', 'r') as f:
    code = f.read()

# Fix duplicates
code = code.replace("content: (\n      content: (", "content: (")
code = code.replace("),\n      ),", "),")

# Change outer wrapper usage in the mapping
# Find: {sec.isCustomLayout ? (\n            sec.content\n          ) : (\n            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-2xl overflow-hidden shadow-sm">\n              <div className="flex flex-col divide-y divide-[var(--color-border-subtle)]">\n                {sec.content}\n              </div>\n            </div>\n          )}
old_render = """{sec.isCustomLayout ? (
            sec.content
          ) : (
            <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-2xl overflow-hidden shadow-sm">
              <div className="flex flex-col divide-y divide-[var(--color-border-subtle)]">
                {sec.content}
              </div>
            </div>
          )}"""
new_render = "{sec.content}"
code = code.replace(old_render, new_render)

# Now, we need to replace the nested cards and padding.
# The previous nested card:
# <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-2xl overflow-hidden shadow-sm">\n              <div className="flex flex-col divide-y divide-[var(--color-border-subtle)]">
old_card = """<div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-2xl overflow-hidden shadow-sm">
              <div className="flex flex-col divide-y divide-[var(--color-border-subtle)]">"""
new_card = """<div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm">
              <div className="flex flex-col gap-1">"""
code = code.replace(old_card, new_card)

# Account section didn't have this exact inner wrapper. Account section was using the outer wrapper.
# Wait, if we replace old_render with new_render, Account section will have NO wrapper!
# So we need to manually add the wrapper to the Account section.
# We will do a targeted regex replace for the Account section content.
