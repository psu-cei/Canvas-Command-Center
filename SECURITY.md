# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report it privately through GitHub: open the repository's **Security** tab and select **Report a vulnerability**. Include what you found, how to reproduce it, and what it could affect.

<!-- TODO: the repository owner needs to enable private vulnerability reporting (Settings > Code security) or add a contact email here. -->

## Scope

This project runs a local proxy that holds a Canvas Access Token. Issues of particular interest:

- Any way for the token in `proxy/.env` to reach the browser, a log, or a third party
- Any way to make the proxy send a request other than `GET`, or to a Canvas endpoint outside its allowlist
- Any way for another website or device to read data through the proxy
- Script execution from Canvas page content shown in the dashboard

## If your token is exposed

Revoke it in Canvas right away (or through your institution's help desk) and request a new one. Removing a token from files does not remove it from git history.
