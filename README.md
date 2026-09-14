# VCA Muzon Website (UAT)

This repository contains the User Acceptance Testing (UAT) version of the
Victory Churches of Asia - Muzon website.

Purpose:
- Review new features
- Pastor approval
- Testing before production

Production website:
https://vcamuzon.org/

This is the canonical public production identity. This repository is the separate
UAT environment used to review changes before production promotion.

## Development workflow

Changes are implemented and reviewed in this UAT repository before approval
and promotion to the production website. Each completed milestone should be
validated locally, committed with a focused message, pushed to the UAT branch,
and confirmed through the repository's GitHub Actions checks when available.

## Progress

- [x] About Hero Video milestone
  - Replaced the About page static hero presentation with a looping drone video.
  - Retained the existing church image as the poster and fallback.
  - Tuned responsive video framing to `62% center` on desktop, `66% center` on
    tablets and mobile devices, and `72% center` on small phones.
  - Preserved autoplay compatibility with `muted`, `playsinline`, and `loop`.
  - Preserved reduced-motion accessibility by hiding the video and displaying
    the fallback image when reduced motion is requested.
  - Removed obsolete About hero background styles, empty portrait-tablet media
    queries, and duplicate CSS declarations.

## Release notes

### UAT - About Hero Video

The About page now uses responsive drone footage in its hero area while keeping
the original church image as a reliable poster and accessibility fallback. The
associated stylesheet cleanup consolidates superseded component rules and
removes empty responsive blocks. Validation confirmed balanced CSS braces and a
clean `git diff --cached --check` result before publication.
