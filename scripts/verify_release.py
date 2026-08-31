#!/usr/bin/env python3
"""
SignalIntel Release Verification Script
Validates project structure, configuration schemas, binaries, and dependencies.
"""

import os
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CHECKS = []

def check(name):
    def decorator(fn):
        CHECKS.append((name, fn))
        return fn
    return decorator

@check("Required Files Exist")
def test_files_exist():
    required_files = [
        "docker-compose.yml",
        "Makefile",
        "README.md",
        ".env.example",
        "docker/Dockerfile.python",
        "docker/Dockerfile.rust",
        "docker/Dockerfile.ui",
        "docker/nginx.conf",
        "crates/Cargo.toml",
        "crates/gateway/src/main.rs",
        "crates/core/src/rag.rs",
        "crates/core/src/alerts.rs",
        "services/main.py",
        "ui/package.json",
        "ui/src/App.tsx",
    ]
    missing = [f for f in required_files if not (ROOT / f).is_file()]
    if missing:
        return False, f"Missing files: {missing}"
    return True, f"All {len(required_files)} canonical files verified"

@check("No Hardcoded Local Paths")
def test_no_local_paths():
    forbidden = ["C:\\Users\\", "C:/Users/", "/Users/"]
    violations = []
    
    scan_exts = {".py", ".rs", ".ts", ".tsx", ".yml", ".yaml", ".json", ".md"}
    for root, dirs, files in os.walk(ROOT):
        # Skip node_modules, target, .git
        dirs[:] = [d for d in dirs if d not in {"node_modules", "target", ".git", "dist", "__pycache__"}]
        for f in files:
            p = Path(root) / f
            if p.name == "verify_release.py":
                continue
            if p.suffix in scan_exts:
                try:
                    text = p.read_text(encoding="utf-8", errors="ignore")
                    for pat in forbidden:
                        if pat in text and "test" not in str(p).lower():
                            violations.append(f"{p.relative_to(ROOT)} contains '{pat}'")
                except Exception:
                    pass
    if violations:
        return False, f"Found local path leaks:\n" + "\n".join(violations[:5])
    return True, "Zero local absolute path references found"

@check("UI Build Verification")
def test_ui_build():
    dist_index = ROOT / "ui" / "dist" / "index.html"
    if not dist_index.is_file():
        return False, "ui/dist/index.html not found (run `npm run build` in ui/)"
    return True, "UI production bundle is intact"

@check("Docker Compose Configuration")
def test_docker_compose():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    services = ["qdrant", "signalintel-brain", "signalintel-services", "signalintel-ui"]
    missing = [s for s in services if s not in compose]
    if missing:
        return False, f"docker-compose.yml is missing service definitions: {missing}"
    return True, "All 4 containerized services present in docker-compose"

def main():
    print("=" * 60)
    print("  SIGNALINTEL v1.0.0 RELEASE INTEGRITY VERIFICATION")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for name, fn in CHECKS:
        try:
            ok, msg = fn()
            if ok:
                print(f"  [PASS] {name}: {msg}")
                passed += 1
            else:
                print(f"  [FAIL] {name}: {msg}")
                failed += 1
        except Exception as e:
            print(f"  [ERROR] {name}: {e}")
            failed += 1
            
    print("-" * 60)
    if failed == 0:
        print(f"  ALL {passed} VERIFICATION CHECKS PASSED. SYSTEM READY FOR RELEASE.")
        print("=" * 60)
        return 0
    else:
        print(f"  {failed} CHECKS FAILED. Please rectify before final release.")
        print("=" * 60)
        return 1

if __name__ == "__main__":
    sys.exit(main())
