# Security policy

mycontext stores personal data, so security problems matter.

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub: [report a vulnerability](https://github.com/bencoleman24/mycontext/security/advisories/new).

Include what's affected, how to reproduce it, and what someone could do with it. Don't include real personal data.

mycontext is maintained by one person, so responses and fixes are best effort.

## What counts

For example:

- Data leaving your machine that you didn't ask to send, beyond the network calls listed in the README's [privacy section](README.md#privacy)
- The web UI or HTTP API being reachable from other machines
- Reading or writing files outside the data folder, such as through file uploads or downloads
- Crafted input that corrupts or deletes data

Someone who already has access to your user account being able to read your data folder isn't a vulnerability. Plain files you can read yourself are the point of the design.

## Supported versions

Only the latest version on `main` gets fixes.
