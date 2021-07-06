/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require("fs");
const https = require("https");
const { spawnSync } = require("child_process");
const { installBrowsersWithProgressBar } = require('./lib/install/installer');

installBrowsersWithProgressBar();

// Install replay enabled browsers.
if (!process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) {
  replayInstall();
}

async function replayInstall() {
  console.log("Installing replay browsers...");
  switch (process.platform) {
    case "darwin":
      await installReplayBrowser("macOS-replay-playwright.tar.xz", "firefox", "firefox");
      break;
    case "linux":
      await installReplayBrowser("linux-replay-playwright.tar.xz", "firefox", "firefox");
      await installReplayBrowser("linux-replay-chromium.tar.xz", "replay-chromium", "chrome-linux");
      break;
  }
  console.log("Done.");
}

async function installReplayBrowser(name, srcName, dstName) {
  const replayDir = process.env.RECORD_REPLAY_DIRECTORY || `${process.env.HOME}/.replay`;
  if (fs.existsSync(`${replayDir}/playwright/${dstName}`)) {
    return;
  }

  const contents = await downloadReplayFile(name);

  for (const dir of [replayDir, `${replayDir}/playwright`]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  }
  fs.writeFileSync(`${replayDir}/playwright/${name}`, contents);
  spawnSync("tar", ["xf", name], { cwd: `${replayDir}/playwright` });
  fs.unlinkSync(`${replayDir}/playwright/${name}`);

  if (srcName != dstName) {
    fs.renameSync(`${replayDir}/playwright/${srcName}`, `${replayDir}/playwright/${dstName}`);
  }
}

async function downloadReplayFile(downloadFile) {
  const options = {
    host: "replay.io",
    port: 443,
    path: `/downloads/${downloadFile}`,
  };

  for (let i = 0; i < 5; i++) {
    const waiter = defer();
    const request = https.get(options, response => {
      if (response.statusCode != 200) {
        console.log(`Download received status code ${response.statusCode}, retrying...`);
        request.destroy();
        waiter.resolve(null);
        return;
      }
      const buffers = [];
      response.on("data", data => buffers.push(data));
      response.on("end", () => waiter.resolve(buffers));
    });
    request.on("error", err => {
      console.log(`Download error ${err}, retrying...`);
      request.destroy();
      waiter.resolve(null);
    });
    const buffers = await waiter.promise;
    if (buffers) {
      return Buffer.concat(buffers);
    }
  }

  throw new Error("Download failed, giving up");
}

function defer() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
