import subprocess
import time
import sys

print("Launching Chrome in headless mode...")
cmd = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "--headless",
    "--disable-gpu",
    "--enable-logging",
    "--v=1",
    "https://generador-licencias.vercel.app"
]

proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

# Let it run for 6 seconds to load JavaScript and execute it
time.sleep(6)

# Terminate process
proc.terminate()

stdout, stderr = proc.communicate()

print("--- CHROME STDOUT ---")
print(stdout)
print("--- CHROME STDERR ---")
print(stderr)
