"""Fail pairing builds when the two APKs have different identities or certificates."""
import os
import pathlib
import re
import subprocess
import sys

sdk = pathlib.Path(os.environ.get("ANDROID_HOME", os.environ.get("ANDROID_SDK_ROOT", "")))
versions = sorted((sdk / "build-tools").iterdir(), key=lambda p: tuple(int(v) for v in re.findall(r"\d+", p.name)))
apksigner = str(versions[-1] / "apksigner")
certificates = []
for apk in sys.argv[1:]:
    output = subprocess.check_output([apksigner, "verify", "--print-certs", apk], text=True)
    match = re.search(r"Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)", output)
    if not match:
        raise AssertionError("Missing signing certificate: " + apk)
    certificates.append(match.group(1).lower())
if len(certificates) != 2 or len(set(certificates)) != 1:
    raise AssertionError("Phone and Wear OS certificates do not match")
print("Phone and Wear OS APKs use the same SHA-256 signing certificate")
