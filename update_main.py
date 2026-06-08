import sys
content = open('/Users/sossa/IA/generador-licencias/main.js').read()

content = content.replace("'sossa_producer_config'", "`${window.currentUser}_producer_config`")
content = content.replace("'sossa_license_history'", "`${window.currentUser}_license_history`")
content = content.replace("'sossa_contacts'", "`${window.currentUser}_contacts`")
content = content.replace("'sossa_beats'", "`${window.currentUser}_beats`")

content = content.replace("fetch('/api/save-local'", "fetch(`/api/save-local?user=${window.currentUser}`")
content = content.replace("fetch('/api/load-local'", "fetch(`/api/load-local?user=${window.currentUser}`")

open('/Users/sossa/IA/generador-licencias/main.js', 'w').write(content)
print("Updated main.js")
