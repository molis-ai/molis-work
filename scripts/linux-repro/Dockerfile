# A Linux close to the full suite's runner (.github/workflows/full-suite.yml), for running a few test files on a development Mac:
# the same fonts (DejaVu and Liberation, with WenQuanYi Zen Hei for Chinese, as the runner installs), Node 24.15 and a Chromium.
# It is not the runner: it is Debian, not Ubuntu; Debian's Chromium (one or two versions apart), not Google Chrome; the Mac's CPU
# architecture and speed, not the runner's (about three times slower). Fonts and layout match; timing does not, so for a race
# also set MOLIS_WORK_TEST_CPU_THROTTLE (tests/fixtures/goal-browser.ts). Built and run by scripts/linux-repro.mjs.
FROM debian:trixie
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates curl git xz-utils python3 make g++ \
    fonts-dejavu-core fonts-liberation fonts-wqy-zenhei fontconfig chromium && rm -rf /var/lib/apt/lists/*
ARG NODE_VERSION=24.15.0
RUN arch="$(dpkg --print-architecture | sed 's/amd64/x64/')" \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz" | tar -xJ -C /usr/local --strip-components=1 \
 && node --version && chromium --version
# The runner's wrapper: no sandbox, for a kernel that restricts unprivileged user namespaces (here: a container).
RUN printf '#!/bin/sh\nexec /usr/bin/chromium --no-sandbox "$@"\n' > /usr/local/bin/chrome-ci && chmod +x /usr/local/bin/chrome-ci
RUN useradd -m runner
USER runner
WORKDIR /home/runner
ENV MOLIS_WORK_TEST_CHROME=/usr/local/bin/chrome-ci MOLIS_WORK_BROWSER_PATH=/usr/local/bin/chrome-ci \
    MOLIS_WORK_TEST_JOBS=1 MOLIS_WORK_TEST_BROWSER_JOBS=1 PATH=/home/runner/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
