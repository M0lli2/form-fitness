"""Validate paired APK certificates; tolerate Android SDK signer label variations."""
import os
import pathlib
import re
import subprocess
import sys

def certificate_digest(output):
    match = re.search(r"^Signer.*certificate SHA-256 digest:\s*([0-9a-fA-F:]+)", output, re.MULTILINE)
    if not match:
        raise AssertionError("Missing signer certificate in apksigner output:\n" + output)
    digest = match.group(1).replace(":", "").lower()
    if len(digest) != 64:
        raise AssertionError("Invalid SHA-256 certificate digest")
    return digest

if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        value = "ab" * 32
        for label in ["Signer #1", "Signer (minSdkVersion=28, maxSdkVersion=2147483647)"]:
            assert certificate_digest(label + " certificate SHA-256 digest: " + value) == value
        assert certificate_digest("Signer #1 certificate SHA-256 digest: " + ":".join(["AB"]*32)) == value
        try:
            certificate_digest("Verified but no signer digest")
        except AssertionError:
            pass
        else:
            raise AssertionError("Missing certificate must fail")
        print("Certificate parser regression fixtures passed")
    else:
        sdk = pathlib.Path(os.environ.get("ANDROID_HOME", os.environ.get("ANDROID_SDK_ROOT", "")))
        versions = sorted((sdk / "build-tools").iterdir(), key=lambda p: tuple(int(v) for v in re.findall(r"\d+", p.name)))
        certificates = []
        for apk in sys.argv[1:]:
            output = subprocess.check_output([str(versions[-1] / "apksigner"), "verify", "--verbose", "--print-certs", apk], text=True)
            print(output, flush=True)
            certificates.append(certificate_digest(output))
        if len(certificates) != 2 or len(set(certificates)) != 1:
            raise AssertionError("Phone and Wear OS certificates do not match")
        print("Phone and Wear OS APKs use the same SHA-256 signing certificate")
