"""Verify anonymous registry access to the manifest and every layer, without local Docker."""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location("policy", pathlib.Path(__file__).with_name("check-public-image.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected:
            redirected.remove_header("Authorization")
        return redirected


def verify(app, tag):
    name = "juanmateixido/rbln-cal-" + app
    opener = urllib.request.build_opener(SafeRedirect())
    with opener.open("https://ghcr.io/token?service=ghcr.io&scope=repository:" + name + ":pull", timeout=20) as response:
        token = json.load(response)["token"]
    headers = {"Authorization": "Bearer " + token,
               "Accept": "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json"}

    def fetch(path, method="GET"):
        request = urllib.request.Request("https://ghcr.io/v2/" + name + path, headers=headers, method=method)
        return opener.open(request, timeout=30)

    with fetch("/manifests/" + tag) as response:
        raw = response.read(4 * 1024 * 1024)
    digest = "sha256:" + hashlib.sha256(raw).hexdigest()
    manifest = json.loads(raw)
    if "manifests" in manifest:
        raise RuntimeError("Expected a single amd64 image manifest")
    with fetch("/blobs/" + manifest["config"]["digest"]) as response:
        config = json.load(response)
    expected = tag.removeprefix("sha-")
    if config.get("config", {}).get("Labels", {}).get("org.opencontainers.image.revision") != expected:
        raise RuntimeError("Image revision does not match the requested SHA")
    metadata = json.dumps(config.get("config", {}).get("Env", []))
    metadata += json.dumps([item.get("created_by", "") for item in config.get("history", [])])
    if policy.private_names(metadata):
        raise RuntimeError("Private names found in image metadata; publication gate remains closed")
    for layer in manifest["layers"]:
        with fetch("/blobs/" + layer["digest"], "HEAD") as response:
            if response.status != 200:
                raise RuntimeError("Layer is not anonymously readable")
    print("ghcr.io/" + name + "@" + digest + ": anonymous manifest/config/all layers PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("tag")
    args = parser.parse_args()
    if not re.fullmatch(r"sha-[0-9a-f]{40}", args.tag):
        raise SystemExit("Expected sha-<40 lowercase hex characters>")
    try:
        for application in ("web", "api"):
            verify(application, args.tag)
    except (urllib.error.URLError, KeyError, ValueError, RuntimeError) as error:
        # Registry errors and redirects may include ephemeral access URLs/tokens.
        raise SystemExit("Anonymous image verification failed (" + type(error).__name__ + "); no credentials used") from None
