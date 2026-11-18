OUTLIER - OFFLINE PACKAGE ({DATE})
=================================

Everything needed to run Outlier on a network with no internet access: the game, its source code,
all build dependencies, Node.js {NODE} for Windows and Linux, and {PROMPTS} questions
({EN} in English, {HE} in Hebrew). Nothing is downloaded at run time.
Docker image included: {DOCKER}


1. START IT
-----------

Windows (x64):
    Double-click start-windows.bat

Linux (x64, glibc: Ubuntu, Debian, RHEL, ...):
    sh start-linux.sh
    (The first run unpacks Node.js into runtime/linux-x64.)
    No "unzip" on the machine? Use:  python3 -m zipfile -e outlier-offline-{DATE}.zip .

Docker (Linux x64), if the docker folder is here:
    cd docker
    docker load -i outlier-image.tar.gz
    docker compose up -d
    Set TZ in docker-compose.yml to your time zone. The data lives in the "outlier-data" volume.

Kubernetes (Helm 3), if the docker folder is here:
    Load docker/outlier-image.tar.gz into your registry or nodes, then
    helm install outlier kubernetes/outlier -n outlier --create-namespace
    Full steps (registry, k3s, kind, containerd, Ingress, storage): kubernetes/outlier/README.md

Then open http://<this-computer>:8080 in a browser.
The first time, the console (or "docker compose logs") prints a setup link with a setup code:
open it to create the admin account. Players can then sign up, or press "Play now" to play as a guest.


2. WHERE THINGS ARE
-------------------

  outlier/            the full source code (with git history), the built web app (dist/web) and node_modules
  outlier/data/       the database and the log, created on the first start: back this folder up
  outlier/config.json port (default 8080), host, data folder, optional TLS certificate and key
  outlier/bank/packs/ the question packs; they are added to the database on start, each file once
  runtime/            Node.js for Windows (win-x64) and Linux (the .tar.xz)
  docker/             the Docker image and a docker-compose.yml
  kubernetes/outlier/ the Helm chart
  SHA256SUMS.txt      checksums of the large files

The new daily puzzle starts at midnight in the server's time zone. You can change the time zone and the hour
the day starts in Admin -> Settings.


3. ADMIN COMMANDS
-----------------

Run them with the server stopped. They work from start-windows.bat and start-linux.sh the same way:

    start-windows.bat reset-password <username>   print a temporary password for a user
    start-windows.bat make-admin <username>       give a user admin rights
    start-windows.bat backup <file.db>            write a copy of the database
    start-windows.bat import <file> [--update]    add questions from a .json, .txt or .csv pack

Paths are relative to the "outlier" folder, so full paths are easiest.
Admins can also do most of this in the browser: Admin -> Questions, Import/Export, Users, Settings.


4. MORE QUESTIONS
-----------------

Every daily puzzle uses brand-new questions that were never used before. The bank has {PROMPTS} questions;
with 6 per day that is a long time, and Admin -> Overview shows how many unused ones are left.
Add more any time: drop a new pack file in outlier/bank/packs and restart, or upload it in Admin -> Import/Export.
The format is described in outlier/README.md; check a file with:

    runtime\win-x64\node.exe outlier\tools\validate-bank.ts <file>            (Windows)
    runtime/linux-x64/bin/node outlier/tools/validate-bank.ts <file>          (Linux)


5. CHANGE AND REBUILD (OPTIONAL)
--------------------------------

Everything needed is already in outlier/node_modules, including the Linux builds of the native packages.

Windows (in the outlier folder):
    ..\runtime\win-x64\npm.cmd run build          rebuild the web app into dist/web
    ..\runtime\win-x64\npm.cmd run test:server    run the server tests
    ..\runtime\win-x64\npm.cmd run typecheck

Linux (in the outlier folder, after start-linux.sh has run once):
    export PATH="$PWD/../runtime/linux-x64/bin:$PATH"
    npm rebuild --offline                         once, to set up node_modules/.bin for Linux
    npm run build
    npm run test:server

Then start the server again. The browser tests (npm run e2e) need a Playwright browser and are not included.
