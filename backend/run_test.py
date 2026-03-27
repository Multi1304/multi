import subprocess
import os

def run_test():
    cmd = "npx vitest run tests/hotmail_logic_e2e.test.ts --reporter verbose"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print("STDOUT:")
    print(result.stdout)
    print("STDERR:")
    print(result.stderr)

if __name__ == "__main__":
    run_test()
